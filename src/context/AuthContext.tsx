import React, { createContext, useContext, useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);

  const fetchUserProfile = async (token: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setUser({
        name: data.name,
        email: data.email,
        picture: data.picture,
      });
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      logout();
    }
  };

  const login = useGoogleLogin({
    onSuccess: (tokenResponse: TokenResponse) => {
      setAccessToken(tokenResponse.access_token);
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
