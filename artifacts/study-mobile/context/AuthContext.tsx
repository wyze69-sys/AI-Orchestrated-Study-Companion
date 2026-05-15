import { setAuthTokenGetter } from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const TOKEN_KEY = "studycompanion_token";

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(str: string): string {
  let output = "";
  let buf = 0;
  let bits = 0;
  for (const ch of str) {
    const idx = B64_CHARS.indexOf(ch);
    if (idx === -1) continue;
    buf = (buf << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buf >> bits) & 0xff);
    }
  }
  return output;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return JSON.parse(decodeBase64(b64));
}

async function storeToken(value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(TOKEN_KEY, value);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, value);
  }
}

async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function deleteToken(): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await loadToken();
        if (stored) {
          const payload = decodeJwtPayload(stored) as {
            exp: number;
            id: string;
            email: string;
            createdAt?: string;
          };
          if (payload.exp * 1000 > Date.now()) {
            setToken(stored);
            setUser({
              id: payload.id,
              email: payload.email,
              createdAt: payload.createdAt ?? "",
            });
          } else {
            await deleteToken();
          }
        }
      } catch {
        await deleteToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  const login = useCallback(async (newToken: string, newUser: AuthUser) => {
    await storeToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    await deleteToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
