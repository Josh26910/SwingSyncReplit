import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TempoDial } from "@/components/TempoDial";
import {
  TEMPOS,
  TempoKey,
  useTempo,
} from "@/context/TempoContext";
import { useTempoEngine } from "@/hooks/useTempoEngine";
import { useColors } from "@/hooks/useColors";

const TEMPO_KEYS: TempoKey[] = ["18/6", "21/7", "24/8", "27/9", "30/10"];

const PHASE_LABELS: Record<string, string> = {
  ready: "READY",
  start: "TAKEAWAY",
  top: "TOP",
  impact: "IMPACT",
};

const PHASE_COLORS: Record<string, string> = {
  ready: "#444444",
  start: "#1A8CFF",
  top: "#FFB300",
  impact: "#FF3B30",
};

export default function TonesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
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
    dialProgress,
  } = useTempo();

  useTempoEngine();

  const def = TEMPOS[selectedTempo];
  const phaseColor = PHASE_COLORS[currentPhase] ?? "#444444";
  const phaseLabel = PHASE_LABELS[currentPhase] ?? "READY";

  const handlePlayStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPlaying(!isPlaying);
  };

  const handleTempoSelect = (key: TempoKey) => {
    Haptics.selectionAsync();
    if (isPlaying) setIsPlaying(false);
    setSelectedTempo(key);
  };

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
        <Text style={styles.appTitle}>SWING TEMPO</Text>
        <View style={styles.phaseIndicator}>
          <View style={[styles.phaseDot, { backgroundColor: phaseColor }]} />
          <Text style={[styles.phaseText, { color: phaseColor }]}>
            {phaseLabel}
          </Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.segmentGroup}>
          {(["long", "short"] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.segmentBtn,
                gameMode === mode && styles.segmentBtnActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setGameMode(mode);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  gameMode === mode && styles.segmentLabelActive,
                ]}
              >
                {mode === "long" ? "Long Game" : "Short Game"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.segmentGroup}>
          {(["tones", "voice"] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.segmentBtn,
                audioMode === mode && styles.segmentBtnActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setAudioMode(mode);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  audioMode === mode && styles.segmentLabelActive,
                ]}
              >
                {mode === "tones" ? "Tones" : "Voice"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tempoScroll}
      >
        {TEMPO_KEYS.map((key) => {
          const isSelected = key === selectedTempo;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => handleTempoSelect(key)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.tempoCircle,
                  isSelected && styles.tempoCircleActive,
                ]}
              >
                <Text
                  style={[
                    styles.tempoLabel,
                    isSelected && styles.tempoLabelActive,
                  ]}
                >
                  {key}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.dialContainer}>
        <TempoDial
          tempo={selectedTempo}
          phase={currentPhase}
          progress={dialProgress}
        />
        <View style={styles.timingInfo}>
          <View style={styles.timingItem}>
            <View
              style={[styles.timingDot, { backgroundColor: "#FF3B30" }]}
            />
            <Text style={styles.timingLabel}>TOP</Text>
            <Text style={styles.timingValue}>{def.topMs}ms</Text>
          </View>
          <View style={styles.timingDivider} />
          <View style={styles.timingItem}>
            <View
              style={[styles.timingDot, { backgroundColor: "#FF3B30" }]}
            />
            <Text style={styles.timingLabel}>IMPACT</Text>
            <Text style={styles.timingValue}>{def.impactMs}ms</Text>
          </View>
          <View style={styles.timingDivider} />
          <View style={styles.timingItem}>
            <View
              style={[styles.timingDot, { backgroundColor: "#1A8CFF" }]}
            />
            <Text style={styles.timingLabel}>RATIO</Text>
            <Text style={styles.timingValue}>3:1</Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={handlePlayStop}
        style={({ pressed }) => [
          styles.fab,
          isPlaying && styles.fabActive,
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        <Feather
          name={isPlaying ? "square" : "play"}
          size={28}
          color="#FFFFFF"
        />
        <Text style={styles.fabLabel}>{isPlaying ? "STOP" : "START"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
  },
  header: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 3,
    fontFamily: "Inter_700Bold",
  },
  phaseIndicator: {
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
    fontWeight: "600",
    letterSpacing: 2,
    fontFamily: "Inter_600SemiBold",
  },
  toggleRow: {
    width: "100%",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  segmentGroup: {
    flexDirection: "row",
    backgroundColor: "#111111",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: "#222222",
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: "#1A8CFF",
  },
  segmentLabel: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  segmentLabelActive: {
    color: "#FFFFFF",
  },
  tempoScroll: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  tempoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
  },
  tempoCircleActive: {
    borderColor: "#1A8CFF",
    backgroundColor: "#0A1A2A",
    shadowColor: "#1A8CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  tempoLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555555",
    fontFamily: "Inter_700Bold",
  },
  tempoLabelActive: {
    color: "#1A8CFF",
  },
  dialContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    gap: 16,
  },
  timingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  timingItem: {
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 4,
  },
  timingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timingLabel: {
    fontSize: 9,
    letterSpacing: 2,
    color: "#444444",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  timingValue: {
    fontSize: 14,
    color: "#CCCCCC",
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  timingDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#222222",
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#1A8CFF",
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 50,
    marginBottom: 16,
    shadowColor: "#1A8CFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabActive: {
    backgroundColor: "#FF3B30",
    shadowColor: "#FF3B30",
  },
  fabLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 2,
    fontFamily: "Inter_700Bold",
  },
});
