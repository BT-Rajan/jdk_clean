import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { loadStoredTokens, clearTokens, setUnauthorizedHandler } from '../api/client';
import { login as loginRequest, getMe, MeOut } from '../api/auth';

interface AuthContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  username: string | null;
  user: MeOut | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [user, setUser] = useState<MeOut | null>(null);

  const logout = useCallback(async () => {
    await clearTokens();
    setIsAuthenticated(false);
    setUsername(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setUsername(null);
      setUser(null);
    });
    (async () => {
      const hasSession = await loadStoredTokens();
      setIsAuthenticated(hasSession);
      if (hasSession) {
        getMe()
          .then((me) => {
            setUsername(me.username);
            setUser(me);
          })
          .catch(() => {});
      }
      setIsReady(true);
    })();
  }, []);

  const login = useCallback(async (usernameInput: string, password: string) => {
    await loginRequest(usernameInput, password);
    setIsAuthenticated(true);
    const me = await getMe();
    setUsername(me.username);
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ isReady, isAuthenticated, username, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
