/**
 * SwingTempo – Swing Lab tab
 *
 * A library of imported swing videos ("Pro Swings" and "My Swings").
 * Importing a video, or tapping an existing swing card, hands it off to the
 * Analysis tab — which owns all frame marking, trimming, and tempo preview.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  EMPTY_MARKERS,
  useSwingLibrary,
  type Swing,
  type SwingOrigin,
} from "@/context/SwingLibraryContext";
import { TEMPO_PLAYERS } from "@/data/tempoPlayers";

const BLUE   = "#1A8CFF";
const RED    = "#FF3B30";
const GREEN  = "#30D158";
const ORANGE = "#FF9F0A";

/* ── Pro players subset ──────────────────────────────────────────── */
const PRO_SWINGS = Object.values(
  TEMPO_PLAYERS.reduce<Record<string, (typeof TEMPO_PLAYERS)[0]>>((acc, p) => {
    if (!acc[p.name]) acc[p.name] = p;
    return acc;
  }, {}),
).slice(0, 8);

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const { swings, proSwings, addSwing, setActive } = useSwingLibrary();

  const [tab, setTab] = useState<"pro" | "mine">("pro");

  /* ── Pick video ────────────────────────────────────────────────── */
  const pickVideo = useCallback(
    async (origin: SwingOrigin) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        // Lets the OS's own picker UI (trim handles on iOS) crop the clip
        // before it's returned, instead of us building a trim tool in-app.
        allowsEditing: true,
        quality: 1,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const list = origin === "mine" ? swings : proSwings;
      const newSwing: Swing = {
        id:      Date.now().toString(),
        uri:     asset.uri,
        name:    `${origin === "pro" ? "Pro Swing" : "Swing"} ${list.length + 1}`,
        markers: EMPTY_MARKERS,
      };
      addSwing(origin, newSwing);
      setActive(origin, newSwing.id);
      router.push("/(tabs)/analysis");
    },
    [swings, proSwings, addSwing, setActive],
  );

  const openSwing = (origin: SwingOrigin, swing: Swing) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActive(origin, swing.id);
    router.push("/(tabs)/analysis");
  };

  const renderSwingCard = (origin: SwingOrigin, swing: Swing) => {
    const { takeaway, top, impact } = swing.markers;
    const allSet = takeaway !== null && top !== null && impact !== null;
    return (
      <Pressable key={swing.id} style={styles.swingCard} onPress={() => openSwing(origin, swing)}>
        <View style={styles.swingThumb}>
          <Feather name="video" size={24} color="#333" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.swingName}>{swing.name}</Text>
          <View style={styles.swingBadges}>
            {(["takeaway", "top", "impact"] as const).map((k) => {
              const c = { takeaway: GREEN, top: ORANGE, impact: RED }[k];
              const set = swing.markers[k] !== null;
              return (
                <View key={k} style={[styles.badge, { backgroundColor: set ? c + "22" : "#111" }]}>
                  <View style={[styles.badgeDot, { backgroundColor: set ? c : "#333" }]} />
                  <Text style={[styles.badgeText, { color: set ? c : "#444" }]}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {allSet && <View style={styles.readyDot} />}
          <Feather name="chevron-right" size={18} color="#333" />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 10) }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SWING LAB</Text>
        <View style={styles.tabRow}>
          <Pressable style={[styles.tabBtn, tab === "pro" && styles.tabBtnActive]} onPress={() => setTab("pro")}>
            <Text style={[styles.tabBtnText, tab === "pro" && styles.tabBtnTextActive]}>Pro Swings</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === "mine" && styles.tabBtnActive]} onPress={() => setTab("mine")}>
            <Text style={[styles.tabBtnText, tab === "mine" && styles.tabBtnTextActive]}>My Swings</Text>
          </Pressable>
        </View>
      </View>

      {/* My Swings */}
      {tab === "mine" && (
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.addCard} onPress={() => pickVideo("mine")}>
            <View style={styles.addIcon}>
              <Feather name="plus" size={28} color={BLUE} />
            </View>
            <Text style={styles.addTitle}>Import Swing Video</Text>
            <Text style={styles.addSub}>Pick from your camera roll</Text>
          </Pressable>

          {swings.length === 0 && (
            <View style={styles.emptyState}>
              <Feather name="film" size={48} color="#222" />
              <Text style={styles.emptyTitle}>No swings yet</Text>
              <Text style={styles.emptySub}>Import a video above, then mark your{"\n"}Takeaway, Top, and Impact in Analysis</Text>
            </View>
          )}

          {swings.map((swing) => renderSwingCard("mine", swing))}
        </ScrollView>
      )}

      {/* Pro Swings */}
      {tab === "pro" && (
        <FlatList
          data={PRO_SWINGS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <Pressable style={styles.addCard} onPress={() => pickVideo("pro")}>
                <View style={styles.addIcon}>
                  <Feather name="plus" size={28} color={BLUE} />
                </View>
                <Text style={styles.addTitle}>Import Pro Swing Video</Text>
                <Text style={styles.addSub}>Analyze a pro's swing with the same tempo preview</Text>
              </Pressable>

              {proSwings.map((swing) => renderSwingCard("pro", swing))}
            </>
          }
          renderItem={({ item }) => (
            <View style={styles.proCard}>
              <View style={styles.proAvatar}>
                <Feather name="user" size={22} color={BLUE} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.proName}>{item.name}</Text>
                <Text style={styles.proMeta}>{item.club} · {item.event} {item.year}</Text>
                <View style={styles.proStats}>
                  <View style={styles.proStatPill}>
                    <Text style={styles.proStatNum}>{item.ratio.toFixed(1)}:1</Text>
                    <Text style={styles.proStatLabel}>RATIO</Text>
                  </View>
                  <View style={styles.proStatPill}>
                    <Text style={styles.proStatNum}>{item.backswing.toFixed(2)}s</Text>
                    <Text style={styles.proStatLabel}>BACK</Text>
                  </View>
                  <View style={styles.proStatPill}>
                    <Text style={styles.proStatNum}>{item.downswing.toFixed(2)}s</Text>
                    <Text style={styles.proStatLabel}>DOWN</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  /* ── Header ─────────────────── */
  header:          { paddingHorizontal: 20, marginBottom: 12 },
  headerTitle:     { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 3, marginBottom: 12 },
  tabRow:          { flexDirection: "row", backgroundColor: "#111", borderRadius: 12, padding: 3, gap: 3 },
  tabBtn:          { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },
  tabBtnActive:    { backgroundColor: BLUE },
  tabBtnText:      { fontSize: 13, fontFamily: "Inter_500Medium", color: "#555" },
  tabBtnTextActive:{ color: "#FFF", fontFamily: "Inter_600SemiBold" },

  listContent: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },

  /* ── Add card ───────────────── */
  addCard:  { backgroundColor: "#0D0D0D", borderRadius: 16, borderWidth: 1.5, borderColor: BLUE + "44", borderStyle: "dashed", padding: 24, alignItems: "center", gap: 6, marginBottom: 4 },
  addIcon:  { width: 52, height: 52, borderRadius: 26, backgroundColor: BLUE + "18", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  addTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FFF" },
  addSub:   { fontSize: 12, fontFamily: "Inter_400Regular", color: "#555" },

  /* ── Empty ──────────────────── */
  emptyState:  { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyTitle:  { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#333" },
  emptySub:    { fontSize: 13, fontFamily: "Inter_400Regular", color: "#333", textAlign: "center", lineHeight: 20 },

  /* ── Swing card ─────────────── */
  swingCard:   { flexDirection: "row", alignItems: "center", backgroundColor: "#0D0D0D", borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A", padding: 12, gap: 12 },
  swingThumb:  { width: 56, height: 56, borderRadius: 10, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  swingName:   { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFF", marginBottom: 6 },
  swingBadges: { flexDirection: "row", gap: 6 },
  badge:       { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  badgeDot:    { width: 5, height: 5, borderRadius: 3 },
  badgeText:   { fontSize: 10, fontFamily: "Inter_500Medium" },
  readyDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: "#30D158" },

  /* ── Pro card ───────────────── */
  proCard:       { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#0D0D0D", borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A", padding: 14, gap: 12 },
  proAvatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: BLUE + "18", alignItems: "center", justifyContent: "center" },
  proName:       { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FFF" },
  proMeta:       { fontSize: 11, fontFamily: "Inter_400Regular", color: "#555" },
  proStats:      { flexDirection: "row", gap: 6, marginTop: 4 },
  proStatPill:   { backgroundColor: "#151515", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, alignItems: "center" },
  proStatNum:    { fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFF" },
  proStatLabel:  { fontSize: 9, fontFamily: "Inter_500Medium", color: "#444", letterSpacing: 0.8, marginTop: 1 },
});
