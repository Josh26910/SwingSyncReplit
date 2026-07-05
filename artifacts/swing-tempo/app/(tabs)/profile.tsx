import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SettingItem {
  id: string;
  label: string;
  icon: string;
  iconFamily: "feather" | "mci";
  value?: string;
  destructive?: boolean;
}

const SETTINGS: SettingItem[] = [
  {
    id: "edit-profile",
    label: "Edit Profile",
    icon: "user",
    iconFamily: "feather",
  },
  {
    id: "handicap",
    label: "Handicap Index",
    icon: "golf",
    iconFamily: "mci",
    value: "--",
  },
  {
    id: "security",
    label: "Security & Password",
    icon: "lock",
    iconFamily: "feather",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "bell",
    iconFamily: "feather",
  },
  {
    id: "app-info",
    label: "App Info & Version",
    icon: "info",
    iconFamily: "feather",
    value: "v1.0.0",
  },
  {
    id: "logout",
    label: "Sign Out",
    icon: "log-out",
    iconFamily: "feather",
    destructive: true,
  },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing Fields", "Please enter your email and password.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsLoading(false);
    setIsLoggedIn(true);
  };

  const handleSettingPress = (item: SettingItem) => {
    Haptics.selectionAsync();
    if (item.id === "logout") {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => setIsLoggedIn(false),
        },
      ]);
    }
  };

  const renderIcon = (item: SettingItem, color: string) => {
    if (item.iconFamily === "mci") {
      return (
        <MaterialCommunityIcons name={item.icon as "golf"} size={18} color={color} />
      );
    }
    return (
      <Feather name={item.icon as "user"} size={18} color={color} />
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 20 : 10),
            paddingBottom:
              insets.bottom + (Platform.OS === "web" ? 84 : 60) + 20,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>PROFILE</Text>
          <Text style={styles.subtitle}>
            {isLoggedIn ? "SwingTempo Pro" : "Sign in to sync your data"}
          </Text>
        </View>

        {isLoggedIn ? (
          <>
            <View style={styles.avatarSection}>
              <View style={styles.avatarRing}>
                <View style={styles.avatar}>
                  <Feather name="user" size={36} color="#1A8CFF" />
                </View>
              </View>
              <Text style={styles.emailDisplay}>{email || "Pro Member"}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <MaterialCommunityIcons
                    name="golf"
                    size={12}
                    color="#FFD700"
                  />
                  <Text style={styles.badgeText}>SwingTempo Pro</Text>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              {[
                { label: "Sessions", value: "24" },
                { label: "Best Ratio", value: "3.1:1" },
                { label: "Avg Accuracy", value: "82%" },
              ].map((stat) => (
                <View key={stat.label} style={styles.statCard}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.sectionLabel}>SETTINGS</Text>
              {SETTINGS.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handleSettingPress(item)}
                  style={({ pressed }) => [
                    styles.settingRow,
                    item.destructive && styles.settingRowDestructive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View
                    style={[
                      styles.settingIconBox,
                      item.destructive && styles.settingIconBoxDestructive,
                    ]}
                  >
                    {renderIcon(item, item.destructive ? "#FF3B30" : "#888888")}
                  </View>
                  <Text
                    style={[
                      styles.settingLabel,
                      item.destructive && styles.settingLabelDestructive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  <View style={styles.settingRight}>
                    {item.value && (
                      <Text style={styles.settingValue}>{item.value}</Text>
                    )}
                    {!item.destructive && (
                      <Feather name="chevron-right" size={16} color="#333333" />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.authSection}>
            <View style={styles.authHeader}>
              <MaterialCommunityIcons name="golf" size={44} color="#1A8CFF" />
              <Text style={styles.authTitle}>SwingTempo</Text>
              <Text style={styles.authSubtitle}>
                Sign in to save your sessions and track improvement
              </Text>
            </View>

            <View style={styles.formSection}>
              <View style={styles.inputWrapper}>
                <Feather
                  name="mail"
                  size={16}
                  color="#444444"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor="#333333"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>

              <View style={styles.inputWrapper}>
                <Feather
                  name="lock"
                  size={16}
                  color="#444444"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#333333"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={16}
                    color="#444444"
                  />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.signInBtn,
                  pressed && { opacity: 0.85 },
                  isLoading && { opacity: 0.7 },
                ]}
                onPress={handleAuth}
                disabled={isLoading}
              >
                <Text style={styles.signInLabel}>
                  {isLoading ? "Signing In..." : "Sign In"}
                </Text>
              </Pressable>

              <Pressable style={styles.forgotBtn}>
                <Text style={styles.forgotLabel}>Forgot Password?</Text>
              </Pressable>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <Pressable
              style={styles.createAccountBtn}
              onPress={() =>
                Alert.alert("Create Account", "Account creation coming soon!")
              }
            >
              <Text style={styles.createAccountLabel}>Create Free Account</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#000000" },
  container: { flex: 1, backgroundColor: "#000000" },
  content: { paddingHorizontal: 24 },
  header: { marginBottom: 24 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 3,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 12,
    color: "#444444",
    marginTop: 2,
    letterSpacing: 1,
    fontFamily: "Inter_400Regular",
  },
  avatarSection: { alignItems: "center", gap: 10, marginBottom: 28 },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: "#1A8CFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0A1A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  emailDisplay: {
    fontSize: 15,
    color: "#CCCCCC",
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  badgeRow: { flexDirection: "row", gap: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1A1200",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    color: "#FFD700",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1A1A1A",
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    color: "#1A8CFF",
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 9,
    color: "#444444",
    letterSpacing: 1,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  settingsSection: { gap: 6 },
  sectionLabel: {
    fontSize: 10,
    color: "#444444",
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 6,
    fontFamily: "Inter_600SemiBold",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
    borderRadius: 12,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  settingRowDestructive: { borderColor: "#2A0808" },
  settingIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  settingIconBoxDestructive: { backgroundColor: "#1A0808" },
  settingLabel: {
    flex: 1,
    fontSize: 14,
    color: "#CCCCCC",
    fontWeight: "500",
    fontFamily: "Inter_500Medium",
  },
  settingLabelDestructive: { color: "#FF3B30" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingValue: {
    fontSize: 12,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
  authSection: { gap: 0 },
  authHeader: {
    alignItems: "center",
    gap: 10,
    marginBottom: 32,
    paddingTop: 16,
  },
  authTitle: {
    fontSize: 28,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 2,
    fontFamily: "Inter_700Bold",
  },
  authSubtitle: {
    fontSize: 13,
    color: "#444444",
    textAlign: "center",
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },
  formSection: { gap: 12, marginBottom: 24 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#FFFFFF",
    fontFamily: "Inter_400Regular",
  },
  eyeBtn: { padding: 4 },
  signInBtn: {
    backgroundColor: "#1A8CFF",
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: "#1A8CFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  signInLabel: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.5,
    fontFamily: "Inter_700Bold",
  },
  forgotBtn: { alignItems: "center", paddingVertical: 4 },
  forgotLabel: {
    fontSize: 13,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  divider: { flex: 1, height: 1, backgroundColor: "#1A1A1A" },
  dividerText: {
    fontSize: 12,
    color: "#333333",
    fontFamily: "Inter_400Regular",
  },
  createAccountBtn: {
    borderWidth: 1,
    borderColor: "#222222",
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  createAccountLabel: {
    fontSize: 15,
    color: "#888888",
    fontWeight: "500",
    fontFamily: "Inter_500Medium",
  },
});
