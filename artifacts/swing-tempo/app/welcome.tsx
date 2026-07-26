import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ContributionGrid } from "@/components/ContributionGrid";
import { useAuth } from "@/context/AuthContext";
import {
  computeStreak,
  finalizeSession,
  getSessions,
  recordSessionStart,
  type Session,
} from "@/utils/sessions";

const BLUE = "#1A8CFF";

function computeTotalThisMonth(sessions: Session[]): number {
  const now   = new Date();
  const yymm  = now.toISOString().slice(0, 7);
  return sessions
    .filter((s) => s.date.startsWith(yymm))
    .reduce((sum, s) => sum + s.duration, 0);
}

export default function WelcomeScreen() {
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const btnScale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      await finalizeSession();
      const s = await getSessions();
      setSessions(s);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
    })();
  }, []);

  const handleStart = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.96, duration: 80,  useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start(async () => {
      await recordSessionStart();
      router.replace("/(tabs)/");
    });
  }, [btnScale]);

  const streak       = computeStreak(sessions);
  const totalSeconds = computeTotalThisMonth(sessions);
  const totalMins    = Math.floor(totalSeconds / 60);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ─────────────────────────────────────────── */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View>
            <Text style={styles.welcomeSmall}>Welcome back,</Text>
            <Text style={styles.welcomeName}>{user?.name || "Golfer"}</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Feather name="user" size={26} color={BLUE} />
          </View>
        </Animated.View>

        {/* ── Stats row ──────────────────────────────────────── */}
        <Animated.View style={[styles.statsRow, { opacity: fadeAnim }]}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{sessions.length}</Text>
            <Text style={styles.statLabel}>SESSIONS</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxMid]}>
            <Text style={styles.statNumber}>{streak}</Text>
            <Text style={styles.statLabel}>DAY STREAK</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{totalMins}</Text>
            <Text style={styles.statLabel}>MINS THIS MO.</Text>
          </View>
        </Animated.View>

        {/* ── Contribution grid ──────────────────────────────── */}
        <Animated.View style={[styles.gridCard, { opacity: fadeAnim }]}>
          <View style={styles.gridHeader}>
            <Text style={styles.gridTitle}>
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} in the last 6 months
            </Text>
          </View>

          <ContributionGrid sessions={sessions} weeks={26} />
        </Animated.View>

        {/* ── Ad placeholder ─────────────────────────────────── */}
        <View style={styles.adPlaceholder}>
          <Feather name="image" size={20} color="#333" />
          <Text style={styles.adText}>Advertisement</Text>
        </View>

        {/* ── Start Session button ───────────────────────────── */}
        <Animated.View style={{ transform: [{ scale: btnScale }], width: "100%" }}>
          <Pressable
            style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.9 }]}
            onPress={handleStart}
          >
            <Feather name="play" size={24} color="#fff" style={{ marginRight: 12 }} />
            <Text style={styles.startBtnLabel}>Start Session</Text>
          </Pressable>
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    marginTop: 8,
  },
  welcomeSmall: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#666666",
    letterSpacing: 0.3,
  },
  welcomeName: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#111111",
    borderWidth: 1.5,
    borderColor: "#1A8CFF44",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  statBoxMid: {
    borderColor: "#1A8CFF33",
  },
  statNumber: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "#444444",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  gridCard: {
    backgroundColor: "#0D0D0D",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  gridHeader: {
    marginBottom: 14,
  },
  gridTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#666666",
  },
  adPlaceholder: {
    width: "100%",
    height: 80,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E1E1E",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  adText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#333333",
    letterSpacing: 1,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE,
    borderRadius: 20,
    paddingVertical: 22,
    width: "100%",
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  startBtnLabel: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
