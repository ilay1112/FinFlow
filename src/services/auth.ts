import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;

let isInitialized = false;
let initPromise: Promise<void> | null = null;

// Monotonic logout generation. getValidAccessToken() captures it on entry; a silent
// refresh that resolves after logout() bumped it is discarded instead of re-caching
// auth keys — the late localStorage write is what used to leave a live bearer token
// on disk after the logout wipe (shared-device hygiene, F-3).
let logoutEpoch = 0;

/**
 * Thrown when there is no usable access token and a silent refresh could not produce
 * one. Distinct from a network/quota failure so callers can react specifically — flip
 * the "session expired / reconnect" state instead of treating it as a transient blip.
 */
export class AuthExpiredError extends Error {
  constructor(message = 'No valid access token. Please sign in again.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

/** Native returns `{ token, expiresAt }`; web returns a bare string. */
type PluginAccessToken = string | { token: string; expiresAt?: number };
interface PluginRefreshResult {
  accessToken?: PluginAccessToken;
}
/**
 * `refresh` is present on the native plugin but not in the published web typings, so we
 * access it through a narrow optional-method shape rather than `any`.
 */
type SocialLoginWithRefresh = {
  refresh?: (options: { provider: 'google' }) => Promise<PluginRefreshResult>;
};

/**
 * True when an error from a Drive/Gmail call indicates the access token is no longer
 * accepted (HTTP 401/403) or our own AuthExpiredError. The Drive helpers throw
 * `Error("Drive API Error: 401 ...")`-style messages, so we match the status there as
 * well as on a structured `status` field if one is present.
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AuthExpiredError) return true;
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /\b(401|403)\b/.test(message);
}

export const authService = {
  /**
   * Initializes the SocialLogin plugin.
   * Required for Web to handle redirects and set the Client ID.
   */
  async initialize() {
    if (isInitialized) return;
    // Reuse the in-flight promise so concurrent callers share ONE plugin init.
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        await SocialLogin.initialize({
          google: {
            webClientId: GOOGLE_CLIENT_ID,
            iOSClientId: GOOGLE_IOS_CLIENT_ID,
            mode: 'online',
            // Pin the web OAuth redirect to ONE fixed URL. The plugin otherwise defaults
            // redirect_uri to `origin + current pathname`, so a login started from the
            // session-expired modal — which can appear on ANY route (/, /expenses,
            // /invoices…) — sends an unregistered redirect_uri and Google rejects it with
            // Error 400: redirect_uri_mismatch. Pinning to /login (already the redirect the
            // normal login-page flow uses, and already authorized in the Google console)
            // makes every login path use the same authorized URI. Only on web — native
            // uses its own reversed-client-id scheme, so we must not override it there.
            ...(Capacitor.isNativePlatform()
              ? {}
              : { redirectUrl: `${window.location.origin}/login` }),
          },
        });
        isInitialized = true;
      } catch (error) {
        // Clear the failed promise so the next caller retries cleanly instead of
        // awaiting a poisoned rejection forever.
        initPromise = null;
        console.error('SocialLogin initialization failed:', error);
        throw error;
      }
    })();

    return initPromise;
  },

  /**
   * Drops the cached init state and re-runs plugin initialization. Recovery path for
   * the Capacitor lazy web-plugin race: two concurrent FIRST calls to the plugin (e.g.
   * initialize() from main.tsx racing an early refresh() from AuthContext restore)
   * each construct their own SocialLoginWeb, and the cached instance can be the one
   * that never received the client id — after which login() throws "Google Client ID
   * not set". Re-initializing configures the instance the proxy actually cached.
   */
  async forceReinitialize() {
    isInitialized = false;
    initPromise = null;
    return this.initialize();
  },

  /**
   * Universal Login method for both Web and Native Android.
   */
  async loginWithGoogle() {
    try {
      // Ensure we are initialized before attempting login
      await this.initialize();

      const isNative = Capacitor.isNativePlatform();

      const loginOptions = {
        provider: 'google' as const,
        options: {
          scopes: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/gmail.send',
          ],
          // Platform-specific options
          ...(isNative ? {
            autoSelectEnabled: true,
            filterByAuthorizedAccounts: true,
          } : {
            // Web-specific options
            // We remove autoSelectEnabled/filterByAuthorizedAccounts as they are Android-only
            // and might cause issues with the web library.
            style: 'standard' as const,
          }),
        },
      };

      let response;
      try {
        response = await SocialLogin.login(loginOptions);
      } catch (error) {
        // Self-healing for the lazy web-plugin first-call race (see forceReinitialize):
        // if the cached plugin instance reports it was never configured, re-initialize
        // it and retry the login once.
        if (String(error).includes('Client ID not set')) {
          await this.forceReinitialize();
          response = await SocialLogin.login(loginOptions);
        } else {
          throw error;
        }
      }

      if (response.provider === 'google' && response.result) {
        return this.handleResult(response.result);
      }

      throw new Error('Google login failed or was cancelled');
    } catch (error) {
      console.error('Login Error:', error);
      throw error;
    }
  },

  /**
   * Attempts to verify if a session exists with the provider.
   */
  async checkSession() {
    try {
      // Serialize behind init (see getValidAccessToken) so this can never be the
      // plugin's racing first call.
      await this.initialize();
      const { isLoggedIn } = await SocialLogin.isLoggedIn({ provider: 'google' });
      return isLoggedIn;
    } catch (error) {
      console.error('Session check failed:', error);
      return false;
    }
  },

  /**
   * Internal helper to normalize the login/session result
   */
  handleResult(result: any) {
    // On native platforms, accessToken might be an object { token: string, expiresAt: number }
    // On web, it is often a direct string.
    const token = typeof result.accessToken === 'object' 
      ? result.accessToken.token 
      : result.accessToken;

    const rawPicture = result.profile?.image || result.profile?.picture || result.profile?.imageUrl;
    // Normalize Google picture URL for higher resolution and handle missing images
    const normalizedPicture = rawPicture 
      ? rawPicture.replace(/=s\d+-c$/, '=s192-c') 
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(result.profile?.name || 'User')}&background=random`;

    return {
      accessToken: token as string,
      idToken: result.idToken as string,
      profile: result.profile ? {
        name: result.profile.name || '',
        email: result.profile.email || '',
        picture: normalizedPicture,
      } : null
    };
  },

  /**
   * Universal Logout
   */
  async logout() {
    // Bump FIRST (before any await) so a refresh already in flight — foreground-resume
    // or the proactive pre-expiry timer — cannot re-write auth_token/auth_expiry after
    // the logout wipe, even if the plugin call below fails.
    logoutEpoch += 1;
    try {
      await SocialLogin.logout({ provider: 'google' });
    } catch (error) {
      console.error('Logout Error:', error);
    }
  },

  /**
   * Returns a valid access token, refreshing via the plugin if the cached one is near
   * expiry. Unlike the old implementation, this NEVER falls back to returning the
   * cached (possibly dead) token after a failed refresh — masking a dead token as if
   * valid is exactly what let stale state overwrite good edits on reload. Instead it
   * throws `AuthExpiredError` so callers can flip the "reconnect" state and stop
   * trusting Drive writes.
   */
  async getValidAccessToken(): Promise<string> {
    // Captured before the only suspension point (the refresh await); compared again
    // before re-caching so a logout that landed mid-flight invalidates this call.
    const epochAtStart = logoutEpoch;
    const expiry = localStorage.getItem('auth_expiry');
    const token = localStorage.getItem('auth_token');

    // Fast path: cached token is comfortably in date (>2 min headroom). The expiry is
    // still only an upper bound (a token can be revoked early); a real 401 from a Drive
    // call is what ultimately drives the reconnect state — this just avoids needless
    // refreshes on the happy path.
    if (token && expiry && Date.now() < Number(expiry) - 120_000) {
      return token;
    }

    // Cached token is missing or near/at expiry — attempt a silent refresh.
    try {
      // Serialize behind plugin init. Without this, an early refresh (AuthContext
      // restore with an expired token) races initialize() as the plugin proxy's FIRST
      // call; Capacitor's lazy web loader then constructs TWO SocialLoginWeb instances
      // and can cache the unconfigured one — breaking every later login() with
      // "Google Client ID not set".
      await this.initialize();

      const refreshFn = (SocialLogin as unknown as SocialLoginWithRefresh).refresh;
      const refreshed = refreshFn ? await refreshFn({ provider: 'google' }) : undefined;
      const refreshedAccess = refreshed?.accessToken;
      const refreshedToken = refreshedAccess
        ? (typeof refreshedAccess === 'object' ? refreshedAccess.token : refreshedAccess)
        : null;
      // A refresh that resolved after a logout bumped the epoch is discarded (fall
      // through to AuthExpiredError below): the token may be live, but the session it
      // belonged to is gone, and re-caching it would undo the logout wipe.
      if (refreshedToken && logoutEpoch === epochAtStart) {
        const refreshedExpiry =
          typeof refreshedAccess === 'object' && typeof refreshedAccess.expiresAt === 'number'
            ? refreshedAccess.expiresAt
            : Date.now() + 3600 * 1000;
        localStorage.setItem('auth_token', refreshedToken);
        localStorage.setItem('auth_expiry', refreshedExpiry.toString());
        return refreshedToken;
      }
    } catch (e) {
      // Surface, don't mask: a failed refresh means we cannot prove the token is good.
      console.warn('Silent token refresh failed:', e);
      throw new AuthExpiredError();
    }

    // Refresh produced nothing usable. Do NOT return the stale cached token as if valid.
    throw new AuthExpiredError();
  },

  /**
   * Helper to check if running on native platform
   */
  isNative() {
    return Capacitor.isNativePlatform();
  }
};
