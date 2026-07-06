import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import type { AVPlaybackStatus } from "expo-av";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTempo } from "@/context/TempoContext";
import {
  EMPTY_MARKERS,
  useSwingLibrary,
  type Markers,
  type Swing,
} from "@/context/SwingLibraryContext";
import { playImpact, playStart, playTop } from "@/utils/audio";

const FPS = 30;
const MS_PER_FRAME = 1000 / FPS;
const PERFECT_RATIO = 3.0;
const BLUE = "#1A8CFF";
const RED = "#FF3B30";
const ORANGE = "#FF9F0A";

const PHASE_WORDS: Record<"takeaway" | "top" | "impact", string> = {
  takeaway: "TAKEAWAY",
  top: "TOP",
  impact: "IMPACT",
};

interface PreviewState {
  active: boolean;
  pass: 0 | 1 | 2 | 3;
  fired: Set<string>;
  transitioning: boolean;
}

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const { audioMode, setAudioMode } = useTempo();
  const { activeSwing, activeOrigin, addSwing, updateSwing, setActive } = useSwingLibrary();

  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewPass, setPreviewPass] = useState<0 | 1 | 2 | 3>(0);
  const [previewWord, setPreviewWord] = useState("");
  const previewRef = useRef<PreviewState>({
    active: false,
    pass: 0,
    fired: new Set(),
    transitioning: false,
  });

  const videoUri = activeSwing?.uri ?? null;
  const marks: Markers = activeSwing?.markers ?? EMPTY_MARKERS;

  const currentFrame = Math.round(currentMs / MS_PER_FRAME);

  // Reset transient playback state whenever the active swing changes.
  useEffect(() => {
    setCurrentMs(0);
    setDurationMs(0);
    setIsPlaying(false);
    setPreviewPass(0);
    setPreviewWord("");
    previewRef.current = { active: false, pass: 0, fired: new Set(), transitioning: false };
  }, [activeSwing?.id]);

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library to import videos."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      // Lets the OS's own picker UI (trim handles on iOS) crop the clip
      // before it's returned, instead of us building a trim tool in-app.
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const origin = activeOrigin ?? "mine";
      const newSwing: Swing = {
        id:      Date.now().toString(),
        uri:     result.assets[0].uri,
        name:    `Swing ${Date.now()}`,
        markers: EMPTY_MARKERS,
      };
      addSwing(origin, newSwing);
      setActive(origin, newSwing.id);
    }
  };

  const seekByFrames = async (frameDelta: number) => {
    Haptics.selectionAsync();
    const newMs = Math.max(
      0,
      Math.min(durationMs, currentMs + frameDelta * MS_PER_FRAME)
    );
    await videoRef.current?.setPositionAsync(newMs, {
      toleranceMillisBefore: 0,
      toleranceMillisAfter: 0,
    });
    setCurrentMs(newMs);
  };

  const markFrame = (mark: keyof Markers) => {
    if (!activeSwing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateSwing(activeOrigin, activeSwing.id, { markers: { ...marks, [mark]: currentMs } });
  };

  const clearMark = (mark: keyof Markers) => {
    if (!activeSwing) return;
    updateSwing(activeOrigin, activeSwing.id, { markers: { ...marks, [mark]: null } });
  };

  const getAnalysis = () => {
    if (marks.takeaway === null || marks.top === null || marks.impact === null) return null;
    const backswingMs = marks.top - marks.takeaway;
    const downswingMs = marks.impact - marks.top;
    if (downswingMs <= 0 || backswingMs <= 0) return null;
    const ratio = backswingMs / downswingMs;
    const accuracy = Math.max(0, 100 - Math.abs(ratio - PERFECT_RATIO) * 33);
    return {
      backswingMs,
      downswingMs,
      backswingFrames: Math.round(backswingMs / MS_PER_FRAME),
      downswingFrames: Math.round(downswingMs / MS_PER_FRAME),
      ratio: ratio.toFixed(2),
      accuracy: Math.round(accuracy),
      grade:
        accuracy >= 90
          ? "ELITE"
          : accuracy >= 75
          ? "TOUR"
          : accuracy >= 60
          ? "GOOD"
          : "IMPROVE",
      gradeColor:
        accuracy >= 90
          ? "#30D158"
          : accuracy >= 75
          ? "#1A8CFF"
          : accuracy >= 60
          ? "#FF9F0A"
          : "#FF3B30",
    };
  };

  const analysis = getAnalysis();

  const handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const pos = status.positionMillis ?? 0;
    setCurrentMs(pos);
    if (status.durationMillis) setDurationMs(status.durationMillis);
    setIsPlaying(status.isPlaying);

    const pr = previewRef.current;
    const end = status.durationMillis ?? durationMs;

    if (pr.active) {
      if (marks.takeaway !== null && !pr.fired.has("takeaway") && pos >= marks.takeaway) {
        pr.fired.add("takeaway");
        playStart(audioMode);
        setPreviewWord(PHASE_WORDS.takeaway);
      }
      if (marks.top !== null && !pr.fired.has("top") && pos >= marks.top) {
        pr.fired.add("top");
        playTop(audioMode);
        setPreviewWord(PHASE_WORDS.top);
      }
      if (marks.impact !== null && !pr.fired.has("impact") && pos >= marks.impact) {
        pr.fired.add("impact");
        playImpact(audioMode);
        setPreviewWord(PHASE_WORDS.impact);
      }

      if (!pr.transitioning && end > 0 && pos >= end) {
        pr.transitioning = true;
        const nextPass = pr.pass + 1;
        if (nextPass > 3) {
          pr.active = false;
          setPreviewPass(0);
          setPreviewWord("");
          videoRef.current?.setRateAsync(1.0, true);
          videoRef.current?.pauseAsync();
          videoRef.current?.setPositionAsync(0);
        } else {
          pr.pass = nextPass as 1 | 2 | 3;
          pr.fired = new Set();
          setPreviewPass(nextPass as 1 | 2 | 3);
          setPreviewWord("");
          videoRef.current?.setPositionAsync(0).then(async () => {
            if (nextPass === 3) await videoRef.current?.setRateAsync(0.6, true);
            await videoRef.current?.playAsync();
            pr.transitioning = false;
          });
        }
      }
    }
  };

  const startPreview = async () => {
    if (!videoRef.current || !analysis) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    previewRef.current = { active: true, pass: 1, fired: new Set(), transitioning: false };
    setPreviewPass(1);
    setPreviewWord("");
    await videoRef.current.setRateAsync(1.0, true);
    await videoRef.current.setPositionAsync(0);
    await videoRef.current.playAsync();
  };

  const stopPreview = async () => {
    previewRef.current = { active: false, pass: 0, fired: new Set(), transitioning: false };
    setPreviewPass(0);
    setPreviewWord("");
    await videoRef.current?.setRateAsync(1.0, true);
    await videoRef.current?.pauseAsync();
    await videoRef.current?.setPositionAsync(0);
  };

  // Export is a stub for now: it runs the same in-app preview as the Preview
  // button until real video-file export (server-side compositing) is built.
  const handleExport = startPreview;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + (Platform.OS === "web" ? 20 : 10),
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 84 : 60),
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>ANALYSIS</Text>
        <Text style={styles.subtitle}>Video Frame Counter</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {!videoUri ? (
          <Pressable
            onPress={pickVideo}
            style={({ pressed }) => [
              styles.importButton,
              pressed && { opacity: 0.8 },
            ]}
          >
            <MaterialCommunityIcons
              name="video-plus"
              size={40}
              color="#1A8CFF"
            />
            <Text style={styles.importTitle}>Import Swing Video</Text>
            <Text style={styles.importSubtitle}>
              Select from your camera roll
            </Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.videoWrapper}>
              <Video
                ref={videoRef}
                source={{ uri: videoUri }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                isLooping={false}
                progressUpdateIntervalMillis={MS_PER_FRAME}
                onPlaybackStatusUpdate={handleStatus}
              />
              <View style={styles.frameOverlay}>
                <Text style={styles.frameCounter}>
                  Frame {currentFrame.toString().padStart(4, "0")}
                </Text>
                <Text style={styles.timecodeText}>
                  {(currentMs / 1000).toFixed(3)}s
                </Text>
              </View>
              {previewPass > 0 && (
                <View style={styles.passBadge}>
                  <Text style={styles.passLabel}>
                    {previewPass < 3 ? `PASS ${previewPass}/3` : "SLOW MOTION"}
                  </Text>
                </View>
              )}
              {previewWord !== "" && (
                <View style={styles.phaseWordWrap} pointerEvents="none">
                  <Text style={styles.phaseWord}>{previewWord}</Text>
                </View>
              )}
              {analysis && (
                <View style={[styles.gradeOverlay, { borderColor: analysis.gradeColor + "66" }]}>
                  <Text style={[styles.gradeOverlayGrade, { color: analysis.gradeColor }]}>
                    {analysis.grade}
                  </Text>
                  <Text style={styles.gradeOverlayRatio}>{analysis.ratio}:1</Text>
                </View>
              )}
            </View>

            <View style={styles.scrubBar}>
              <Pressable
                style={styles.scrubBtn}
                onPress={() => seekByFrames(-10)}
              >
                <Feather name="chevrons-left" size={20} color="#888" />
                <Text style={styles.scrubLabel}>10</Text>
              </Pressable>
              <Pressable
                style={styles.scrubBtn}
                onPress={() => seekByFrames(-1)}
              >
                <Feather name="chevron-left" size={20} color="#CCCCCC" />
                <Text style={styles.scrubLabel}>1</Text>
              </Pressable>
              <Pressable
                style={styles.playPauseBtn}
                onPress={async () => {
                  if (isPlaying) {
                    await videoRef.current?.pauseAsync();
                  } else {
                    await videoRef.current?.playAsync();
                  }
                }}
              >
                <Feather
                  name={isPlaying ? "pause" : "play"}
                  size={22}
                  color="#FFFFFF"
                />
              </Pressable>
              <Pressable
                style={styles.scrubBtn}
                onPress={() => seekByFrames(1)}
              >
                <Text style={styles.scrubLabel}>1</Text>
                <Feather name="chevron-right" size={20} color="#CCCCCC" />
              </Pressable>
              <Pressable
                style={styles.scrubBtn}
                onPress={() => seekByFrames(10)}
              >
                <Text style={styles.scrubLabel}>10</Text>
                <Feather name="chevrons-right" size={20} color="#888" />
              </Pressable>
            </View>

            <View style={styles.marksSection}>
              <Text style={styles.sectionLabel}>MARK POSITIONS</Text>
              <View style={styles.marksRow}>
                {(["takeaway", "top", "impact"] as const).map((mark) => {
                  const labels = { takeaway: "TAKEAWAY", top: "TOP", impact: "IMPACT" };
                  const colors = {
                    takeaway: "#1A8CFF",
                    top: "#FF9F0A",
                    impact: "#FF3B30",
                  };
                  const val = marks[mark];
                  return (
                    <View key={mark} style={styles.markCard}>
                      <View
                        style={[
                          styles.markBadge,
                          { backgroundColor: colors[mark] + "22" },
                        ]}
                      >
                        <Text
                          style={[styles.markLetter, { color: colors[mark] }]}
                        >
                          {mark.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.markLabel}>{labels[mark]}</Text>
                      {val !== null ? (
                        <View style={styles.markValueRow}>
                          <Text style={styles.markValue}>
                            {Math.round(val / MS_PER_FRAME)}f
                          </Text>
                          <Pressable onPress={() => clearMark(mark)}>
                            <Feather name="x" size={12} color="#444" />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          style={[
                            styles.setMarkBtn,
                            { borderColor: colors[mark] },
                          ]}
                          onPress={() => markFrame(mark)}
                        >
                          <Text
                            style={[
                              styles.setMarkLabel,
                              { color: colors[mark] },
                            ]}
                          >
                            SET
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {analysis ? (
              <View style={styles.analysisCard}>
                <View style={styles.analysisHeader}>
                  <Text style={styles.sectionLabel}>SWING ANALYSIS</Text>
                  <View
                    style={[
                      styles.gradeBadge,
                      { backgroundColor: analysis.gradeColor + "22" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.gradeText,
                        { color: analysis.gradeColor },
                      ]}
                    >
                      {analysis.grade}
                    </Text>
                  </View>
                </View>

                <View style={styles.accuracyRow}>
                  <View style={styles.scoreCircle}>
                    <Text
                      style={[
                        styles.scoreNumber,
                        { color: analysis.gradeColor },
                      ]}
                    >
                      {analysis.accuracy}
                    </Text>
                    <Text style={styles.scoreUnit}>%</Text>
                  </View>
                  <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>BACKSWING</Text>
                      <Text style={styles.statValue}>
                        {analysis.backswingFrames}f /{" "}
                        {analysis.backswingMs.toFixed(0)}ms
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>DOWNSWING</Text>
                      <Text style={styles.statValue}>
                        {analysis.downswingFrames}f /{" "}
                        {analysis.downswingMs.toFixed(0)}ms
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>YOUR RATIO</Text>
                      <Text style={styles.statValue}>{analysis.ratio}:1</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>GOLD STANDARD</Text>
                      <Text style={[styles.statValue, { color: "#FFD700" }]}>
                        3.00:1
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.hintCard}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={18}
                  color="#333333"
                />
                <Text style={styles.hintText}>
                  Pause the video and set all three frame markers to calculate
                  your swing ratio
                </Text>
              </View>
            )}

            <View style={styles.marksSection}>
              <Text style={styles.sectionLabel}>PREVIEW AUDIO</Text>
              <View style={styles.audioModeGroup}>
                {(["tones", "piano", "voice"] as const).map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.audioModeBtn, audioMode === m && styles.audioModeBtnActive]}
                    onPress={() => { Haptics.selectionAsync(); setAudioMode(m); }}
                  >
                    <Text style={[styles.audioModeLabel, audioMode === m && styles.audioModeLabelActive]}>
                      {m === "tones" ? "Beeps" : m === "piano" ? "Piano" : "Voice"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {previewPass === 0 ? (
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, !analysis && styles.actionBtnDim]}
                  onPress={analysis ? startPreview : undefined}
                >
                  <Feather name="play-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.actionBtnLabel}>Preview</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnSecondary, !analysis && styles.actionBtnDim]}
                  onPress={analysis ? handleExport : undefined}
                >
                  <Feather name="download" size={20} color={BLUE} style={{ marginRight: 8 }} />
                  <Text style={[styles.actionBtnLabel, { color: BLUE }]}>Export</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={[styles.actionBtn, styles.actionBtnStop]} onPress={stopPreview}>
                <Feather name="square" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnLabel}>Stop Preview</Text>
              </Pressable>
            )}

            {!analysis && (
              <Text style={styles.allSetHint}>Set all 3 markers to enable Preview &amp; Export</Text>
            )}

            <Pressable
              style={styles.reImportBtn}
              onPress={pickVideo}
            >
              <Feather name="refresh-cw" size={14} color="#444444" />
              <Text style={styles.reImportText}>Import Different Video</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { paddingHorizontal: 24, marginBottom: 16 },
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },
  importButton: {
    borderWidth: 1.5,
    borderColor: "#1A1A1A",
    borderStyle: "dashed",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    gap: 10,
  },
  importTitle: {
    fontSize: 16,
    color: "#CCCCCC",
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  importSubtitle: {
    fontSize: 12,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
  videoWrapper: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0D0D0D",
    marginBottom: 12,
    position: "relative",
  },
  video: { width: "100%", height: 220 },
  frameOverlay: {
    position: "absolute",
    top: 10,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  frameCounter: {
    fontSize: 13,
    color: "#1A8CFF",
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    letterSpacing: 1,
  },
  timecodeText: {
    fontSize: 11,
    color: "#888888",
    fontFamily: "Inter_400Regular",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  passBadge: {
    position: "absolute",
    bottom: 8,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  passLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: ORANGE },
  phaseWordWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 44,
    alignItems: "center",
  },
  phaseWord: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  gradeOverlay: {
    position: "absolute",
    top: 10,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  gradeOverlayGrade: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  gradeOverlayRatio: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#CCCCCC",
    marginTop: 1,
  },
  audioModeGroup: {
    flexDirection: "row",
    backgroundColor: "#0D0D0D",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  audioModeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  audioModeBtnActive: { backgroundColor: BLUE },
  audioModeLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#555555",
  },
  audioModeLabelActive: { color: "#FFFFFF" },
  scrubBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20,
  },
  scrubBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  scrubLabel: {
    fontSize: 11,
    color: "#666666",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  playPauseBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1A8CFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1A8CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  marksSection: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 10,
    color: "#444444",
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 10,
    fontFamily: "Inter_600SemiBold",
  },
  marksRow: { flexDirection: "row", gap: 8 },
  markCard: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  markBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  markLetter: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  markLabel: {
    fontSize: 8,
    color: "#444444",
    letterSpacing: 1,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  markValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  markValue: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  setMarkBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  setMarkLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "Inter_700Bold",
  },
  analysisCard: {
    backgroundColor: "#0D0D0D",
    borderRadius: 16,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    marginBottom: 16,
  },
  analysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gradeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gradeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    fontFamily: "Inter_700Bold",
  },
  accuracyRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#111111",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#222222",
    flexDirection: "row",
    alignItems: "baseline" as const,
    gap: 0,
  },
  scoreNumber: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  scoreUnit: {
    fontSize: 14,
    color: "#666666",
    fontFamily: "Inter_400Regular",
  },
  statsGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statItem: { width: "47%", gap: 3 },
  statLabel: {
    fontSize: 8,
    color: "#444444",
    letterSpacing: 1.5,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  statValue: {
    fontSize: 13,
    color: "#CCCCCC",
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0D0D0D",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    marginBottom: 16,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: "#444444",
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingVertical: 16,
  },
  actionBtnDim: { opacity: 0.4 },
  actionBtnSecondary: { backgroundColor: BLUE + "18", borderWidth: 1, borderColor: BLUE + "44" },
  actionBtnStop: { backgroundColor: RED + "22", borderWidth: 1, borderColor: RED + "44", marginBottom: 16 },
  actionBtnLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF" },
  allSetHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#333",
    textAlign: "center",
    marginBottom: 16,
  },
  reImportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  reImportText: {
    fontSize: 13,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
});
