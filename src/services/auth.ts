import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;

let isInitializing = false;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

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
    if (isInitializing) return initPromise;

    isInitializing = true;
    initPromise = (async () => {
      try {
        await SocialLogin.initialize({
          google: {
            webClientId: GOOGLE_CLIENT_ID,
            iOSClientId: GOOGLE_IOS_CLIENT_ID,
            mode: 'online',
          },
        });
        console.log('SocialLogin initialized successfully');
        isInitialized = true;
        
        // On web, check if we can recover a session
        if (!Capacitor.isNativePlatform()) {
          const status = await SocialLogin.isLoggedIn({ provider: 'google' });
          console.log('Initial login status:', status);
        }
      } catch (error) {
        console.error('SocialLogin initialization failed:', error);
        throw error;
      } finally {
        isInitializing = false;
      }
    })();

    return initPromise;
  },

  /**
   * Universal Login method for both Web and Native Android.
   */
  async loginWithGoogle() {
    try {
      // Ensure we are initialized before attempting login
      await this.initialize();

      const isNative = Capacitor.isNativePlatform();
      
      const response = await SocialLogin.login({
        provider: 'google',
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
            style: 'standard',
          }),
        },
      });

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
      const refreshFn = (SocialLogin as unknown as SocialLoginWithRefresh).refresh;
      const refreshed = refreshFn ? await refreshFn({ provider: 'google' }) : undefined;
      const refreshedAccess = refreshed?.accessToken;
      const refreshedToken = refreshedAccess
        ? (typeof refreshedAccess === 'object' ? refreshedAccess.token : refreshedAccess)
        : null;
      if (refreshedToken) {
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
