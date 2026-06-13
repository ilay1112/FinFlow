import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let isInitializing = false;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

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
   * Returns a valid access token, refreshing via the plugin if the cached one is expired.
   */
  async getValidAccessToken(): Promise<string> {
    try {
      const expiry = localStorage.getItem('auth_expiry');
      const token = localStorage.getItem('auth_token');
      // If token is valid for at least 2 more minutes, return it directly
      if (token && expiry && Date.now() < Number(expiry) - 120_000) {
        return token;
      }
      // Attempt a silent refresh via the plugin
      const refreshed = await (SocialLogin as any).refresh?.({ provider: 'google' });
      if (refreshed?.accessToken) {
        const newToken = typeof refreshed.accessToken === 'object'
          ? refreshed.accessToken.token
          : refreshed.accessToken;
        localStorage.setItem('auth_token', newToken);
        localStorage.setItem('auth_expiry', (Date.now() + 3600 * 1000).toString());
        return newToken;
      }
      if (token) return token;
    } catch (e) {
      console.warn('Token refresh failed, using cached token:', e);
      const token = localStorage.getItem('auth_token');
      if (token) return token;
    }
    throw new Error('No valid access token. Please sign in again.');
  },

  /**
   * Helper to check if running on native platform
   */
  isNative() {
    return Capacitor.isNativePlatform();
  }
};
