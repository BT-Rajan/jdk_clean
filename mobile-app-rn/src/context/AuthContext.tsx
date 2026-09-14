import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { loadStoredTokens, clearTokens, setUnauthorizedHandler } from '../api/client';
import { login as loginRequest } from '../api/auth';

interface AuthContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  const logout = useCallback(async () => {
    await clearTokens();
    setIsAuthenticated(false);
    setUsername(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setUsername(null);
    });
    (async () => {
      const hasSession = await loadStoredTokens();
      setIsAuthenticated(hasSession);
      setIsReady(true);
    })();
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    await loginRequest(user, password);
    setUsername(user);
    setIsAuthenticated(true);
  }, []);

  return (
    <AuthContext.Provider value={{ isReady, isAuthenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
