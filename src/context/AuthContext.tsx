import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { authService } from '../services/auth';
import { clearFinanceCache } from '../utils/financeCache';

interface UserProfile {
  name: string;
  email: string;
  picture: string;
}

interface AuthContextType {
  user: UserProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * True when a Drive/Gmail call has been rejected (401/403) or a silent refresh
   * failed — i.e. the session is expired and writes are NOT reaching Drive. Editing
   * may continue (offline-first), but the UI must surface a "reconnect" prompt and the
   * persistence layer must keep edits durable instead of trusting Drive.
   */
  sessionExpired: boolean;
  /** Flip the session-expired state. Called by data callers when they see a 401/403. */
  markSessionExpired: () => void;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const markSessionExpired = useCallback(() => setSessionExpired(true), []);

  // Load from LocalStorage on mount
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const savedUser = localStorage.getItem('auth_user');
        const savedToken = localStorage.getItem('auth_token');

        // We need a cached identity to even attempt a restore. Note we deliberately do
        // NOT treat the hardcoded `auth_expiry` guess as PROOF of validity — that guess
        // (now + 1h) is exactly what let a dead token masquerade as live, after which
        // syncFromDrive would overwrite good local edits. Instead we ask the auth
        // service for a *currently valid* token (silent refresh if needed). Only a real
        // token restores the authenticated session.
        if (savedUser && savedToken) {
          const parsedUser = JSON.parse(savedUser);

          // Apply normalization to legacy stored URLs
          if (parsedUser.picture && parsedUser.picture.includes('googleusercontent.com')) {
            parsedUser.picture = parsedUser.picture.replace(/=s\d+-c$/, '=s192-c');
          } else if (!parsedUser.picture) {
            parsedUser.picture = `https://ui-avatars.com/api/?name=${encodeURIComponent(parsedUser.name || 'User')}&background=random`;
          }

          // Always restore the cached identity so the app can render in an
          // offline-first / "reconnect" state rather than bouncing to the login page
          // and discarding still-unsynced local edits.
          setUser(parsedUser);

          try {
            // Throws AuthExpiredError if no live token can be produced.
            const validToken = await authService.getValidAccessToken();
            setAccessToken(validToken);
            setSessionExpired(false);
          } catch {
            // Token is dead and could not be refreshed silently. Keep the identity but
            // flag the session as expired; the user must reconnect, and unsynced edits
            // stay protected (FinanceContext will not let Drive clobber the cache).
            setAccessToken(savedToken);
            setSessionExpired(true);
          }
        }
      } catch (error) {
        console.error('Failed to load auth from localStorage:', error);
      }
      setIsLoading(false);
    };

    loadAuth();
  }, []);

  // Proactive, lifecycle-driven token refresh. A backgrounded Capacitor WebView
  // throttles/suspends interval timers, so a fixed setInterval is unreliable exactly
  // when sessions go idle. Instead we refresh deterministically when the app returns to
  // the foreground: Capacitor's App.appStateChange (native iOS/Android) and the web
  // visibilitychange event. Reactive refresh-on-401 (in the data layer) remains the
  // primary mechanism; this just covers the "app sat idle, came back" case up front.
  useEffect(() => {
    let active = true;

    const refreshOnForeground = async () => {
      // Only meaningful if we have a cached identity to refresh for.
      if (!localStorage.getItem('auth_token')) return;
      try {
        const validToken = await authService.getValidAccessToken();
        if (!active) return;
        setAccessToken(validToken);
        setSessionExpired(false);
      } catch {
        if (!active) return;
        setSessionExpired(true);
      }
    };

    if (Capacitor.isNativePlatform()) {
      const handlePromise = CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void refreshOnForeground();
      });
      return () => {
        active = false;
        void handlePromise.then((h) => h.remove());
      };
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshOnForeground();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await authService.loginWithGoogle();

      if (result.accessToken) {
        // F-3 — account-switch guard: if a DIFFERENT Google account is signing in than
        // the one previously cached on this device, purge the prior user's finance_*
        // cache before any data is hydrated, so the new session can never momentarily
        // read the previous user's financial records.
        //
        // Fail-safe: when there IS a previously-cached account, the only case where we
        // keep its cache is a CONFIRMED same-account login (new email present AND equal).
        // A silent/native re-auth that returns no/empty profile email is unconfirmable,
        // so we must assume a switch and purge — never leave the prior user's PII behind.
        try {
          const previousRaw = localStorage.getItem('auth_user');
          const previousEmail = previousRaw ? (JSON.parse(previousRaw)?.email as string | undefined) : undefined;
          const newEmail = result.profile?.email;
          if (previousEmail) {
            const sameConfirmedAccount = !!newEmail && newEmail === previousEmail;
            if (!sameConfirmedAccount) {
              clearFinanceCache();
            }
          }
        } catch (e) {
          // If we can't determine the previous account, fail safe and clear the cache.
          clearFinanceCache();
          console.warn('Account-switch detection failed; cleared finance cache.', e);
        }

        setAccessToken(result.accessToken);
        // A fresh interactive login clears any prior "reconnect" state.
        setSessionExpired(false);

        if (result.profile) {
          setUser(result.profile);
          try {
            localStorage.setItem('auth_user', JSON.stringify(result.profile));
          } catch (e) {
            console.warn('LocalStorage save failed', e);
          }
        } else {
          // Fallback to fetching profile if not provided by plugin
          await fetchUserProfile(result.accessToken);
        }

        const now = Date.now();
        // Assume 1 hour expiry if not provided
        const expiry = now + 3600 * 1000;
        
        try {
          localStorage.setItem('auth_token', result.accessToken);
          localStorage.setItem('auth_expiry', expiry.toString());
        } catch (e) {
          console.warn('LocalStorage save failed', e);
        }
      }
    } catch (error) {
      console.error('Login Failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserProfile = async (token: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      
      // Normalize Google picture URL for higher resolution and handle missing images
      const normalizedPicture = data.picture 
        ? data.picture.replace(/=s\d+-c$/, '=s192-c') 
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'User')}&background=random`;

      const profile = {
        name: data.name || '',
        email: data.email || '',
        picture: normalizedPicture,
      };
      setUser(profile);
      try {
        localStorage.setItem('auth_user', JSON.stringify(profile));
      } catch (storageError) {
        console.warn('Could not save user profile to localStorage', storageError);
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      logout();
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (e) {
      console.warn('Logout plugin call failed', e);
    }
    setUser(null);
    setAccessToken(null);
    setSessionExpired(false);
    try {
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_expiry');
    } catch (storageError) {
      console.warn('Could not remove auth data from localStorage', storageError);
    }
    // F-3 — defense-in-depth: ensure cached financial data/PII is also gone on logout.
    // FinanceContext performs a save-first flush on the same auth transition; this is a
    // backstop so the finance_* keys are cleared even if that path doesn't run.
    clearFinanceCache();
  };

  return (
    <AuthContext.Provider value={{
      user,
      accessToken,
      isAuthenticated: !!accessToken,
      isLoading,
      sessionExpired,
      markSessionExpired,
      login: handleLogin,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
