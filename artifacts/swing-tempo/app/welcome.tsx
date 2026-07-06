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

import { useAuth } from "@/context/AuthContext";
import {
  durationToLevel,
  finalizeSession,
  getSessions,
  recordSessionStart,
  type Session,
} from "@/utils/sessions";

const BLUE = "#1A8CFF";
const CELL_COLORS = [
  "#1A1A1A",   // 0 — no session
  "#0A3D6B",   // 1 — light (< 2 min)
  "#0D5CA6",   // 2 — medium (< 10 min)
  "#1278E0",   // 3 — strong (< 30 min)
  "#1A8CFF",   // 4 — max (30 min+)
];

const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Build a 53-week × 7-day grid ending today */
function buildGrid(sessions: Session[]) {
  const byDate: Record<string, number> = {};
  for (const s of sessions) byDate[s.date] = (byDate[s.date] ?? 0) + s.duration;

  const today    = new Date();
  const todayDay = today.getDay(); // 0=Sun
  // grid ends on last Saturday on/after today
  const endDate  = new Date(today);
  endDate.setDate(today.getDate() + (6 - todayDay));

  const WEEKS = 26; // ~6 months worth
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - WEEKS * 7 + 1);

  const weeks: { date: string; level: 0|1|2|3|4 }[][] = [];
  let d = new Date(startDate);
  for (let w = 0; w < WEEKS; w++) {
    const week = [];
    for (let day = 0; day < 7; day++) {
      const iso = d.toISOString().slice(0, 10);
      const dur = byDate[iso] ?? 0;
      const inFuture = d > today;
      week.push({ date: iso, level: inFuture ? 0 as const : durationToLevel(dur) });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }

  // Month labels: find first week where month changes
  const monthLabels: { weekIdx: number; label: string }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const m = new Date(weeks[w][0].date).getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ weekIdx: w, label: MONTHS[m] });
      lastMonth = m;
    }
  }

  return { weeks, monthLabels };
}

/** Compute streak */
function computeStreak(sessions: Session[]): number {
  const dates = new Set(sessions.map((s) => s.date));
  let streak = 0;
  const d = new Date();
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    if (!dates.has(iso)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

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
  const [grid,     setGrid    ] = useState<ReturnType<typeof buildGrid> | null>(null);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const btnScale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      await finalizeSession();
      const s = await getSessions();
      setSessions(s);
      setGrid(buildGrid(s));
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

  const CELL = 11;
  const GAP  = 3;

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

          {grid && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 4 }}
            >
              <View>
                {/* Month labels */}
                <View style={{ flexDirection: "row", marginBottom: 4 }}>
                  {grid.weeks.map((_, wi) => {
                    const label = grid.monthLabels.find((m) => m.weekIdx === wi);
                    return (
                      <View key={wi} style={{ width: CELL + GAP }}>
                        {label && (
                          <Text style={styles.monthLabel}>{label.label}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Day rows */}
                {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => (
                  <View key={dayIdx} style={{ flexDirection: "row", marginBottom: GAP }}>
                    {grid.weeks.map((week, wi) => (
                      <View
                        key={wi}
                        style={[
                          styles.cell,
                          {
                            width: CELL,
                            height: CELL,
                            marginRight: GAP,
                            backgroundColor: CELL_COLORS[week[dayIdx].level],
                          },
                        ]}
                      />
                    ))}
                  </View>
                ))}

                {/* Legend */}
                <View style={styles.legend}>
                  <Text style={styles.legendText}>Less</Text>
                  {CELL_COLORS.map((c, i) => (
                    <View
                      key={i}
                      style={[styles.legendCell, { backgroundColor: c, width: CELL, height: CELL }]}
                    />
                  ))}
                  <Text style={styles.legendText}>More</Text>
                </View>
              </View>
            </ScrollView>
          )}
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
  monthLabel: {
    fontSize: 8,
    fontFamily: "Inter_400Regular",
    color: "#444444",
    lineHeight: 12,
  },
  cell: {
    borderRadius: 2,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 8,
  },
  legendCell: {
    borderRadius: 2,
  },
  legendText: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "#444444",
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
