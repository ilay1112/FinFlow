import React, { createContext, useContext, useState, useEffect } from 'react';
import { useGoogleLogin, googleLogout, type TokenResponse } from '@react-oauth/google';

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
    const loadAuth = () => {
      const savedUser = localStorage.getItem('auth_user');
      const savedToken = localStorage.getItem('auth_token');
      const savedExpiry = localStorage.getItem('auth_expiry');

      if (savedUser && savedToken && savedExpiry) {
        if (Date.now() < Number(savedExpiry)) {
          setUser(JSON.parse(savedUser));
          setAccessToken(savedToken);
        } else {
          localStorage.removeItem('auth_user');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_expiry');
        }
      }
      setIsLoading(false);
    };

    requestAnimationFrame(loadAuth);
  }, []);

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
      localStorage.setItem('auth_user', JSON.stringify(profile));
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      logout();
    }
  };

  const login = useGoogleLogin({
    onSuccess: (tokenResponse: TokenResponse) => {
      const now = Date.now();
      setAccessToken(tokenResponse.access_token);
      // Google tokens usually last 1 hour (3600 seconds)
      const expiry = now + (tokenResponse.expires_in || 3600) * 1000;
      localStorage.setItem('auth_token', tokenResponse.access_token);
      localStorage.setItem('auth_expiry', expiry.toString());
      fetchUserProfile(tokenResponse.access_token);
      setIsLoading(false);
    },
    onError: (error) => {
      console.error('Login Failed:', error);
      setIsLoading(false);
    },
    scope: 'openid profile email https://www.googleapis.com/auth/drive.file',
    onNonOAuthError: () => setIsLoading(false),
  });

  const handleLogin = () => {
    setIsLoading(true);
    login();
  };

  const logout = () => {
    googleLogout();
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_expiry');
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
