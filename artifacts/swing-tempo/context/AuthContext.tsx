import {
  changePassword as apiChangePassword,
  deleteAccount as apiDeleteAccount,
  exportAccountData as apiExportAccountData,
  forgotPassword as apiForgotPassword,
  getCurrentUser as apiGetCurrentUser,
  login as apiLogin,
  resetPassword as apiResetPassword,
  signup as apiSignup,
  updateProfile as apiUpdateProfile,
  setAuthTokenGetter,
  setBaseUrl,
  type AccountExport,
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
  /** Always resolves — the server responds the same way whether or not the email is registered. */
  forgotPassword: (email: string) => Promise<void>;
  /** Redeems a reset-link token, sets the new password, and signs the caller in. */
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  /** Permanently deletes the account server-side, then signs out locally. */
  deleteAccount: (password: string) => Promise<void>;
  /** Everything the server holds for this account. */
  exportData: () => Promise<AccountExport>;
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
        // Stored token is no longer valid (expired, or revoked by a password
        // change on another device) — discard it.
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

  const updateName = useCallback(async (name: string) => {
    setUser(await apiUpdateProfile({ name }));
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    // Changing the password revokes every token issued before it, including
    // the one this device is holding — so the replacement the server hands
    // back has to be persisted or the next request 401s.
    const res = await apiChangePassword({ currentPassword, newPassword });
    await setToken(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await apiForgotPassword({ email });
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    const res = await apiResetPassword({ token, newPassword });
    await setToken(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    await apiDeleteAccount({ password });
    await deleteToken(TOKEN_KEY);
    setUser(null);
  }, []);

  const exportData = useCallback(() => apiExportAccountData(), []);

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
        forgotPassword,
        resetPassword,
        deleteAccount,
        exportData,
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
