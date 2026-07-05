import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Track {
  id: string;
  title: string;
  artist: string;
  category: "ambient" | "binaural";
  duration: string;
  bpm?: number;
}

const TRACKS: Track[] = [
  {
    id: "1",
    title: "On the Dance Floor",
    artist: "SwingTempo Audio",
    category: "ambient",
    duration: "4:32",
    bpm: 120,
  },
  {
    id: "2",
    title: "Texas Wedge",
    artist: "SwingTempo Audio",
    category: "ambient",
    duration: "3:58",
    bpm: 95,
  },
  {
    id: "3",
    title: "Island Course",
    artist: "SwingTempo Audio",
    category: "ambient",
    duration: "5:14",
    bpm: 80,
  },
  {
    id: "4",
    title: "Medalist",
    artist: "SwingTempo Binaural",
    category: "binaural",
    duration: "10:00",
  },
  {
    id: "5",
    title: "Under Par",
    artist: "SwingTempo Binaural",
    category: "binaural",
    duration: "10:00",
  },
];

export default function TracksScreen() {
  const insets = useSafeAreaInsets();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);

  const handlePlay = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayingId(playingId === id ? null : id);
  };

  const ambientTracks = TRACKS.filter((t) => t.category === "ambient");
  const binauralTracks = TRACKS.filter((t) => t.category === "binaural");

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
        <Text style={styles.title}>TRACKS</Text>
        <Text style={styles.subtitle}>Rhythm Overlay Mixer</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionLabel}>AMBIENT TRACKS</Text>
        {ambientTracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            isPlaying={playingId === track.id}
            onPress={() => handlePlay(track.id)}
          />
        ))}

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
          BINAURAL ALPHA WAVES
        </Text>
        {binauralTracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            isPlaying={playingId === track.id}
            onPress={() => handlePlay(track.id)}
          />
        ))}

        <View style={styles.mixerCard}>
          <Text style={styles.mixerTitle}>MIXER SETTINGS</Text>
          <View style={styles.mixerRow}>
            <MaterialCommunityIcons
              name="volume-medium"
              size={18}
              color="#666"
            />
            <View style={styles.sliderTrack}>
              <View
                style={[styles.sliderFill, { width: `${volume * 100}%` }]}
              />
              <View
                style={[
                  styles.sliderThumb,
                  { left: `${volume * 100}%` as unknown as number },
                ]}
              />
            </View>
            <MaterialCommunityIcons
              name="volume-high"
              size={18}
              color="#1A8CFF"
            />
          </View>
          <Text style={styles.mixerNote}>
            Rhythm tones overlay on top of selected track without audio ducking
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function TrackCard({
  track,
  isPlaying,
  onPress,
}: {
  track: Track;
  isPlaying: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.trackCard,
        isPlaying && styles.trackCardActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.trackIconBox,
          isPlaying && styles.trackIconBoxActive,
        ]}
      >
        <MaterialCommunityIcons
          name={
            track.category === "binaural"
              ? "brain"
              : "music-note-eighth-dotted"
          }
          size={20}
          color={isPlaying ? "#FFFFFF" : "#555555"}
        />
      </View>

      <View style={styles.trackInfo}>
        <Text style={[styles.trackTitle, isPlaying && styles.trackTitleActive]}>
          {track.title}
        </Text>
        <Text style={styles.trackMeta}>
          {track.artist}
          {track.bpm ? `  •  ${track.bpm} BPM` : "  •  Alpha Waves"}
        </Text>
      </View>

      <View style={styles.trackRight}>
        <Text style={styles.trackDuration}>{track.duration}</Text>
        <Pressable
          onPress={onPress}
          style={[styles.playBtn, isPlaying && styles.playBtnActive]}
        >
          <Feather
            name={isPlaying ? "pause" : "play"}
            size={14}
            color="#FFFFFF"
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionLabel: {
    fontSize: 10,
    color: "#444444",
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 10,
    fontFamily: "Inter_600SemiBold",
  },
  trackCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    gap: 14,
  },
  trackCardActive: {
    borderColor: "#1A3A5A",
    backgroundColor: "#0A1520",
  },
  trackIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  trackIconBoxActive: {
    backgroundColor: "#1A8CFF",
  },
  trackInfo: {
    flex: 1,
    gap: 3,
  },
  trackTitle: {
    fontSize: 14,
    color: "#CCCCCC",
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  trackTitleActive: {
    color: "#FFFFFF",
  },
  trackMeta: {
    fontSize: 11,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
  trackRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  trackDuration: {
    fontSize: 11,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnActive: {
    backgroundColor: "#1A8CFF",
  },
  mixerCard: {
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    padding: 18,
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    gap: 12,
  },
  mixerTitle: {
    fontSize: 10,
    color: "#444444",
    letterSpacing: 2,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  mixerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sliderTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#1A1A1A",
    borderRadius: 2,
    position: "relative",
    overflow: "visible",
  },
  sliderFill: {
    height: 4,
    backgroundColor: "#1A8CFF",
    borderRadius: 2,
  },
  sliderThumb: {
    position: "absolute",
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1A8CFF",
    marginLeft: -8,
  },
  mixerNote: {
    fontSize: 11,
    color: "#333333",
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
  },
});
