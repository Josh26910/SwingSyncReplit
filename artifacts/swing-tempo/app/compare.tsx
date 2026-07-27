/**
 * Side-by-side tempo comparison — two swings played back synced on their
 * "top of backswing" marker, so a player can see their tempo next to a
 * pro's (or last week's swing next to this week's) frame-for-frame.
 */
import { Feather } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTempo } from "@/context/TempoContext";
import { useSwingLibrary, type Swing, type SwingOrigin } from "@/context/SwingLibraryContext";
import { computeSwingAnalysis } from "@/utils/swingAnalysis";

const BLUE = "#1A8CFF";
const RED = "#FF3B30";
/** How far before "top" each clip starts, so both hit top at the same relative time. */
const PRE_ROLL_MS = 1000;

function startMsFor(swing: Swing): number {
  const top = swing.markers.top;
  if (top === null) return 0;
  return Math.max(0, top - PRE_ROLL_MS);
}

function CompareSlot({
  label,
  swing,
  perfectRatio,
  videoRef,
}: {
  label: string;
  swing: Swing;
  perfectRatio: number;
  videoRef: React.RefObject<Video | null>;
}) {
  const analysis = computeSwingAnalysis(swing.markers, perfectRatio);
  return (
    <View style={styles.slot}>
      <Video
        ref={videoRef}
        source={{ uri: swing.uri }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
      />
      <View style={styles.slotBadgeRow}>
        <View style={styles.slotBadge}>
          <Text style={styles.slotBadgeText} numberOfLines={1}>
            {label}
          </Text>
        </View>
        {analysis && (
          <View style={[styles.slotBadge, { borderColor: analysis.gradeColor + "66" }]}>
            <Text style={[styles.slotBadgeText, { color: analysis.gradeColor }]}>
              {analysis.ratioStr}:1
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const { gameMode } = useTempo();
  const { findSwing } = useSwingLibrary();
  const params = useLocalSearchParams<{
    aOrigin: SwingOrigin; aId: string;
    bOrigin: SwingOrigin; bId: string;
  }>();

  const videoRefA = useRef<Video>(null);
  const videoRefB = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const perfectRatio = gameMode === "short" ? 2.0 : 3.0;

  const swingA = useMemo(
    () => (params.aOrigin && params.aId ? findSwing(params.aOrigin, params.aId) : null),
    [params.aOrigin, params.aId, findSwing],
  );
  const swingB = useMemo(
    () => (params.bOrigin && params.bId ? findSwing(params.bOrigin, params.bId) : null),
    [params.bOrigin, params.bId, findSwing],
  );

  const playSynced = async () => {
    if (!swingA || !swingB) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Promise.all([
      videoRefA.current?.setPositionAsync(startMsFor(swingA)),
      videoRefB.current?.setPositionAsync(startMsFor(swingB)),
    ]);
    await Promise.all([videoRefA.current?.playAsync(), videoRefB.current?.playAsync()]);
    setIsPlaying(true);
  };

  const pauseBoth = async () => {
    Haptics.selectionAsync();
    await Promise.all([videoRefA.current?.pauseAsync(), videoRefB.current?.pauseAsync()]);
    setIsPlaying(false);
  };

  if (!swingA || !swingB) {
    return (
      <View style={[styles.root, styles.centerContent, { paddingTop: insets.top + 16 }]}>
        <Feather name="alert-circle" size={28} color="#444" />
        <Text style={styles.missingText}>One or both swings couldn't be found.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={20} color="#FFF" />
        </Pressable>
        <Text style={styles.headerTitle}>COMPARE TEMPO</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.slotsColumn}>
        <CompareSlot
          label={swingA.golferName || swingA.name}
          swing={swingA}
          perfectRatio={perfectRatio}
          videoRef={videoRefA}
        />
        <CompareSlot
          label={swingB.golferName || swingB.name}
          swing={swingB}
          perfectRatio={perfectRatio}
          videoRef={videoRefB}
        />
      </View>

      <Text style={styles.syncHint}>
        Both clips start {(PRE_ROLL_MS / 1000).toFixed(1)}s before "Top", so they reach the top of
        the backswing at the same time.
      </Text>

      <Pressable
        style={[styles.playBtn, isPlaying && styles.playBtnStop]}
        onPress={isPlaying ? pauseBoth : playSynced}
      >
        <Feather name={isPlaying ? "pause" : "play"} size={22} color="#FFF" style={{ marginRight: 10 }} />
        <Text style={styles.playBtnLabel}>{isPlaying ? "Pause Both" : "Play Synced"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000", paddingHorizontal: 16 },
  centerContent: { alignItems: "center", justifyContent: "center", gap: 12 },
  missingText: { color: "#888", fontFamily: "Inter_500Medium", fontSize: 14 },
  backBtn: { backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  backBtnText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 15, letterSpacing: 2 },
  slotsColumn: { flex: 1, gap: 10 },
  slot: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0D0D0D",
    position: "relative",
  },
  video: { width: "100%", height: "100%" },
  slotBadgeRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  slotBadge: {
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333333",
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: "60%",
  },
  slotBadgeText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  syncHint: {
    color: "#444444",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 12,
    lineHeight: 16,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingVertical: 16,
  },
  playBtnStop: { backgroundColor: RED + "22", borderWidth: 1, borderColor: RED + "44" },
  playBtnLabel: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 15 },
});
