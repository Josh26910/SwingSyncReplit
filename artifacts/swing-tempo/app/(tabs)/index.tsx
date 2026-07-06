import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SwingTimeline } from "@/components/SwingTimeline";
import {
  getEffectiveDef,
  TempoKey,
  useTempo,
} from "@/context/TempoContext";
import { useTempoEngine } from "@/hooks/useTempoEngine";

const TEMPO_KEYS: TempoKey[] = ["18/6", "21/7", "24/8", "27/9", "30/10"];

const BLUE    = "#1A8CFF";
const CRIMSON = "#FF3B30";

const PHASE_COLORS: Record<string, string> = {
  ready:  "#444444",
  start:  BLUE,
  top:    "#FFB300",
  impact: CRIMSON,
};

const PHASE_LABELS: Record<string, string> = {
  ready:  "READY",
  start:  "TAKEAWAY",
  top:    "TOP",
  impact: "IMPACT",
};

export default function TonesScreen() {
  const insets = useSafeAreaInsets();
  const {
    selectedTempo,
    setSelectedTempo,
    gameMode,
    setGameMode,
    audioMode,
    setAudioMode,
    isPlaying,
    setIsPlaying,
    currentPhase,
    cycleProgress,
    customTempo,
    setCustomTempo,
  } = useTempo();

  useTempoEngine();

  // Use the effective definition — handles custom player tempo
  const def           = getEffectiveDef(selectedTempo, customTempo);
  const cycleDuration = def.impactMs + 700;
  const topN          = def.topMs    / cycleDuration;
  const impN          = def.impactMs / cycleDuration;
  const topFrac       = def.topMs    / def.impactMs;

  // Dot position (0=START, 1=HIT)
  let dotFrac = 0;
  if (isPlaying && cycleProgress > 0) {
    if (cycleProgress <= topN) {
      dotFrac = (cycleProgress / topN) * topFrac;
    } else if (cycleProgress <= impN) {
      dotFrac = topFrac + ((cycleProgress - topN) / (impN - topN)) * (1 - topFrac);
    }
  }

  // Elapsed swing time for the duration display
  let elapsedMs = 0;
  if (isPlaying && cycleProgress > 0) {
    if (cycleProgress <= topN) {
      elapsedMs = (cycleProgress / topN) * def.topMs;
    } else if (cycleProgress <= impN) {
      elapsedMs = def.topMs + ((cycleProgress - topN) / (impN - topN)) * (def.impactMs - def.topMs);
    }
  }

  const totalStr    = (def.impactMs / 1000).toFixed(2) + "s";
  const elapsedStr  = (elapsedMs / 1000).toFixed(2) + "s";
  const showElapsed = isPlaying && elapsedMs > 0;

  const backswingS  = (def.topMs / 1000).toFixed(2) + "s";
  const downswingS  = ((def.impactMs - def.topMs) / 1000).toFixed(2) + "s";
  const ratioNum    = def.topMs / (def.impactMs - def.topMs);
  const ratioStr    = ratioNum.toFixed(2) + ":1";

  const phaseColor = PHASE_COLORS[currentPhase] ?? "#444444";
  const phaseLabel = PHASE_LABELS[currentPhase] ?? "READY";

  const handlePlayStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPlaying(!isPlaying);
  };

  const handleTempoSelect = (key: TempoKey) => {
    Haptics.selectionAsync();
    if (isPlaying) setIsPlaying(false);
    // Selecting a standard tempo clears the custom player
    if (key !== "custom") setCustomTempo(null);
    setSelectedTempo(key);
  };

  // Short label for custom circle
  const customLabel = customTempo
    ? customTempo.name.split(" ")[1]?.slice(0, 4) ?? "Pro"
    : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop:    insets.top + (Platform.OS === "web" ? 20 : 10),
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 100 : 80),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.appTitle}>SWING TEMPO</Text>
        <View style={styles.phaseChip}>
          <View style={[styles.phaseDot, { backgroundColor: phaseColor }]} />
          <Text style={[styles.phaseText, { color: phaseColor }]}>{phaseLabel}</Text>
        </View>
      </View>

      {/* ── Game mode ──────────────────────────────────────────── */}
      <View style={styles.px}>
        <View style={styles.segGroup}>
          {(["long", "short"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segBtn, gameMode === m && styles.segBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setGameMode(m); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.segLabel, gameMode === m && styles.segLabelActive]}>
                {m === "long" ? "Long Game" : "Short Game"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Audio mode toggle (moved up) ───────────────────────── */}
      <View style={styles.px}>
        <View style={styles.segGroup}>
          {(["tones", "voice"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segBtn, audioMode === m && styles.segBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setAudioMode(m); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.segLabel, audioMode === m && styles.segLabelActive]}>
                {m === "tones" ? "Tones" : "Voice"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Tempo selector ─────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tempoRow}
      >
        {TEMPO_KEYS.map((key) => {
          const active = key === selectedTempo;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => handleTempoSelect(key)}
              activeOpacity={0.75}
            >
              <View style={[styles.tempoCircle, active && styles.tempoCircleActive]}>
                <Text style={[styles.tempoLabel, active && styles.tempoLabelActive]}>
                  {key}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Custom tempo circle — appears when a player tempo is loaded */}
        {customTempo !== null && (
          <TouchableOpacity
            onPress={() => handleTempoSelect("custom")}
            activeOpacity={0.75}
          >
            <View
              style={[
                styles.tempoCircle,
                styles.tempoCircleCustom,
                selectedTempo === "custom" && styles.tempoCircleCustomActive,
              ]}
            >
              <Text
                style={[
                  styles.tempoLabelCustom,
                  selectedTempo === "custom" && styles.tempoLabelCustomActive,
                ]}
                numberOfLines={1}
              >
                {customLabel}
              </Text>
              <Text
                style={[
                  styles.tempoSubLabel,
                  selectedTempo === "custom" && styles.tempoSubLabelActive,
                ]}
              >
                PRO
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ── Player name badge (when custom tempo active) ────────── */}
      {selectedTempo === "custom" && customTempo !== null && (
        <View style={styles.playerBadge}>
          <Feather name="user" size={12} color={BLUE} />
          <Text style={styles.playerBadgeText}>
            {customTempo.name}  ·  {customTempo.event} {customTempo.year}
          </Text>
        </View>
      )}

      {/* ── Main info area (no heavy centering) ─────────────────── */}
      <View style={styles.infoArea}>

        {/* Big ratio */}
        <Text style={styles.bigRatio}>{ratioStr}</Text>
        <Text style={styles.ratioLabel}>TEMPO RATIO</Text>

        {/* Duration */}
        <View style={styles.durationRow}>
          {showElapsed ? (
            <>
              <Text style={[styles.durationNum, { color: BLUE }]}>{elapsedStr}</Text>
              <Text style={styles.durationSep}> / </Text>
              <Text style={styles.durationNum}>{totalStr}</Text>
            </>
          ) : (
            <Text style={styles.durationNum}>{totalStr}</Text>
          )}
        </View>
        <Text style={styles.durationLabel}>START TO IMPACT</Text>

        {/* Play / Stop button (moved between duration and stats) */}
        <Pressable
          onPress={handlePlayStop}
          style={({ pressed }) => [
            styles.playBtn,
            isPlaying && styles.playBtnStop,
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Feather
            name={isPlaying ? "square" : "play"}
            size={20}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.playBtnLabel}>{isPlaying ? "Stop" : "Play"}</Text>
        </Pressable>
        <Text style={styles.loopHint}>AUTO-LOOP ON  ·  TAP TO START</Text>

        {/* Stat boxes */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>BACKSWING</Text>
            <Text style={styles.statBoxValue}>{backswingS}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>DOWNSWING</Text>
            <Text style={styles.statBoxValue}>{downswingS}</Text>
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.timelineWrap}>
          <SwingTimeline
            topFrac={topFrac}
            dotFrac={dotFrac}
            isPlaying={isPlaying}
            currentPhase={currentPhase}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollContent: {
    flexGrow: 1,
  },
  px: {
    paddingHorizontal: 20,
    marginBottom: 12,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 14,
    width: "100%",
  },
  appTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 3,
  },
  phaseChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  phaseText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  segGroup: {
    flexDirection: "row",
    backgroundColor: "#111111",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: "#222222",
  },
  segBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  segBtnActive: {
    backgroundColor: BLUE,
  },
  segLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#555555",
  },
  segLabelActive: {
    color: "#FFFFFF",
  },
  tempoRow: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 6,
  },
  tempoCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
  },
  tempoCircleActive: {
    borderColor: BLUE,
    backgroundColor: "#0A1A2A",
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  tempoLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#555555",
  },
  tempoLabelActive: {
    color: BLUE,
  },
  // Custom tempo circle
  tempoCircleCustom: {
    borderColor: "#2A3A2A",
    backgroundColor: "#0D150D",
    borderStyle: "dashed",
  },
  tempoCircleCustomActive: {
    borderColor: "#00C853",
    backgroundColor: "#071007",
    borderStyle: "solid",
    shadowColor: "#00C853",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  tempoLabelCustom: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#3A6A3A",
  },
  tempoLabelCustomActive: {
    color: "#00C853",
  },
  tempoSubLabel: {
    fontSize: 8,
    fontFamily: "Inter_500Medium",
    color: "#2A4A2A",
    letterSpacing: 1,
    marginTop: 1,
  },
  tempoSubLabelActive: {
    color: "#00C853",
  },
  // Player badge
  playerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: "#0A1A2A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#1A3A5A",
  },
  playerBadgeText: {
    color: BLUE,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  infoArea: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  bigRatio: {
    fontSize: 76,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -3,
    lineHeight: 84,
  },
  ratioLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#555555",
    letterSpacing: 2,
    marginTop: 2,
    marginBottom: 16,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  durationNum: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  durationSep: {
    fontSize: 22,
    fontFamily: "Inter_500Medium",
    color: "#444444",
  },
  durationLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#555555",
    letterSpacing: 2,
    marginTop: 2,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E1E1E",
  },
  statBoxLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "#555555",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statBoxValue: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  timelineWrap: {
    width: "100%",
    marginBottom: 4,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 8,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  playBtnStop: {
    backgroundColor: "#1A1A1A",
    shadowColor: "#000000",
    borderWidth: 1,
    borderColor: "#333333",
  },
  playBtnLabel: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  loopHint: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "#333333",
    textAlign: "center",
    letterSpacing: 1.2,
  },
});
