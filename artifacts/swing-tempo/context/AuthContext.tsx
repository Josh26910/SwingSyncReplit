import {
  ApiError,
  changePassword as apiChangePassword,
  deleteAccount as apiDeleteAccount,
  forgotPassword as apiForgotPassword,
  resetPassword as apiResetPassword,
  getCurrentUser as apiGetCurrentUser,
  login as apiLogin,
  signup as apiSignup,
  updateProfile as apiUpdateProfile,
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
  updateName: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Emails a 6-digit reset code (server responds the same whether or not the account exists). */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password with the emailed code and signs the user in. */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  /** Permanently deletes the account + synced data server-side, then signs out. */
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Configure the shared API client once. The base URL must point at wherever
// @workspace/api-server is actually deployed — set EXPO_PUBLIC_API_URL.
setBaseUrl(process.env.EXPO_PUBLIC_API_URL ?? null);
setAuthTokenGetter(() => getToken(TOKEN_KEY));

// ApiError.message is "HTTP 401 Unauthorized: Invalid email or password." —
// fine for logs, not for users. Re-throw with just the server's `error` text,
// or a plain-English fallback when the request never reached the server.
async function friendly<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (err) {
    if (err instanceof ApiError) {
      const data = err.data as { error?: unknown } | null;
      if (data && typeof data.error === "string" && data.error) throw new Error(data.error);
      throw new Error("Something went wrong. Please try again.");
    }
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
}

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
    const res = await friendly(apiSignup({ email, password, name }));
    await setToken(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await friendly(apiLogin({ email, password }));
    await setToken(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await deleteToken(TOKEN_KEY);
    setUser(null);
  }, []);

  const updateName = useCallback(async (name: string) => {
    setUser(await friendly(apiUpdateProfile({ name })));
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await friendly(apiChangePassword({ currentPassword, newPassword }));
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await friendly(apiForgotPassword({ email }));
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    const res = await friendly(apiResetPassword({ email, code, newPassword }));
    await setToken(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    await friendly(apiDeleteAccount({ password }));
    await deleteToken(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signUp,
        signIn,
        signOut,
        updateName,
        changePassword,
        requestPasswordReset,
        resetPassword,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
