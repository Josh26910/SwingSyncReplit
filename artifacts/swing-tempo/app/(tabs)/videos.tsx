/**
 * SwingTempo – Swing Lab tab
 *
 * • Import a swing video from the camera roll
 * • Tap Takeaway / Top / Impact while the video plays to set timestamp markers
 * • "Preview with Tempo" plays the video 3×:
 *     Pass 1 – normal speed + beeps at markers
 *     Pass 2 – normal speed + beeps at markers
 *     Pass 3 – slow motion (0.6×) + beeps at markers
 * • "Analysis" button jumps to the Analysis tab
 * • Pro Swings sub-tab shows tour players with their tempo data
 */

import { Feather } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import type { AVPlaybackStatus } from "expo-av";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTempo } from "@/context/TempoContext";
import { TEMPO_PLAYERS } from "@/data/tempoPlayers";
import { playImpact, playStart, playTop } from "@/utils/audio";

const BLUE   = "#1A8CFF";
const RED    = "#FF3B30";
const GREEN  = "#30D158";
const ORANGE = "#FF9F0A";
const { width: SCREEN_W } = Dimensions.get("window");

type Markers = { takeaway: number | null; top: number | null; impact: number | null };
interface Swing { id: string; uri: string; name: string; markers: Markers }

const EMPTY_MARKERS: Markers = { takeaway: null, top: null, impact: null };

function msToStr(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(2)}s`;
}

/* ── Pro players subset ──────────────────────────────────────────── */
const PRO_SWINGS = Object.values(
  TEMPO_PLAYERS.reduce<Record<string, (typeof TEMPO_PLAYERS)[0]>>((acc, p) => {
    if (!acc[p.name]) acc[p.name] = p;
    return acc;
  }, {}),
).slice(0, 8);

export default function VideosScreen() {
  const insets     = useSafeAreaInsets();
  const { audioMode } = useTempo();

  const [tab,     setTab    ] = useState<"mine" | "pro">("mine");
  const [swings,  setSwings ] = useState<Swing[]>([]);
  const [active,  setActive ] = useState<Swing | null>(null);

  // Playback state
  const videoRef        = useRef<Video>(null);
  const [posMs,    setPosMs   ] = useState(0);
  const [durMs,    setDurMs   ] = useState(0);
  const [playing,  setPlaying ] = useState(false);
  const [markers,  setMarkers ] = useState<Markers>(EMPTY_MARKERS);

  // Preview state
  const [previewPass, setPreviewPass] = useState<0 | 1 | 2 | 3>(0);
  const previewRef = useRef({ active: false, pass: 0, fired: new Set<string>() });

  /* ── Pick video ────────────────────────────────────────────────── */
  const pickVideo = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const newSwing: Swing = {
      id:      Date.now().toString(),
      uri:     asset.uri,
      name:    `Swing ${swings.length + 1}`,
      markers: EMPTY_MARKERS,
    };
    setSwings((prev) => [newSwing, ...prev]);
    openAnalyzer(newSwing);
  }, [swings.length]);

  /* ── Open analyzer ─────────────────────────────────────────────── */
  const openAnalyzer = (swing: Swing) => {
    setActive(swing);
    setMarkers(swing.markers);
    setPosMs(0);
    setDurMs(0);
    setPlaying(false);
    setPreviewPass(0);
    previewRef.current = { active: false, pass: 0, fired: new Set() };
  };

  const closeAnalyzer = async () => {
    await videoRef.current?.pauseAsync();
    if (active) {
      setSwings((prev) =>
        prev.map((s) => (s.id === active.id ? { ...s, markers } : s)),
      );
    }
    setActive(null);
    setPreviewPass(0);
    previewRef.current = { active: false, pass: 0, fired: new Set() };
  };

  /* ── Playback status ───────────────────────────────────────────── */
  const handleStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      setPosMs(status.positionMillis);
      if (status.durationMillis) setDurMs(status.durationMillis);
      setPlaying(status.isPlaying);

      const pr = previewRef.current;
      if (!pr.active) return;

      // Fire beeps when position crosses markers
      const pos = status.positionMillis;
      if (markers.takeaway !== null && !pr.fired.has("takeaway") && pos >= markers.takeaway) {
        pr.fired.add("takeaway");
        playStart(audioMode);
      }
      if (markers.top !== null && !pr.fired.has("top") && pos >= markers.top) {
        pr.fired.add("top");
        playTop(audioMode);
      }
      if (markers.impact !== null && !pr.fired.has("impact") && pos >= markers.impact) {
        pr.fired.add("impact");
        playImpact(audioMode);
      }

      // Pass transition
      if (status.didJustFinish && pr.active) {
        const nextPass = pr.pass + 1;
        if (nextPass > 3) {
          pr.active = false;
          setPreviewPass(0);
          return;
        }
        pr.pass = nextPass;
        pr.fired = new Set();
        setPreviewPass(nextPass as 1 | 2 | 3);
        videoRef.current?.setPositionAsync(0).then(() => {
          if (nextPass === 3) {
            videoRef.current?.setRateAsync(0.6, true);
          }
          videoRef.current?.playAsync();
        });
      }
    },
    [markers, audioMode],
  );

  /* ── Controls ──────────────────────────────────────────────────── */
  const togglePlay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playing) await videoRef.current?.pauseAsync();
    else          await videoRef.current?.playAsync();
  };

  const setMarker = (key: keyof Markers) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMarkers((prev) => ({ ...prev, [key]: posMs }));
  };

  const startPreview = async () => {
    if (!videoRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    previewRef.current = { active: true, pass: 1, fired: new Set() };
    setPreviewPass(1);
    await videoRef.current.setRateAsync(1.0, true);
    await videoRef.current.setPositionAsync(0);
    await videoRef.current.playAsync();
  };

  const stopPreview = async () => {
    previewRef.current = { active: false, pass: 0, fired: new Set() };
    setPreviewPass(0);
    await videoRef.current?.pauseAsync();
  };

  /* ── Progress bar ──────────────────────────────────────────────── */
  const progress    = durMs > 0 ? posMs / durMs : 0;
  const barW        = SCREEN_W - 48;
  const markerPins: Array<{ key: keyof Markers; color: string; frac: number }> = [];
  if (markers.takeaway !== null && durMs > 0) markerPins.push({ key: "takeaway", color: GREEN,  frac: markers.takeaway / durMs });
  if (markers.top      !== null && durMs > 0) markerPins.push({ key: "top",      color: ORANGE, frac: markers.top      / durMs });
  if (markers.impact   !== null && durMs > 0) markerPins.push({ key: "impact",   color: RED,    frac: markers.impact   / durMs });

  /* ── Analyzer view ─────────────────────────────────────────────── */
  if (active) {
    const allSet = markers.takeaway !== null && markers.top !== null && markers.impact !== null;
    const passLabel  = previewPass === 0 ? "" : previewPass < 3 ? `Pass ${previewPass}/3 · Normal` : "Pass 3/3 · Slow Motion";

    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Back + title */}
        <View style={styles.analyzerHeader}>
          <Pressable onPress={closeAnalyzer} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color="#FFF" />
            <Text style={styles.backLabel}>Swing Lab</Text>
          </Pressable>
          <Text style={styles.analyzerTitle} numberOfLines={1}>{active.name}</Text>
          <View style={{ width: 80 }} />
        </View>

        {/* Video */}
        <View style={styles.videoWrap}>
          <Video
            ref={videoRef}
            source={{ uri: active.uri }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            onPlaybackStatusUpdate={handleStatus}
            isLooping={false}
            useNativeControls={false}
          />
          {previewPass > 0 && (
            <View style={styles.passBadge}>
              <Text style={styles.passLabel}>{passLabel}</Text>
            </View>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.analyzerBody, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress bar + play */}
          <View style={styles.progressRow}>
            <Pressable onPress={togglePlay} style={styles.miniPlay}>
              <Feather name={playing ? "pause" : "play"} size={18} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1, position: "relative" }}>
              <View style={styles.trackBg}>
                <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              {markerPins.map((pin) => (
                <View
                  key={pin.key}
                  style={[styles.markerPin, { left: pin.frac * (barW - 48), backgroundColor: pin.color }]}
                />
              ))}
            </View>
            <Text style={styles.posLabel}>{msToStr(posMs)}</Text>
          </View>

          {/* Marker buttons */}
          <View style={styles.markerRow}>
            {(["takeaway", "top", "impact"] as const).map((k) => {
              const colors: Record<string, string> = { takeaway: GREEN, top: ORANGE, impact: RED };
              const labels: Record<string, string> = { takeaway: "Takeaway", top: "Top", impact: "Impact" };
              const isSet = markers[k] !== null;
              return (
                <Pressable
                  key={k}
                  onPress={() => setMarker(k)}
                  style={[styles.markerBtn, isSet && { borderColor: colors[k] }]}
                >
                  <View style={[styles.markerDot, { backgroundColor: isSet ? colors[k] : "#333" }]} />
                  <Text style={[styles.markerBtnLabel, isSet && { color: colors[k] }]}>{labels[k]}</Text>
                  <Text style={[styles.markerTime, isSet && { color: colors[k] }]}>{msToStr(markers[k])}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.markerHint}>
            {playing ? "Tap a button above to set marker at current position" : "Press play, then tap buttons to mark Takeaway → Top → Impact"}
          </Text>

          {/* Action buttons */}
          {previewPass === 0 ? (
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, !allSet && styles.actionBtnDim]}
                onPress={allSet ? startPreview : undefined}
              >
                <Feather name="play-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnLabel}>Preview with Tempo</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => { closeAnalyzer(); router.push("/(tabs)/analysis"); }}
              >
                <Feather name="bar-chart-2" size={20} color={BLUE} style={{ marginRight: 8 }} />
                <Text style={[styles.actionBtnLabel, { color: BLUE }]}>Analysis</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={[styles.actionBtn, styles.actionBtnStop]} onPress={stopPreview}>
              <Feather name="square" size={18} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.actionBtnLabel}>Stop Preview</Text>
            </Pressable>
          )}

          {!allSet && (
            <Text style={styles.allSetHint}>Set all 3 markers to enable preview</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  /* ── Main list view ────────────────────────────────────────────── */
  return (
    <View style={[styles.root, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 10) }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SWING LAB</Text>
        <View style={styles.tabRow}>
          <Pressable style={[styles.tabBtn, tab === "mine" && styles.tabBtnActive]} onPress={() => setTab("mine")}>
            <Text style={[styles.tabBtnText, tab === "mine" && styles.tabBtnTextActive]}>My Swings</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === "pro" && styles.tabBtnActive]} onPress={() => setTab("pro")}>
            <Text style={[styles.tabBtnText, tab === "pro" && styles.tabBtnTextActive]}>Pro Swings</Text>
          </Pressable>
        </View>
      </View>

      {/* My Swings */}
      {tab === "mine" && (
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Add button */}
          <Pressable style={styles.addCard} onPress={pickVideo}>
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
              <Text style={styles.emptySub}>Import a video above to mark your{"\n"}Takeaway, Top, and Impact</Text>
            </View>
          )}

          {swings.map((swing) => {
            const { takeaway, top, impact } = swing.markers;
            const allSet = takeaway !== null && top !== null && impact !== null;
            return (
              <Pressable key={swing.id} style={styles.swingCard} onPress={() => openAnalyzer(swing)}>
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
          })}
        </ScrollView>
      )}

      {/* Pro Swings */}
      {tab === "pro" && (
        <FlatList
          data={PRO_SWINGS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
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

  /* ── Analyzer ───────────────── */
  analyzerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  backBtn:        { flexDirection: "row", alignItems: "center", gap: 2, width: 80 },
  backLabel:      { fontSize: 14, fontFamily: "Inter_500Medium", color: "#FFF" },
  analyzerTitle:  { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FFF", flex: 1, textAlign: "center" },
  videoWrap:      { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#0D0D0D", position: "relative" },
  video:          { width: "100%", height: "100%" },
  passBadge:      { position: "absolute", bottom: 8, left: 12, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  passLabel:      { fontSize: 12, fontFamily: "Inter_600SemiBold", color: ORANGE },

  analyzerBody:   { paddingHorizontal: 16, paddingTop: 14, gap: 14 },

  /* Progress bar */
  progressRow:    { flexDirection: "row", alignItems: "center", gap: 10 },
  miniPlay:       { width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE, alignItems: "center", justifyContent: "center" },
  trackBg:        { height: 4, backgroundColor: "#1A1A1A", borderRadius: 2, overflow: "hidden" },
  trackFill:      { height: "100%", backgroundColor: BLUE, borderRadius: 2 },
  markerPin:      { position: "absolute", top: -5, width: 3, height: 14, borderRadius: 2 },
  posLabel:       { fontSize: 11, fontFamily: "Inter_500Medium", color: "#555", width: 48, textAlign: "right" },

  /* Marker buttons */
  markerRow:      { flexDirection: "row", gap: 8 },
  markerBtn:      { flex: 1, backgroundColor: "#0D0D0D", borderRadius: 12, borderWidth: 1.5, borderColor: "#1A1A1A", paddingVertical: 10, alignItems: "center", gap: 3 },
  markerDot:      { width: 8, height: 8, borderRadius: 4 },
  markerBtnLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#888" },
  markerTime:     { fontSize: 10, fontFamily: "Inter_400Regular", color: "#444" },
  markerHint:     { fontSize: 11, fontFamily: "Inter_400Regular", color: "#444", textAlign: "center", lineHeight: 16 },

  /* Action buttons */
  actionRow:        { gap: 10 },
  actionBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: BLUE, borderRadius: 16, paddingVertical: 16, width: "100%" },
  actionBtnDim:     { opacity: 0.4 },
  actionBtnSecondary: { backgroundColor: BLUE + "18", borderWidth: 1, borderColor: BLUE + "44" },
  actionBtnStop:    { backgroundColor: RED + "22", borderWidth: 1, borderColor: RED + "44" },
  actionBtnLabel:   { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF" },
  allSetHint:       { fontSize: 11, fontFamily: "Inter_400Regular", color: "#333", textAlign: "center" },
});
