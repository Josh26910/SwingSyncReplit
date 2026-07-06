import {
  getCurrentUser as apiGetCurrentUser,
  login as apiLogin,
  signup as apiSignup,
  setAuthTokenGetter,
  setBaseUrl,
  type AuthUser,
} from "@workspace/api-client-react";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { deleteToken, getToken, setToken } from "@/utils/tokenStorage";

const TOKEN_KEY = "swingtempo_auth_token";

interface AuthContextValue {
  user: AuthUser | null;
  /** True while the stored token (if any) is still being verified on startup. */
  isLoading: boolean;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Configure the shared API client once. The base URL must point at wherever
// @workspace/api-server is actually deployed — set EXPO_PUBLIC_API_URL.
setBaseUrl(process.env.EXPO_PUBLIC_API_URL ?? null);
setAuthTokenGetter(() => getToken(TOKEN_KEY));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken(TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        setUser(await apiGetCurrentUser());
      } catch {
        // Stored token is no longer valid (expired/revoked) — discard it.
        await deleteToken(TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const res = await apiSignup({ email, password, name });
    await setToken(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    await setToken(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await deleteToken(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
