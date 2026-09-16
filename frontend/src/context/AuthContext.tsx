import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { authApi } from '../api/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
  isSalesUser: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchUserQuick: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('fundsroom_token'));
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('fundsroom_token');
      if (storedToken) {
        try {
          const profile = await authApi.getProfile();
          setUser(profile);
          setToken(storedToken);
        } catch {
          // Token expired or invalid
          localStorage.removeItem('fundsroom_token');
          setUser(null);
          setToken(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('fundsroom_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('fundsroom_token');
    setToken(null);
    setUser(null);
  };

  const switchUserQuick = async (role: UserRole) => {
    // Convenience helper for local case-study demonstration
    const credentials =
      role === 'ADMIN'
        ? { email: 'admin@fundsroom.com', password: 'Password@123' }
        : { email: 'sales@fundsroom.com', password: 'Password@123' };

    await login(credentials.email, credentials.password);
  };

  const isAdmin = user?.role === 'ADMIN';
  const isSalesUser = user?.role === 'SALES_USER';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAdmin,
        isSalesUser,
        login,
        logout,
        switchUserQuick,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
