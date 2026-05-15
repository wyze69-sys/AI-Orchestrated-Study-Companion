import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthTokenGetter, setOnUnauthorized } from "@workspace/api-client-react";

const TOKEN_KEY = "studycompanion_token";

interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      try {
        const payload = JSON.parse(atob(storedToken.split(".")[1]));
        const isExpired = payload.exp * 1000 < Date.now();
        if (!isExpired) {
          setToken(storedToken);
          setUser({ id: payload.id, email: payload.email, createdAt: payload.createdAt || "" });
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Read directly from localStorage so customFetch always gets the latest
    // token even before React state has flushed after login.
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
    return () => setAuthTokenGetter(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      // Only auto-logout when we actually hold a token — prevents wiping a
      // freshly-stored token if an in-flight stale request gets a 401.
      if (localStorage.getItem(TOKEN_KEY)) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    });
    return () => setOnUnauthorized(null);
  }, []);

  const login = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
