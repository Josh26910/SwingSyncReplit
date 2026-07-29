import { Feather } from "@expo/vector-icons";
import React from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";

const BLUE = "#1A8CFF";

interface TempoVideoEmbedProps {
  youtubeId: string;
  clipStartSec?: number | null;
  clipEndSec?: number | null;
}

// Links out to YouTube on every platform rather than embedding inline.
// An inline player (react-native-youtube-iframe) was tried and reverted —
// it broke both web (its web build pulls in react-native-web-webview,
// which isn't installed) and native (the deployed build's node_modules
// never picked up the new dependency). Revisit once there's an actual need
// for inline playback; a plain link has no dependency-install failure mode.
export default function TempoVideoEmbed({ youtubeId, clipStartSec }: TempoVideoEmbedProps) {
  const url = `https://www.youtube.com/watch?v=${youtubeId}${clipStartSec ? `&t=${Math.round(clipStartSec)}s` : ""}`;
  return (
    <Pressable style={styles.fallback} onPress={() => Linking.openURL(url)}>
      <Feather name="youtube" size={16} color={BLUE} />
      <Text style={styles.fallbackText}>Watch on YouTube</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#1E1E1E",
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 24,
  },
  fallbackText: { color: BLUE, fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
