/**
 * Landing screen for the link in the password-reset email
 * (`?token=...`, built server-side in routes/auth.ts). Not reachable from
 * in-app navigation — the only way here is the emailed link, which is why
 * this reads its input from a query param rather than route params passed
 * by a caller.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";

const BLUE = "#1A8CFF";

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resetPassword } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setIsSaving(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "This reset link is invalid or has expired. Request a new one from the app.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!token) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Feather name="alert-circle" size={32} color="#FF3B30" style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Missing reset link</Text>
        <Text style={styles.subtitle}>
          Open this page from the link in your password-reset email.
        </Text>
      </View>
    );
  }

  if (done) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Feather name="check-circle" size={32} color="#30D158" style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Password reset</Text>
        <Text style={styles.subtitle}>You're signed in with your new password.</Text>
        <Pressable style={styles.submitBtn} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.submitBtnText}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.subtitle}>This link works once and expires in 30 minutes.</Text>

        <Text style={styles.label}>New password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="At least 8 characters"
            placeholderTextColor="#333333"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoFocus
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Feather name={showPassword ? "eye-off" : "eye"} size={18} color="#666666" />
          </Pressable>
        </View>

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter password"
          placeholderTextColor="#333333"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.submitBtn, isSaving && { opacity: 0.7 }]}
          onPress={submit}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>Reset Password</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000", paddingHorizontal: 24 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    color: "#888888",
    marginBottom: 28,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  label: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 6,
    fontFamily: "Inter_500Medium",
  },
  inputRow: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    borderWidth: 1,
    borderColor: "#1E1E1E",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 16,
    fontFamily: "Inter_400Regular",
  },
  eyeBtn: { position: "absolute", right: 12, top: 12 },
  errorText: {
    color: "#FF3B30",
    fontSize: 12,
    marginBottom: 12,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    backgroundColor: BLUE,
    borderRadius: 10,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});
