import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth';

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
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from LocalStorage on mount
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const savedUser = localStorage.getItem('auth_user');
        const savedToken = localStorage.getItem('auth_token');
        const savedExpiry = localStorage.getItem('auth_expiry');

        if (savedUser && savedToken && savedExpiry) {
          if (Date.now() < Number(savedExpiry)) {
            // Check if the plugin still considers us logged in
            const isPluginSessionValid = await authService.checkSession();
            
            if (isPluginSessionValid) {
              setUser(JSON.parse(savedUser));
              setAccessToken(savedToken);
            } else {
              // Session expired at the provider level
              logout();
            }
          } else {
            localStorage.removeItem('auth_user');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_expiry');
          }
        }
      } catch (error) {
        console.error('Failed to load auth from localStorage:', error);
      }
      setIsLoading(false);
    };

    loadAuth();
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await authService.loginWithGoogle();
      
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        
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
      const profile = {
        name: data.name,
        email: data.email,
        picture: data.picture,
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
    try {
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_expiry');
    } catch (storageError) {
      console.warn('Could not remove auth data from localStorage', storageError);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      accessToken, 
      isAuthenticated: !!accessToken, 
      isLoading,
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
