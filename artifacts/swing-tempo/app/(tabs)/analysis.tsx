import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import type { AVPlaybackStatus } from "expo-av";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
const LONG_GAME_RATIO = 3.0;
const SHORT_GAME_RATIO = 2.0;
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

function toTitleCase(text: string): string {
  return text.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const videoRef = useRef<Video>(null);
  const { audioMode, setAudioMode, gameMode, setGameMode } = useTempo();
  const { activeSwing, activeOrigin, addSwing, updateSwing, setActive } = useSwingLibrary();
  const perfectRatio = gameMode === "short" ? SHORT_GAME_RATIO : LONG_GAME_RATIO;

  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewPass, setPreviewPass] = useState<0 | 1 | 2 | 3>(0);
  const [previewWord, setPreviewWord] = useState("");
  const [marksConfirmed, setMarksConfirmed] = useState(false);
  const previewRef = useRef<PreviewState>({
    active: false,
    pass: 0,
    fired: new Set(),
    transitioning: false,
  });

  const videoUri = activeSwing?.uri ?? null;
  const marks: Markers = activeSwing?.markers ?? EMPTY_MARKERS;
  const golferName = activeSwing?.golferName ?? "";

  const setGolferName = (text: string) => {
    if (!activeSwing) return;
    updateSwing(activeOrigin, activeSwing.id, { golferName: text });
  };

  const currentFrame = Math.round(currentMs / MS_PER_FRAME);

  // Reset transient playback state whenever the active swing changes.
  useEffect(() => {
    setCurrentMs(0);
    setDurationMs(0);
    setVideoAspect(null);
    setIsPlaying(false);
    setPreviewPass(0);
    setPreviewWord("");
    setMarksConfirmed(false);
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
    const accuracy = Math.max(0, 100 - Math.abs(ratio - perfectRatio) * 33);
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

  // Live frame counter: a single growing number during the backswing, then
  // a backswing/downswing split that keeps counting through the downswing,
  // freezing into the final ratio once impact is reached — mirrors the
  // reference clip's counting badge instead of a static number.
  const takeawayFrame = marks.takeaway !== null ? Math.round(marks.takeaway / MS_PER_FRAME) : null;
  const topFrame = marks.top !== null ? Math.round(marks.top / MS_PER_FRAME) : null;
  const impactFrame = marks.impact !== null ? Math.round(marks.impact / MS_PER_FRAME) : null;

  let counterPhase: "hidden" | "back" | "down" | "done" = "hidden";
  let backCount = 0;
  let downCount = 0;

  if (takeawayFrame !== null && currentFrame >= takeawayFrame) {
    if (topFrame === null || currentFrame < topFrame) {
      counterPhase = "back";
      backCount = currentFrame - takeawayFrame;
    } else {
      backCount = topFrame - takeawayFrame;
      if (impactFrame === null || currentFrame < impactFrame) {
        counterPhase = "down";
        downCount = currentFrame - topFrame;
      } else {
        counterPhase = "done";
        downCount = impactFrame - topFrame;
      }
    }
  }

  // Docked (non-fullscreen) mode sizes the video box to the source's real
  // aspect ratio instead of a fixed height, so there's no dead letterbox
  // space for the frame counter/name caption/watermark to float in.
  const handleReadyForDisplay = (event: { naturalSize: { width: number; height: number } }) => {
    const { width, height } = event.naturalSize;
    if (width > 0 && height > 0) setVideoAspect(width / height);
  };

  const dockedVideoWidth = screenWidth - 40; // matches videoWrapper's marginHorizontal:20
  const dockedVideoHeight = videoAspect
    ? Math.min(Math.max(dockedVideoWidth / videoAspect, 180), 340)
    : 240;

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

  const isMarking = !!videoUri && !marksConfirmed && previewPass === 0;
  const isFullscreen = previewPass > 0 || isMarking;

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
      {!isFullscreen && (
        <View style={styles.header}>
          <Text style={styles.title}>ANALYSIS</Text>
          <Text style={styles.subtitle}>Video Frame Counter</Text>
        </View>
      )}

      {videoUri ? (
        <View style={[styles.videoWrapper, isFullscreen && styles.videoWrapperFullscreen]}>
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={[
              styles.video,
              !isFullscreen && { height: dockedVideoHeight },
              isFullscreen && styles.videoFullscreen,
            ]}
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
            progressUpdateIntervalMillis={MS_PER_FRAME}
            onPlaybackStatusUpdate={handleStatus}
            onReadyForDisplay={handleReadyForDisplay}
          />
          {previewPass === 0 && (
            <View style={styles.frameOverlay}>
              <Text style={styles.frameCounter}>
                Frame {currentFrame.toString().padStart(4, "0")}
              </Text>
              <Text style={styles.timecodeText}>
                {(currentMs / 1000).toFixed(3)}s
              </Text>
            </View>
          )}
          {previewPass > 0 && (
            <Pressable style={styles.fullscreenCloseBtn} onPress={stopPreview}>
              <Feather name="x" size={22} color="#FFF" />
            </Pressable>
          )}
          <View style={styles.bottomLeftStack} pointerEvents="none">
            {previewPass > 0 && (
              <View style={styles.passBadge}>
                <Text style={styles.passLabel}>
                  {previewPass < 3 ? `PASS ${previewPass}/3` : "SLOW MOTION"}
                </Text>
              </View>
            )}
            {golferName !== "" && (
              <View style={styles.nameCaption}>
                <Text style={styles.nameCaptionText}>{toTitleCase(golferName)}</Text>
              </View>
            )}
          </View>
          {previewWord !== "" && (
            <View style={styles.phaseWordWrap} pointerEvents="none">
              <Text style={styles.phaseWord}>{previewWord}</Text>
            </View>
          )}
          {counterPhase !== "hidden" && (
            <View style={styles.gradeOverlay} pointerEvents="none">
              {counterPhase === "done" && analysis ? (
                <>
                  <View style={[styles.gradeOverlayPill, { backgroundColor: analysis.gradeColor + "26", borderColor: analysis.gradeColor + "55" }]}>
                    <Text style={[styles.gradeOverlayGrade, { color: analysis.gradeColor }]}>
                      {analysis.grade}
                    </Text>
                  </View>
                  <Text style={styles.gradeOverlayPercent}>{analysis.accuracy}%</Text>
                  <Text style={styles.gradeOverlayRatio}>{analysis.ratio}:1</Text>
                </>
              ) : counterPhase === "back" ? (
                <Text style={[styles.counterNum, { color: BLUE }]}>{backCount}</Text>
              ) : (
                <View style={styles.counterSplitRow}>
                  <Text style={[styles.counterNum, { color: BLUE }]}>{backCount}</Text>
                  <Text style={styles.counterSlash}>/</Text>
                  <Text style={[styles.counterNum, { color: RED }]}>{downCount}</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.watermark} pointerEvents="none">
            <Image source={require("../../assets/images/icon.png")} style={styles.watermarkIcon} />
            <Text style={styles.watermarkTitle}>SwingTempo</Text>
            <Text style={styles.watermarkCta}>Download Free</Text>
          </View>

          {isMarking && (
            <View style={styles.markingOverlay}>
              <View style={styles.overlayScrubBar}>
                <Pressable style={styles.overlayScrubBtn} onPress={() => seekByFrames(-10)}>
                  <Feather name="chevrons-left" size={18} color="#CCC" />
                </Pressable>
                <Pressable style={styles.overlayScrubBtn} onPress={() => seekByFrames(-1)}>
                  <Feather name="chevron-left" size={18} color="#FFF" />
                </Pressable>
                <Pressable
                  style={styles.overlayPlayBtn}
                  onPress={async () => {
                    if (isPlaying) await videoRef.current?.pauseAsync();
                    else await videoRef.current?.playAsync();
                  }}
                >
                  <Feather name={isPlaying ? "pause" : "play"} size={20} color="#FFF" />
                </Pressable>
                <Pressable style={styles.overlayScrubBtn} onPress={() => seekByFrames(1)}>
                  <Feather name="chevron-right" size={18} color="#FFF" />
                </Pressable>
                <Pressable style={styles.overlayScrubBtn} onPress={() => seekByFrames(10)}>
                  <Feather name="chevrons-right" size={18} color="#CCC" />
                </Pressable>
              </View>

              <View style={styles.overlayMarkRow}>
                {(["takeaway", "top", "impact"] as const).map((mark) => {
                  const labels = { takeaway: "TAKEAWAY", top: "TOP", impact: "IMPACT" };
                  const colors = { takeaway: "#1A8CFF", top: "#FF9F0A", impact: "#FF3B30" };
                  const val = marks[mark];
                  return (
                    <Pressable
                      key={mark}
                      style={[
                        styles.overlayMarkBtn,
                        { borderColor: val !== null ? colors[mark] : "#333333" },
                      ]}
                      onPress={() => (val !== null ? clearMark(mark) : markFrame(mark))}
                    >
                      <Text style={[styles.overlayMarkLabel, { color: val !== null ? colors[mark] : "#999" }]}>
                        {labels[mark]}
                      </Text>
                      <Text style={styles.overlayMarkValue}>
                        {val !== null ? `${Math.round(val / MS_PER_FRAME)}f` : "SET"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[styles.doneBtn, !analysis && styles.actionBtnDim]}
                onPress={analysis ? () => setMarksConfirmed(true) : undefined}
              >
                <Text style={styles.doneBtnLabel}>
                  {analysis ? "Done" : "Set all 3 markers to continue"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      {!isFullscreen && (
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
            <Pressable
              style={styles.editMarkersBtn}
              onPress={() => setMarksConfirmed(false)}
            >
              <Feather name="edit-2" size={13} color={BLUE} />
              <Text style={styles.editMarkersText}>Edit Markers</Text>
            </Pressable>

            <View style={styles.marksSection}>
              <Text style={styles.sectionLabel}>GOLFER NAME (OPTIONAL)</Text>
              <TextInput
                style={styles.nameInput}
                value={golferName}
                onChangeText={setGolferName}
                placeholder="e.g. Jordan Spieth"
                placeholderTextColor="#444444"
              />
            </View>

            <View style={styles.marksSection}>
              <Text style={styles.sectionLabel}>SWING TYPE</Text>
              <View style={styles.audioModeGroup}>
                {(["long", "short"] as const).map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.audioModeBtn, gameMode === m && styles.audioModeBtnActive]}
                    onPress={() => { Haptics.selectionAsync(); setGameMode(m); }}
                  >
                    <Text style={[styles.audioModeLabel, gameMode === m && styles.audioModeLabelActive]}>
                      {m === "long" ? "Long Game (3:1)" : "Short Game (2:1)"}
                    </Text>
                  </Pressable>
                ))}
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
                  <View
                    style={[
                      styles.scoreCircle,
                      { borderColor: analysis.gradeColor + "55" },
                    ]}
                  >
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
                        {perfectRatio.toFixed(2)}:1
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
      )}
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
    marginHorizontal: 20,
    position: "relative",
  },
  videoWrapperFullscreen: {
    flex: 1,
    borderRadius: 0,
    marginBottom: 0,
    marginHorizontal: 0,
  },
  video: { width: "100%", height: 240 },
  videoFullscreen: { height: "100%" },
  fullscreenCloseBtn: {
    position: "absolute",
    top: 10,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  bottomLeftStack: {
    position: "absolute",
    bottom: 8,
    left: 12,
    gap: 6,
    alignItems: "flex-start",
  },
  passBadge: {
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  passLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: ORANGE,
    letterSpacing: 1,
  },
  nameCaption: {
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  nameCaptionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  watermark: {
    position: "absolute",
    right: 12,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
  },
  watermarkIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
    marginBottom: 3,
  },
  watermarkTitle: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  watermarkCta: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: BLUE,
    marginTop: 1,
  },
  markingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  overlayScrubBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  overlayScrubBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayPlayBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayMarkRow: { flexDirection: "row", gap: 8 },
  overlayMarkBtn: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  overlayMarkLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  overlayMarkValue: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  doneBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  doneBtnLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  phaseWordWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 44,
    alignItems: "center",
  },
  phaseWord: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 3,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  gradeOverlay: {
    position: "absolute",
    top: 10,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  gradeOverlayPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 4,
  },
  gradeOverlayGrade: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  gradeOverlayPercent: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  gradeOverlayRatio: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#999999",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  counterNum: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  counterSplitRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  counterSlash: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#555555",
  },
  nameInput: {
    backgroundColor: "#0D0D0D",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#FFFFFF",
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
  marksSection: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 10,
    color: "#444444",
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 10,
    fontFamily: "Inter_600SemiBold",
  },
  editMarkersBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: BLUE + "18",
    borderWidth: 1,
    borderColor: BLUE + "44",
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 16,
  },
  editMarkersText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: BLUE,
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
    backgroundColor: "#161616",
    justifyContent: "center",
    borderWidth: 1.5,
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
