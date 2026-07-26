import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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

import { ContributionGrid } from "@/components/ContributionGrid";
import { useAuth } from "@/context/AuthContext";
import { useSwingLibrary } from "@/context/SwingLibraryContext";
import type { GameMode } from "@/context/TempoContext";
import { CATEGORY_LABELS } from "@/data/tempoPlayers";
import {
  computeStreak,
  computeTotalSwings,
  getSessions,
  getTodaySession,
  type Session,
} from "@/utils/sessions";
import {
  computeClubBreakdown,
  computeConsistency,
  computeConsistencyTrend,
  getRecordsForDate,
  getSwingRecords,
  getTargetRatio,
  setTargetRatio,
  type SwingRecord,
} from "@/utils/swingHistory";

const REFRESH_INTERVAL_MS = 10000;
const GAME_MODES: GameMode[] = ["long", "short"];
const GAME_MODE_LABELS: Record<GameMode, string> = { long: "Long Game", short: "Short Game" };

function formatMinutes(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return `${seconds}s`;
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

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
  const { user, signUp, signIn, signOut } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [swingRecords, setSwingRecords] = useState<SwingRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [targetRatios, setTargetRatios] = useState<Record<GameMode, number>>({ long: 3.0, short: 2.0 });
  const [editingGoal, setEditingGoal] = useState<GameMode | null>(null);
  const [goalInput, setGoalInput] = useState("");

  const { findSwing, setActive } = useSwingLibrary();

  // Daily Progress tracker: local practice-time + swings-analyzed data,
  // recorded by useActiveTimeTracker while a tempo plays or a video is
  // being analyzed. Only shown to signed-in users (see JSX below), so only
  // poll it once there's actually a user to show it to.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      getSessions().then((s) => { if (!cancelled) setSessions(s); });
      getSwingRecords().then((r) => { if (!cancelled) setSwingRecords(r); });
    };
    load();
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getTargetRatio("long"), getTargetRatio("short")]).then(([long, short]) => {
      setTargetRatios({ long, short });
    });
  }, [user]);

  const todaySession   = getTodaySession(sessions);
  const practiceStreak = computeStreak(sessions);
  const totalSwings    = computeTotalSwings(sessions);

  const recentRecords = [...swingRecords].reverse().slice(0, 10);
  const clubBreakdown = computeClubBreakdown(swingRecords);
  const selectedDayRecords = selectedDate ? getRecordsForDate(swingRecords, selectedDate) : [];
  const selectedDaySession = selectedDate ? sessions.find((s) => s.date === selectedDate) ?? null : null;

  // Weekly recap: rolling 7-day windows (not calendar weeks) so "this week"
  // always means "the last 7 days" regardless of what day it is.
  const daysAgoIso = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const thisWeekDates = new Set(Array.from({ length: 7 }, (_, i) => daysAgoIso(i)));
  const lastWeekDates = new Set(Array.from({ length: 7 }, (_, i) => daysAgoIso(i + 7)));
  const thisWeekSessions = sessions.filter((s) => thisWeekDates.has(s.date));
  const thisWeekRecords  = swingRecords.filter((r) => thisWeekDates.has(r.date));
  const lastWeekRecords  = swingRecords.filter((r) => lastWeekDates.has(r.date));
  const daysPracticedThisWeek = new Set(thisWeekSessions.map((s) => s.date)).size;
  const avgRatio = (records: SwingRecord[]) =>
    records.length ? records.reduce((sum, r) => sum + r.ratio, 0) / records.length : null;
  const avgRatioThisWeek = avgRatio(thisWeekRecords);
  const avgRatioLastWeek = avgRatio(lastWeekRecords);
  const hasWeeklyActivity = thisWeekSessions.length > 0 || thisWeekRecords.length > 0;

  const startEditGoal = (mode: GameMode) => {
    Haptics.selectionAsync();
    setEditingGoal(mode);
    setGoalInput(targetRatios[mode].toFixed(2));
  };

  const saveGoal = async (mode: GameMode) => {
    const value = parseFloat(goalInput);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert("Invalid Target", "Enter a ratio like 3.0 or 2.5.");
      return;
    }
    await setTargetRatio(mode, value);
    setTargetRatios((prev) => ({ ...prev, [mode]: value }));
    setEditingGoal(null);
  };

  const openRecordedSwing = (record: SwingRecord) => {
    const swing = findSwing(record.origin, record.swingId);
    if (!swing) {
      Alert.alert("Swing Not Found", "This swing is no longer in your library.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActive(record.origin, swing.id);
    router.push("/(tabs)/analysis");
  };

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing Fields", "Please enter your email and password.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    try {
      if (mode === "signup") await signUp(email.trim(), password, name.trim() || undefined);
      else await signIn(email.trim(), password);
      setPassword("");
    } catch (err) {
      Alert.alert(
        mode === "signup" ? "Couldn't Create Account" : "Couldn't Sign In",
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingPress = (item: SettingItem) => {
    Haptics.selectionAsync();
    if (item.id === "logout") {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => signOut(),
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
            {user ? "SwingTempo Pro" : "Sign in to sync your data"}
          </Text>
        </View>

        {user ? (
          <View style={styles.progressSection}>
            <Text style={styles.sectionLabel}>DAILY PROGRESS</Text>
            <View style={styles.progressCard}>
              <View style={styles.progressRow}>
                <View style={styles.progressStat}>
                  <Text style={styles.progressValue}>{formatMinutes(todaySession.duration)}</Text>
                  <Text style={styles.progressStatLabel}>PRACTICED TODAY</Text>
                </View>
                <View style={styles.progressDivider} />
                <View style={styles.progressStat}>
                  <Text style={styles.progressValue}>{todaySession.swings ?? 0}</Text>
                  <Text style={styles.progressStatLabel}>SWINGS TODAY</Text>
                </View>
                <View style={styles.progressDivider} />
                <View style={styles.progressStat}>
                  <Text style={styles.progressValue}>{practiceStreak}</Text>
                  <Text style={styles.progressStatLabel}>DAY STREAK</Text>
                </View>
              </View>
              <View style={styles.progressGridWrap}>
                <ContributionGrid
                  sessions={sessions}
                  weeks={52}
                  selectedDate={selectedDate}
                  onDayPress={(date) => {
                    Haptics.selectionAsync();
                    setSelectedDate((prev) => (prev === date ? null : date));
                  }}
                />
              </View>

              {selectedDate && (
                <View style={styles.dayDrillIn}>
                  <Text style={styles.dayDrillInTitle}>{formatDateLabel(selectedDate)}</Text>
                  {selectedDaySession || selectedDayRecords.length > 0 ? (
                    <>
                      <Text style={styles.dayDrillInMeta}>
                        {formatMinutes(selectedDaySession?.duration ?? 0)} practiced ·{" "}
                        {selectedDayRecords.length} swing{selectedDayRecords.length !== 1 ? "s" : ""} analyzed
                      </Text>
                      {selectedDayRecords.map((r) => (
                        <Pressable
                          key={r.id}
                          style={styles.dayDrillInRow}
                          onPress={() => openRecordedSwing(r)}
                        >
                          <Text style={styles.dayDrillInRowText} numberOfLines={1}>
                            {r.golferName || "Swing"} {r.club ? `· ${CATEGORY_LABELS[r.club]}` : ""}
                          </Text>
                          <Text style={styles.dayDrillInRowRatio}>{r.ratio.toFixed(2)}:1</Text>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.dayDrillInMeta}>No activity that day.</Text>
                  )}
                </View>
              )}

              <View style={styles.progressFooter}>
                <Feather name="bar-chart-2" size={12} color="#444444" />
                <Text style={styles.progressFooterText}>
                  {totalSwings} swing{totalSwings !== 1 ? "s" : ""} analyzed all-time
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.progressSection}>
            <Text style={styles.sectionLabel}>DAILY PROGRESS</Text>
            <View style={styles.progressLockedCard}>
              <View style={styles.progressLockedIcon}>
                <Feather name="bar-chart-2" size={22} color="#1A8CFF" />
              </View>
              <Text style={styles.progressLockedTitle}>Track Your Practice</Text>
              <Text style={styles.progressLockedSubtitle}>
                Create a free account to track daily practice time, swings analyzed, and build
                your streak on a GitHub-style activity grid.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.progressLockedBtn, pressed && { opacity: 0.85 }]}
                onPress={() => { Haptics.selectionAsync(); setMode("signup"); }}
              >
                <Text style={styles.progressLockedBtnLabel}>Create Free Account</Text>
              </Pressable>
            </View>
          </View>
        )}

        {user && (
          <>
            {/* ── Weekly Recap ─────────────────────────────────────── */}
            {hasWeeklyActivity && (
              <View style={styles.widgetSection}>
                <Text style={styles.sectionLabel}>THIS WEEK</Text>
                <View style={styles.recapCard}>
                  <Feather name="zap" size={16} color="#FFD700" style={{ marginBottom: 8 }} />
                  <Text style={styles.recapText}>
                    You practiced {daysPracticedThisWeek} day{daysPracticedThisWeek !== 1 ? "s" : ""} and analyzed{" "}
                    {thisWeekRecords.length} swing{thisWeekRecords.length !== 1 ? "s" : ""} this week
                    {avgRatioThisWeek !== null && (
                      <>
                        {", averaging "}
                        <Text style={styles.recapHighlight}>{avgRatioThisWeek.toFixed(2)}:1</Text>
                        {avgRatioLastWeek !== null && (
                          <Text style={{ color: avgRatioThisWeek < avgRatioLastWeek ? "#30D158" : "#FF9F0A" }}>
                            {"  "}({avgRatioThisWeek < avgRatioLastWeek ? "↓" : "↑"} from {avgRatioLastWeek.toFixed(2)}:1)
                          </Text>
                        )}
                      </>
                    )}
                    .
                  </Text>
                </View>
              </View>
            )}

            {/* ── Tempo Consistency Score ─────────────────────────── */}
            <View style={styles.widgetSection}>
              <Text style={styles.sectionLabel}>TEMPO CONSISTENCY</Text>
              <View style={styles.consistencyRow}>
                {GAME_MODES.map((mode) => {
                  const stats = computeConsistency(swingRecords, mode);
                  const trend = computeConsistencyTrend(swingRecords, mode);
                  return (
                    <View key={mode} style={styles.consistencyCard}>
                      <Text style={styles.consistencyLabel}>{GAME_MODE_LABELS[mode]}</Text>
                      {stats ? (
                        <>
                          <View style={styles.consistencyScoreRow}>
                            <Text style={styles.consistencyScore}>{stats.avgAccuracy}%</Text>
                            {trend !== null && trend !== 0 && (
                              <View style={styles.trendChip}>
                                <Feather
                                  name={trend > 0 ? "trending-up" : "trending-down"}
                                  size={11}
                                  color={trend > 0 ? "#30D158" : "#FF3B30"}
                                />
                                <Text style={[styles.trendText, { color: trend > 0 ? "#30D158" : "#FF3B30" }]}>
                                  {Math.abs(trend)}%
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.consistencyMeta}>
                            ±{stats.avgDeviation.toFixed(2)} from {stats.goldStandard.toFixed(1)}:1 · {stats.count} swings
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.consistencyEmpty}>No {mode} game swings analyzed yet</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* ── Goal / Target Ratio ─────────────────────────────── */}
            <View style={styles.widgetSection}>
              <Text style={styles.sectionLabel}>TARGET RATIO</Text>
              <View style={styles.goalCard}>
                {GAME_MODES.map((mode, i) => (
                  <View key={mode} style={[styles.goalRow, i > 0 && styles.goalRowBorder]}>
                    <Text style={styles.goalRowLabel}>{GAME_MODE_LABELS[mode]}</Text>
                    {editingGoal === mode ? (
                      <View style={styles.goalEditRow}>
                        <TextInput
                          style={styles.goalInput}
                          value={goalInput}
                          onChangeText={setGoalInput}
                          keyboardType="decimal-pad"
                          autoFocus
                        />
                        <Pressable style={styles.goalSaveBtn} onPress={() => saveGoal(mode)}>
                          <Feather name="check" size={14} color="#FFF" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable style={styles.goalValueRow} onPress={() => startEditGoal(mode)}>
                        <Text style={styles.goalValue}>{targetRatios[mode].toFixed(2)}:1</Text>
                        <Feather name="edit-2" size={12} color="#444444" />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* ── Recent Swing Archive ────────────────────────────── */}
            {recentRecords.length > 0 && (
              <View style={styles.widgetSection}>
                <Text style={styles.sectionLabel}>RECENT SWINGS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.archiveRow}>
                  {recentRecords.map((r) => (
                    <Pressable key={r.id} style={styles.archiveCard} onPress={() => openRecordedSwing(r)}>
                      <View style={styles.archiveThumb}>
                        <Feather name="video" size={18} color="#333" />
                      </View>
                      <Text style={styles.archiveRatio}>{r.ratio.toFixed(2)}:1</Text>
                      <Text style={styles.archiveDate}>{formatDateLabel(r.date)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Club Breakdown ───────────────────────────────────── */}
            {clubBreakdown.length > 0 && (
              <View style={styles.widgetSection}>
                <Text style={styles.sectionLabel}>BY CLUB</Text>
                <View style={styles.clubCard}>
                  {clubBreakdown.map((c, i) => (
                    <View key={c.club} style={[styles.clubRow, i > 0 && styles.goalRowBorder]}>
                      <Text style={styles.clubRowLabel}>{CATEGORY_LABELS[c.club]}</Text>
                      <Text style={styles.clubRowMeta}>{c.count} swing{c.count !== 1 ? "s" : ""}</Text>
                      <Text style={styles.clubRowRatio}>{c.avgRatio.toFixed(2)}:1</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {user ? (
          <>
            <View style={styles.avatarSection}>
              <View style={styles.avatarRing}>
                <View style={styles.avatar}>
                  <Feather name="user" size={36} color="#1A8CFF" />
                </View>
              </View>
              <Text style={styles.emailDisplay}>{user.name || user.email}</Text>
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
                {mode === "signup"
                  ? "Create a free account to save your sessions and track improvement"
                  : "Sign in to save your sessions and track improvement"}
              </Text>
            </View>

            <View style={styles.formSection}>
              {mode === "signup" && (
                <View style={styles.inputWrapper}>
                  <Feather
                    name="user"
                    size={16}
                    color="#444444"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Name (optional)"
                    placeholderTextColor="#333333"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoComplete="name"
                  />
                </View>
              )}

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
                  {isLoading
                    ? mode === "signup" ? "Creating Account..." : "Signing In..."
                    : mode === "signup" ? "Create Account" : "Sign In"}
                </Text>
              </Pressable>

              {mode === "signin" && (
                <Pressable
                  style={styles.forgotBtn}
                  onPress={() =>
                    Alert.alert(
                      "Not Available Yet",
                      "Password reset isn't set up yet — check back soon."
                    )
                  }
                >
                  <Text style={styles.forgotLabel}>Forgot Password?</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <Pressable
              style={styles.createAccountBtn}
              onPress={() => {
                Haptics.selectionAsync();
                setMode((m) => (m === "signup" ? "signin" : "signup"));
              }}
            >
              <Text style={styles.createAccountLabel}>
                {mode === "signup" ? "Already have an account? Sign In" : "Create Free Account"}
              </Text>
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
  progressSection: { marginBottom: 24 },
  progressCard: {
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    padding: 16,
    gap: 12,
  },
  progressRow: { flexDirection: "row", alignItems: "center" },
  progressStat: { flex: 1, alignItems: "center", gap: 4 },
  progressDivider: { width: 1, height: 32, backgroundColor: "#1A1A1A" },
  progressGridWrap: {
    borderTopWidth: 1,
    borderTopColor: "#1A1A1A",
    paddingTop: 12,
  },
  progressValue: {
    fontSize: 20,
    color: "#1A8CFF",
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  progressStatLabel: {
    fontSize: 9,
    color: "#444444",
    letterSpacing: 0.8,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    textAlign: "center",
  },
  progressFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#1A1A1A",
  },
  progressFooterText: {
    fontSize: 11,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
  progressLockedCard: {
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    borderStyle: "dashed",
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  progressLockedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1A8CFF18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  progressLockedTitle: {
    fontSize: 15,
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
  progressLockedSubtitle: {
    fontSize: 12,
    color: "#555555",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 10,
  },
  progressLockedBtn: {
    backgroundColor: "#1A8CFF",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  progressLockedBtnLabel: {
    fontSize: 13,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  dayDrillIn: {
    borderTopWidth: 1,
    borderTopColor: "#1A1A1A",
    paddingTop: 12,
    gap: 8,
  },
  dayDrillInTitle: { fontSize: 13, color: "#FFFFFF", fontFamily: "Inter_600SemiBold" },
  dayDrillInMeta: { fontSize: 11, color: "#555555", fontFamily: "Inter_400Regular" },
  dayDrillInRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dayDrillInRowText: { flex: 1, fontSize: 12, color: "#CCCCCC", fontFamily: "Inter_500Medium", marginRight: 8 },
  dayDrillInRowRatio: { fontSize: 12, color: "#1A8CFF", fontFamily: "Inter_700Bold" },

  widgetSection: { marginBottom: 24 },

  /* ── Weekly recap ───────────── */
  recapCard: {
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1A8CFF33",
    padding: 16,
  },
  recapText: { fontSize: 13, color: "#CCCCCC", fontFamily: "Inter_400Regular", lineHeight: 20 },
  recapHighlight: { color: "#1A8CFF", fontFamily: "Inter_700Bold" },

  /* ── Tempo Consistency ──────── */
  consistencyRow: { flexDirection: "row", gap: 10 },
  consistencyCard: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    padding: 14,
    gap: 4,
  },
  consistencyLabel: { fontSize: 10, color: "#555555", fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  consistencyScoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  consistencyScore: { fontSize: 24, color: "#FFFFFF", fontFamily: "Inter_700Bold" },
  trendChip: { flexDirection: "row", alignItems: "center", gap: 2 },
  trendText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  consistencyMeta: { fontSize: 10, color: "#444444", fontFamily: "Inter_400Regular" },
  consistencyEmpty: { fontSize: 11, color: "#444444", fontFamily: "Inter_400Regular", marginTop: 6 },

  /* ── Goal setter ────────────── */
  goalCard: {
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  goalRowBorder: { borderTopWidth: 1, borderTopColor: "#1A1A1A" },
  goalRowLabel: { fontSize: 13, color: "#CCCCCC", fontFamily: "Inter_500Medium" },
  goalValueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalValue: { fontSize: 15, color: "#1A8CFF", fontFamily: "Inter_700Bold" },
  goalEditRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalInput: {
    width: 60,
    backgroundColor: "#111111",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1A8CFF",
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    textAlign: "center",
  },
  goalSaveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1A8CFF",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Recent swing archive ───── */
  archiveRow: { gap: 10, paddingRight: 4 },
  archiveCard: {
    width: 100,
    backgroundColor: "#0D0D0D",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  archiveThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  archiveRatio: { fontSize: 13, color: "#FFFFFF", fontFamily: "Inter_700Bold" },
  archiveDate: { fontSize: 9, color: "#555555", fontFamily: "Inter_400Regular" },

  /* ── Club breakdown ─────────── */
  clubCard: {
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  clubRowLabel: { flex: 1, fontSize: 13, color: "#CCCCCC", fontFamily: "Inter_500Medium" },
  clubRowMeta: { fontSize: 11, color: "#555555", fontFamily: "Inter_400Regular" },
  clubRowRatio: { fontSize: 13, color: "#1A8CFF", fontFamily: "Inter_700Bold" },

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
