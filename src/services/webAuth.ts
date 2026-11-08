/**
 * Web-only Google sign-in that yields a 7-day session.
 *
 * The SocialLogin plugin's web flow uses the implicit grant (access token only, no
 * refresh) — so every hour the user had to sign in again. Here we run the
 * authorization-code flow ourselves (with PKCE, `access_type=offline`) in a popup and
 * hand the code to our Vercel function (`api/auth.ts`), which keeps the refresh token
 * in an HttpOnly cookie and mints new access tokens via `/api/auth/token`.
 *
 * Popup lifecycle:
 *   opener  → openPopup() synchronously (inside the click gesture), then navigates it to Google
 *   Google  → redirects the popup to /login?code=…&state=…
 *   popup   → main.tsx calls completeWebAuthInPopup() BEFORE rendering the app; it POSTs the
 *             code to /api/auth/exchange (which sets the cookie) and broadcasts the result
 *   opener  → receives it on a BroadcastChannel / postMessage and resolves login
 */

const PENDING_KEY = 'ff_oauth_pending';
const CHANNEL = 'finflow-google-auth';
const MESSAGE_TYPE = 'finflow-google-auth';
/** The plugin's own pending-login marker. A stale one would make the plugin hijack our popup. */
const PLUGIN_PENDING_KEY = 'social_login_oauth_pending';
const LOGIN_TIMEOUT_MS = 5 * 60_000;

export const WEB_AUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
];

export interface WebAuthResult {
  accessToken: string;
  expiresAt: number;
  profile: { name: string; email: string; picture: string } | null;
}

interface PendingLogin {
  state: string;
  codeVerifier: string;
  createdAt: number;
}

type PopupMessage =
  | { type: typeof MESSAGE_TYPE; state: string; ok: true; result: WebAuthResult }
  | { type: typeof MESSAGE_TYPE; state: string; ok: false; error: string };

/** Thrown by fetchWebAccessToken() when the server has no (or an expired) session. */
export class WebSessionMissingError extends Error {}

function redirectUri(): string {
  return `${window.location.origin}/login`;
}

function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

function base64url(buf: Uint8Array): string {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

async function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? '{}' : JSON.stringify(body),
  });
}

/**
 * Opens the sign-in popup and resolves with tokens + profile. MUST be called
 * synchronously from a click handler (no `await` before it) — the popup is opened on
 * the first line so browsers attribute it to the user gesture.
 */
export function loginWithGoogleWeb(clientId: string): Promise<WebAuthResult> {
  const popup = window.open('', 'finflow-google-signin', popupFeatures());
  if (!popup) return Promise.reject(new Error('Failed to open popup'));

  const state = randomString(16);
  const codeVerifier = randomString(48);
  try {
    localStorage.removeItem(PLUGIN_PENDING_KEY);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ state, codeVerifier, createdAt: Date.now() } satisfies PendingLogin));
  } catch {
    popup.close();
    return Promise.reject(new Error('Storage unavailable; cannot start sign-in'));
  }

  return new Promise<WebAuthResult>((resolve, reject) => {
    let settled = false;
    let channel: BroadcastChannel | null = null;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(closedPoll);
      clearTimeout(timeout);
      window.removeEventListener('message', onWindowMessage);
      channel?.close();
      fn();
    };

    const handle = (data: unknown) => {
      const msg = data as PopupMessage | null;
      if (!msg || msg.type !== MESSAGE_TYPE || msg.state !== state) return;
      if (msg.ok) finish(() => resolve(msg.result));
      else finish(() => reject(new Error(msg.error)));
    };

    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin) handle(event.data);
    };

    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event) => handle(event.data);
    } catch {
      // No BroadcastChannel — rely on postMessage.
    }
    window.addEventListener('message', onWindowMessage);

    const timeout = setTimeout(() => {
      try { popup.close(); } catch { /* ignore */ }
      finish(() => reject(new Error('OAuth timeout')));
    }, LOGIN_TIMEOUT_MS);

    // Give the popup a short grace period after it closes: the result message may still be in flight.
    const closedPoll = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(closedPoll);
          setTimeout(() => finish(() => reject(new Error('Popup closed'))), 1500);
        }
      } catch {
        clearInterval(closedPoll);
      }
    }, 1000);

    void (async () => {
      try {
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri(),
          response_type: 'code',
          scope: WEB_AUTH_SCOPES.join(' '),
          access_type: 'offline',
          // Forces Google to issue a refresh token on every sign-in (it otherwise only
          // does so on the very first consent).
          prompt: 'consent',
          include_granted_scopes: 'true',
          state,
          code_challenge: await pkceChallenge(codeVerifier),
          code_challenge_method: 'S256',
        });
        popup.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      } catch (error) {
        try { popup.close(); } catch { /* ignore */ }
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    })();
  });
}

function popupFeatures(): string {
  const width = 500;
  const height = 600;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  return `width=${width},height=${height},left=${left},top=${top},popup=1`;
}

/**
 * Called from main.tsx before the app renders. If this window is our sign-in popup
 * returning from Google, finishes the code exchange, reports the result to the opener
 * and closes itself; returns true so the caller skips rendering the app. Returns false
 * for every normal page load.
 */
export function completeWebAuthInPopup(): boolean {
  if (window.location.pathname !== '/login') return false;
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  if (!state || (!params.has('code') && !params.has('error'))) return false;

  let pending: PendingLogin | null = null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    pending = raw ? (JSON.parse(raw) as PendingLogin) : null;
  } catch {
    pending = null;
  }
  // Not ours (or stale) — let the app handle the URL normally.
  if (!pending || pending.state !== state) return false;

  document.body.textContent = '…';

  const report = (msg: PopupMessage) => {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(msg);
      channel.close();
    } catch { /* ignore */ }
    try { window.opener?.postMessage(msg, window.location.origin); } catch { /* ignore */ }
    setTimeout(() => window.close(), 100);
  };

  const error = params.get('error');
  if (error) {
    report({ type: MESSAGE_TYPE, state, ok: false, error: error === 'access_denied' ? 'User cancelled the OAuth flow' : error });
    return true;
  }

  void (async () => {
    try {
      const resp = await postJson('/api/auth/exchange', {
        code: params.get('code'),
        codeVerifier: pending!.codeVerifier,
        redirectUri: redirectUri(),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.accessToken) {
        throw new Error(data.error ? `Sign-in failed: ${data.error}` : `Sign-in failed (${resp.status})`);
      }
      report({
        type: MESSAGE_TYPE,
        state,
        ok: true,
        result: { accessToken: data.accessToken, expiresAt: data.expiresAt, profile: data.profile ?? null },
      });
    } catch (e) {
      report({ type: MESSAGE_TYPE, state, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return true;
}

/** Gets a fresh access token from the server session. Throws WebSessionMissingError when signed out / past 7 days. */
export async function fetchWebAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
  const resp = await postJson('/api/auth/token');
  if (resp.status === 401) throw new WebSessionMissingError('No server session');
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.accessToken) throw new Error(`Token refresh failed (${resp.status})`);
  return { accessToken: data.accessToken, expiresAt: data.expiresAt };
}

/** Ends the server session (revokes the refresh token, clears the cookie). Best effort. */
export async function logoutWeb(): Promise<void> {
  try {
    await postJson('/api/auth/logout');
  } catch {
    // ignore — local state is wiped by the caller regardless
  }
}
