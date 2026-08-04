import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as Clipboard from "expo-clipboard";

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
import { daysAgoIso } from "@/utils/dates";
import {
  computeCareerStats,
  computeClubBreakdown,
  computeConsistency,
  computeConsistencyTrend,
  deleteSwingRecord,
  getRecordsForDate,
  getSwingRecords,
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

const APP_VERSION = "1.0.0";

const SETTINGS: SettingItem[] = [
  {
    id: "edit-profile",
    label: "Edit Profile",
    icon: "user",
    iconFamily: "feather",
  },
  {
    id: "security",
    label: "Security & Password",
    icon: "lock",
    iconFamily: "feather",
  },
  {
    id: "app-info",
    label: "App Info & Version",
    icon: "info",
    iconFamily: "feather",
    value: `v${APP_VERSION}`,
  },
  {
    id: "export-data",
    label: "Export My Data",
    icon: "download",
    iconFamily: "feather",
  },
  {
    id: "logout",
    label: "Sign Out",
    icon: "log-out",
    iconFamily: "feather",
    destructive: true,
  },
  {
    id: "delete-account",
    label: "Delete Account",
    icon: "trash-2",
    iconFamily: "feather",
    destructive: true,
  },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signUp, signIn, signOut, updateName, changePassword, deleteAccount, exportData } =
    useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [swingRecords, setSwingRecords] = useState<SwingRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [authBanner, setAuthBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeModal, setActiveModal] = useState<
    "edit-profile" | "security" | "delete-account" | null
  >(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState("");
  const [editNameInput, setEditNameInput] = useState("");
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const { findSwing, setActive } = useSwingLibrary();

  // Alert.alert() has no implementation on react-native-web — it silently
  // no-ops there — so account-creation feedback needs a real in-UI banner
  // to actually be visible in the web preview, not just on native. It's
  // rendered outside the signed-in/signed-out branches below so it
  // survives the view swap that happens the instant `user` becomes truthy.
  const showAuthBanner = (type: "success" | "error", message: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setAuthBanner({ type, message });
    bannerTimer.current = setTimeout(() => setAuthBanner(null), 4000);
  };

  useEffect(() => {
    return () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); };
  }, []);

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

  const todaySession   = getTodaySession(sessions);
  const practiceStreak = computeStreak(sessions);
  const totalSwings    = computeTotalSwings(sessions);
  const careerStats    = computeCareerStats(swingRecords);
  const sessionCount   = sessions.filter((s) => s.duration > 0 || (s.swings ?? 0) > 0).length;

  const recentRecords = [...swingRecords].reverse().slice(0, 10);
  const clubBreakdown = computeClubBreakdown(swingRecords);
  const selectedDayRecords = selectedDate ? getRecordsForDate(swingRecords, selectedDate) : [];
  const selectedDaySession = selectedDate ? sessions.find((s) => s.date === selectedDate) ?? null : null;

  // Weekly recap: rolling 7-day windows (not calendar weeks) so "this week"
  // always means "the last 7 days" regardless of what day it is.
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
      showAuthBanner("error", "Please enter your email and password.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    try {
      if (mode === "signup") {
        await signUp(email.trim(), password, name.trim() || undefined);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAuthBanner("success", "Account created — welcome to SwingTempo!");
      } else {
        await signIn(email.trim(), password);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAuthBanner("success", "Signed in.");
      }
      setPassword("");
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAuthBanner(
        "error",
        err instanceof Error ? err.message : mode === "signup" ? "Couldn't create account." : "Couldn't sign in."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalError(null);
    setModalSaving(false);
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setDeletePasswordInput("");
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
    } else if (item.id === "edit-profile") {
      setModalError(null);
      setEditNameInput(user?.name ?? "");
      setActiveModal("edit-profile");
    } else if (item.id === "security") {
      setModalError(null);
      setActiveModal("security");
    } else if (item.id === "app-info") {
      Alert.alert("SwingTempo", `Version ${APP_VERSION}`);
    } else if (item.id === "export-data") {
      void handleExportData();
    } else if (item.id === "delete-account") {
      setModalError(null);
      setActiveModal("delete-account");
    }
  };

  /**
   * Data export. Copies the account's full server-side record to the
   * clipboard as JSON — no email provider is wired up yet, and the share
   * sheet doesn't exist on web, so the clipboard is the one route that works
   * on every platform the app runs on.
   */
  const handleExportData = async () => {
    try {
      const data = await exportData();
      await Clipboard.setStringAsync(JSON.stringify(data, null, 2));
      showAuthBanner(
        "success",
        `Copied ${data.swingRecords.length} swings and ${data.sessions.length} practice days to your clipboard.`,
      );
    } catch (err) {
      showAuthBanner("error", err instanceof Error ? err.message : "Couldn't export your data.");
    }
  };

  const confirmDeleteAccount = async () => {
    if (!deletePasswordInput) {
      setModalError("Enter your password to confirm.");
      return;
    }
    setModalSaving(true);
    setModalError(null);
    try {
      await deleteAccount(deletePasswordInput);
      closeModal();
      showAuthBanner("success", "Your account and all its data have been deleted.");
    } catch (err) {
      setModalSaving(false);
      setModalError(err instanceof Error ? err.message : "Couldn't delete your account.");
    }
  };

  /** Removes one swing from history, locally and (on next sync) server-side. */
  const handleDeleteRecord = (record: SwingRecord) => {
    Alert.alert("Delete Swing", "Remove this swing from your history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteSwingRecord(record.id);
          setSwingRecords(await getSwingRecords());
        },
      },
    ]);
  };

  const saveEditProfile = async () => {
    if (!editNameInput.trim()) {
      setModalError("Enter a name.");
      return;
    }
    setModalSaving(true);
    setModalError(null);
    try {
      await updateName(editNameInput.trim());
      closeModal();
    } catch (err) {
      setModalSaving(false);
      setModalError(err instanceof Error ? err.message : "Couldn't update profile.");
    }
  };

  const saveSecurity = async () => {
    if (!currentPasswordInput || !newPasswordInput) {
      setModalError("Enter your current and new password.");
      return;
    }
    if (newPasswordInput.length < 8) {
      setModalError("New password must be at least 8 characters.");
      return;
    }
    setModalSaving(true);
    setModalError(null);
    try {
      await changePassword(currentPasswordInput, newPasswordInput);
      closeModal();
      showAuthBanner("success", "Password changed.");
    } catch (err) {
      setModalSaving(false);
      setModalError(err instanceof Error ? err.message : "Couldn't change password.");
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

        {authBanner && (
          <View
            style={[
              styles.authBanner,
              authBanner.type === "success" ? styles.authBannerSuccess : styles.authBannerError,
            ]}
          >
            <Feather
              name={authBanner.type === "success" ? "check-circle" : "alert-circle"}
              size={16}
              color={authBanner.type === "success" ? "#30D158" : "#FF3B30"}
            />
            <Text style={styles.authBannerText}>{authBanner.message}</Text>
          </View>
        )}

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

            {/* ── Recent Swing Archive ────────────────────────────── */}
            {recentRecords.length > 0 && (
              <View style={styles.widgetSection}>
                <Text style={styles.sectionLabel}>RECENT SWINGS</Text>
                <Text style={styles.sectionHint}>Long-press a swing to delete it</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.archiveRow}>
                  {recentRecords.map((r) => (
                    <Pressable
                      key={r.id}
                      style={styles.archiveCard}
                      onPress={() => openRecordedSwing(r)}
                      onLongPress={() => handleDeleteRecord(r)}
                    >
                      <View style={styles.archiveThumb}>
                        {r.thumbnailUri ? (
                          <Image source={{ uri: r.thumbnailUri }} style={styles.archiveThumbImage} contentFit="cover" />
                        ) : (
                          <Feather name="video" size={18} color="#333" />
                        )}
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
              {/*
                A gold "SwingTempo Pro" badge used to sit here for every
                signed-in user. There is no subscription tier, no entitlement
                check and no payment integration behind it — it implied a paid
                plan that doesn't exist. Replaced with the streak, which is
                real and actually earned.
              */}
              {practiceStreak > 0 && (
                <View style={styles.badgeRow}>
                  <View style={styles.badge}>
                    <MaterialCommunityIcons name="fire" size={12} color="#FF9F0A" />
                    <Text style={styles.badgeText}>
                      {practiceStreak} day streak
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/*
              These were hardcoded to "24 / 3.1:1 / 82%" for every account,
              which meant a brand-new user was shown invented measurements by
              a measurement app. They're computed from real data now, and read
              "—" until there is any.
            */}
            <View style={styles.statsRow}>
              {[
                {
                  label: "Sessions",
                  value: sessionCount > 0 ? String(sessionCount) : "—",
                },
                {
                  label: "Best Ratio",
                  value: careerStats.bestRatio !== null
                    ? `${careerStats.bestRatio.toFixed(2)}:1`
                    : "—",
                },
                {
                  label: "Avg Accuracy",
                  value: careerStats.avgAccuracy !== null
                    ? `${careerStats.avgAccuracy}%`
                    : "—",
                },
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
                {isLoading && (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                )}
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

      <Modal
        visible={activeModal === "edit-profile"}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.modalLabel}>Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editNameInput}
              onChangeText={setEditNameInput}
              placeholder="Your name"
              placeholderTextColor="#333333"
              autoCapitalize="words"
              autoFocus
            />
            {modalError && <Text style={styles.modalErrorText}>{modalError}</Text>}
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalCancelBtn} onPress={closeModal}>
                <Text style={styles.modalCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, modalSaving && { opacity: 0.7 }]}
                onPress={saveEditProfile}
                disabled={modalSaving}
              >
                {modalSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveLabel}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeModal === "security"}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Security & Password</Text>
            <Text style={styles.modalLabel}>Current password</Text>
            <TextInput
              style={styles.modalInput}
              value={currentPasswordInput}
              onChangeText={setCurrentPasswordInput}
              placeholder="Current password"
              placeholderTextColor="#333333"
              secureTextEntry
              autoFocus
            />
            <Text style={styles.modalLabel}>New password</Text>
            <TextInput
              style={styles.modalInput}
              value={newPasswordInput}
              onChangeText={setNewPasswordInput}
              placeholder="At least 8 characters"
              placeholderTextColor="#333333"
              secureTextEntry
            />
            {modalError && <Text style={styles.modalErrorText}>{modalError}</Text>}
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalCancelBtn} onPress={closeModal}>
                <Text style={styles.modalCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, modalSaving && { opacity: 0.7 }]}
                onPress={saveSecurity}
                disabled={modalSaving}
              >
                {modalSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveLabel}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/*
        Account deletion. Required by App Store guideline 5.1.1(v) for any app
        offering account creation, and by erasure rights under the Australian
        Privacy Act and GDPR. The password is re-entered here and re-checked
        server-side, so a stolen token alone can't destroy someone's data.
      */}
      <Modal
        visible={activeModal === "delete-account"}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalWarning}>
              This permanently deletes your account, your practice history and every synced
              swing. It cannot be undone. Export your data first if you want to keep it.
            </Text>
            <Text style={styles.modalLabel}>Confirm your password</Text>
            <TextInput
              style={styles.modalInput}
              value={deletePasswordInput}
              onChangeText={setDeletePasswordInput}
              placeholder="Password"
              placeholderTextColor="#333333"
              secureTextEntry
              autoFocus
            />
            {modalError && <Text style={styles.modalErrorText}>{modalError}</Text>}
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalCancelBtn} onPress={closeModal}>
                <Text style={styles.modalCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDeleteBtn, modalSaving && { opacity: 0.7 }]}
                onPress={confirmDeleteAccount}
                disabled={modalSaving}
              >
                {modalSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveLabel}>Delete Forever</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  authBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  authBannerSuccess: { backgroundColor: "#30D15818", borderColor: "#30D15855" },
  authBannerError: { backgroundColor: "#FF3B3018", borderColor: "#FF3B3055" },
  authBannerText: { flex: 1, fontSize: 13, color: "#FFFFFF", fontFamily: "Inter_500Medium" },
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

  goalRowBorder: { borderTopWidth: 1, borderTopColor: "#1A1A1A" },

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
    overflow: "hidden",
  },
  archiveThumbImage: { width: "100%", height: "100%" },
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
  sectionHint: {
    fontSize: 11,
    color: "#333333",
    marginTop: -4,
    marginBottom: 8,
    fontFamily: "Inter_400Regular",
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
    flexDirection: "row",
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

  modalOverlay: {
    flex: 1,
    backgroundColor: "#000000AA",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#0D0D0D",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    padding: 20,
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 11,
    color: "#555555",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: "#111111",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    paddingHorizontal: 12,
    height: 44,
    color: "#FFFFFF",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  modalErrorText: {
    color: "#FF3B30",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#222222",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelLabel: {
    color: "#888888",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  modalSaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#1A8CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalDeleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
  },
  modalWarning: {
    color: "#FF9F0A",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  modalSaveLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
