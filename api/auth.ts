/**
 * Google OAuth refresh-token backend for the WEB app (Vercel serverless function).
 *
 * Why this exists: Google only issues a refresh token to a confidential client (one
 * holding the OAuth client secret), so a pure SPA has to re-run the interactive sign-in
 * every time its 1-hour access token expires. This function holds the secret, keeps the
 * refresh token in an encrypted HttpOnly cookie the page's JavaScript can never read,
 * and mints fresh access tokens on demand — so the user signs in once per week.
 *
 * Routes (wired in vercel.json → /api/auth.ts?action=…), all POST, same-origin only:
 *   /api/auth/exchange  { code, codeVerifier, redirectUri } → tokens + profile, sets cookie
 *   /api/auth/token     → fresh access token from the cookie (401 when expired/missing)
 *   /api/auth/logout    → revokes the refresh token at Google and clears the cookie
 *
 * Session length: hard cap of SESSION_MAX_AGE_S (7 days) from the interactive sign-in.
 * Refreshing does NOT extend it — the cookie's issued-at is preserved on every refresh.
 *
 * Env (Vercel project settings):
 *   GOOGLE_CLIENT_SECRET   required — the web OAuth client's secret
 *   GOOGLE_CLIENT_ID       optional — falls back to VITE_GOOGLE_CLIENT_ID
 *   AUTH_COOKIE_SECRET     optional — cookie encryption key material; falls back to a
 *                          key derived from GOOGLE_CLIENT_SECRET
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;
const COOKIE_NAME = 'ff_rt';
const COOKIE_PATH = '/api/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

interface SessionCookie {
  /** Google refresh token. */
  rt: string;
  /** Issued-at (epoch seconds) of the interactive sign-in — never moved by a refresh. */
  iat: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  if (!id) throw new ConfigError('GOOGLE_CLIENT_ID (or VITE_GOOGLE_CLIENT_ID) is not set');
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new ConfigError('GOOGLE_CLIENT_SECRET is not set');
  return secret;
}

let cachedKey: Buffer | null = null;
function cookieKey(): Buffer {
  if (cachedKey) return cachedKey;
  const material = process.env.AUTH_COOKIE_SECRET || clientSecret();
  cachedKey = Buffer.from(hkdfSync('sha256', material, 'finflow-auth', 'refresh-cookie-v1', 32));
  return cachedKey;
}

class ConfigError extends Error {}

// ---------------------------------------------------------------------------
// Cookie crypto (AES-256-GCM)
// ---------------------------------------------------------------------------

function seal(data: SessionCookie): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

function unseal(value: string): SessionCookie | null {
  try {
    const raw = Buffer.from(value, 'base64url');
    if (raw.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(json) as SessionCookie;
    if (typeof parsed.rt !== 'string' || typeof parsed.iat !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function readCookie(req: Req): SessionCookie | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return unseal(rest.join('='));
  }
  return null;
}

function setSessionCookie(res: ServerResponse, session: SessionCookie): void {
  const remaining = session.iat + SESSION_MAX_AGE_S - Math.floor(Date.now() / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${seal(session)}; Path=${COOKIE_PATH}; Max-Age=${Math.max(remaining, 0)}; HttpOnly; Secure; SameSite=Strict`,
  );
}

function clearSessionCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}

function sessionExpired(session: SessionCookie): boolean {
  return Math.floor(Date.now() / 1000) >= session.iat + SESSION_MAX_AGE_S;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: Req): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

/**
 * Same-origin guard. The cookie is SameSite=Strict already; this also rejects a
 * cross-site POST to /exchange (login CSRF) and anything not sent by our own page.
 */
function isSameOrigin(req: Req): boolean {
  const origin = req.headers.origin;
  const forwarded = req.headers['x-forwarded-host'];
  const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function getAction(req: Req): string {
  const q = req.query?.action;
  if (typeof q === 'string') return q;
  const url = new URL(req.url ?? '/', 'http://localhost');
  return url.searchParams.get('action') ?? url.pathname.split('/').pop() ?? '';
}

async function googleToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
  });
  return (await resp.json()) as GoogleTokenResponse;
}

/** Decodes the id_token payload. Not signature-verified: it came straight from Google's token endpoint over TLS. */
function profileFromIdToken(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return {
      name: (payload.name as string) || '',
      email: (payload.email as string) || '',
      picture: (payload.picture as string) || '',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleExchange(req: Req, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const code = typeof body.code === 'string' ? body.code : '';
  const codeVerifier = typeof body.codeVerifier === 'string' ? body.codeVerifier : '';
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : '';
  if (!code || !codeVerifier || !redirectUri) return send(res, 400, { error: 'missing_parameters' });

  // The redirect URI must be our own /login page (the one registered with Google).
  const origin = req.headers.origin as string;
  if (redirectUri !== `${origin}/login`) return send(res, 400, { error: 'bad_redirect_uri' });

  const tokens = await googleToken({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
  if (!tokens.access_token) {
    return send(res, 400, { error: tokens.error || 'exchange_failed', detail: tokens.error_description });
  }

  if (tokens.refresh_token) {
    setSessionCookie(res, { rt: tokens.refresh_token, iat: Math.floor(Date.now() / 1000) });
  }

  send(res, 200, {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    profile: profileFromIdToken(tokens.id_token),
    // False only if Google withheld a refresh token; the client then falls back to hourly sign-in.
    persistent: !!tokens.refresh_token,
  });
}

async function handleToken(req: Req, res: ServerResponse): Promise<void> {
  const session = readCookie(req);
  if (!session) return send(res, 401, { error: 'no_session' });
  if (sessionExpired(session)) {
    clearSessionCookie(res);
    return send(res, 401, { error: 'session_expired' });
  }

  const tokens = await googleToken({ grant_type: 'refresh_token', refresh_token: session.rt });
  if (!tokens.access_token) {
    // invalid_grant = revoked / expired at Google → the user must sign in again.
    if (tokens.error === 'invalid_grant') {
      clearSessionCookie(res);
      return send(res, 401, { error: 'invalid_grant' });
    }
    return send(res, 502, { error: tokens.error || 'refresh_failed' });
  }

  // Google may rotate the refresh token; keep the ORIGINAL issued-at so the 7-day cap holds.
  if (tokens.refresh_token && tokens.refresh_token !== session.rt) {
    setSessionCookie(res, { rt: tokens.refresh_token, iat: session.iat });
  }

  const expiresAt = Math.min(
    Date.now() + (tokens.expires_in ?? 3600) * 1000,
    (session.iat + SESSION_MAX_AGE_S) * 1000,
  );
  send(res, 200, { accessToken: tokens.access_token, expiresAt });
}

async function handleLogout(req: Req, res: ServerResponse): Promise<void> {
  const session = readCookie(req);
  clearSessionCookie(res);
  if (session) {
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: session.rt }),
      });
    } catch {
      // Best effort — the cookie is gone either way.
    }
  }
  send(res, 200, { ok: true });
}

export default async function handler(req: Req, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!isSameOrigin(req)) return send(res, 403, { error: 'forbidden' });

  try {
    switch (getAction(req)) {
      case 'exchange':
        return await handleExchange(req, res);
      case 'token':
        return await handleToken(req, res);
      case 'logout':
        return await handleLogout(req, res);
      default:
        return send(res, 404, { error: 'not_found' });
    }
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error('[auth] misconfigured:', error.message);
      return send(res, 500, { error: 'server_misconfigured' });
    }
    console.error('[auth] unexpected error:', error);
    return send(res, 500, { error: 'internal_error' });
  }
}
