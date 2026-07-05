import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import React, { useRef, useState } from "react";
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

const FPS = 30;
const MS_PER_FRAME = 1000 / FPS;
const PERFECT_RATIO = 3.0;

interface FrameMarks {
  a: number | null;
  b: number | null;
  c: number | null;
}

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [marks, setMarks] = useState<FrameMarks>({ a: null, b: null, c: null });
  const [isPlaying, setIsPlaying] = useState(false);

  const currentFrame = Math.round(currentMs / MS_PER_FRAME);

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
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
      setMarks({ a: null, b: null, c: null });
      setCurrentMs(0);
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

  const markFrame = (mark: "a" | "b" | "c") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMarks((prev) => ({ ...prev, [mark]: currentMs }));
  };

  const clearMark = (mark: "a" | "b" | "c") => {
    setMarks((prev) => ({ ...prev, [mark]: null }));
  };

  const getAnalysis = () => {
    if (marks.a === null || marks.b === null || marks.c === null) return null;
    const backswingMs = marks.b - marks.a;
    const downswingMs = marks.c - marks.b;
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
                onPlaybackStatusUpdate={(status) => {
                  if (status.isLoaded) {
                    setCurrentMs(status.positionMillis ?? 0);
                    setDurationMs(status.durationMillis ?? 0);
                    setIsPlaying(status.isPlaying);
                  }
                }}
              />
              <View style={styles.frameOverlay}>
                <Text style={styles.frameCounter}>
                  Frame {currentFrame.toString().padStart(4, "0")}
                </Text>
                <Text style={styles.timecodeText}>
                  {(currentMs / 1000).toFixed(3)}s
                </Text>
              </View>
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
                {(["a", "b", "c"] as const).map((mark) => {
                  const labels = { a: "TAKEAWAY", b: "TOP", c: "IMPACT" };
                  const colors = {
                    a: "#1A8CFF",
                    b: "#FF9F0A",
                    c: "#FF3B30",
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
                          {mark.toUpperCase()}
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

            <Pressable
              style={styles.reImportBtn}
              onPress={() => {
                setVideoUri(null);
                setMarks({ a: null, b: null, c: null });
              }}
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
    alignItems: "center",
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
