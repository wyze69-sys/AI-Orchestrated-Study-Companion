import { createContext, useContext, useState, useEffect } from "react";
import { setAuthTokenGetter, setOnUnauthorized } from "@workspace/api-client-react";
const TOKEN_KEY = "studycompanion_token";
const OPEN_SAVED_SESSION_PREFIX = "studycompanion_open_saved_session_";
const AuthContext = createContext(null);
function clearTemporaryChatState() {
  try {
    Object.keys(sessionStorage).filter((key) => key.startsWith(OPEN_SAVED_SESSION_PREFIX)).forEach((key) => sessionStorage.removeItem(key));
  } catch {
  }
}
function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      try {
        const payload = JSON.parse(atob(storedToken.split(".")[1]));
        const isExpired = payload.exp * 1e3 < Date.now();
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
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
    return () => setAuthTokenGetter(null);
  }, []);
  useEffect(() => {
    setOnUnauthorized(() => {
      if (localStorage.getItem(TOKEN_KEY)) {
        localStorage.removeItem(TOKEN_KEY);
        clearTemporaryChatState();
        setToken(null);
        setUser(null);
      }
    });
    return () => setOnUnauthorized(null);
  }, []);
  const login = (newToken, newUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  };
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    clearTemporaryChatState();
    setToken(null);
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>;
}
function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
export {
  AuthProvider,
  useAuth
};
