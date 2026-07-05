import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface VideoItem {
  id: string;
  title: string;
  duration: string;
  category: string;
  description: string;
}

const VIDEOS: VideoItem[] = [
  {
    id: "1",
    title: "The 3:1 Ratio Explained",
    duration: "8:24",
    category: "Science",
    description:
      "Learn why every elite touring professional swings with a 3:1 backswing-to-downswing ratio and how to train yours.",
  },
  {
    id: "2",
    title: "21/7 Tempo Training",
    duration: "6:15",
    category: "Training",
    description:
      "The most common tempo found on tour. Step-by-step drills using the 21/7 ratio for consistent ball striking.",
  },
  {
    id: "3",
    title: "Short Game Tempo",
    duration: "5:42",
    category: "Short Game",
    description:
      "Applying tempo science to chips, pitches, and putts. Why a consistent short game tempo is the key to scoring.",
  },
  {
    id: "4",
    title: "Measuring Your Natural Tempo",
    duration: "7:03",
    category: "Analysis",
    description:
      "Use the video analysis tool to record and measure your current swing ratio, then identify areas for improvement.",
  },
  {
    id: "5",
    title: "Transition: The Critical Moment",
    duration: "9:18",
    category: "Science",
    description:
      "Frame-by-frame breakdown of the transition from backswing to downswing in tour players.",
  },
  {
    id: "6",
    title: "Binaural Audio Training",
    duration: "4:56",
    category: "Audio",
    description:
      "How binaural alpha waves enhance muscle memory formation during tempo training sessions.",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Science: "#1A8CFF",
  Training: "#30D158",
  "Short Game": "#FF9F0A",
  Analysis: "#BF5AF2",
  Audio: "#FF375F",
};

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);

  const handleVideoPress = (video: VideoItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedVideo(video);
  };

  const renderItem = ({ item, index }: { item: VideoItem; index: number }) => {
    const isWide = index === 0;
    return (
      <Pressable
        onPress={() => handleVideoPress(item)}
        style={({ pressed }) => [
          styles.videoCard,
          isWide && styles.videoCardWide,
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={[styles.thumbnail, isWide && styles.thumbnailWide]}>
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Feather name="play" size={isWide ? 22 : 16} color="#FFFFFF" />
            </View>
          </View>
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{item.duration}</Text>
          </View>
          <View
            style={[
              styles.categoryBadge,
              {
                backgroundColor:
                  CATEGORY_COLORS[item.category] + "22" || "#1A8CFF22",
              },
            ]}
          >
            <View
              style={[
                styles.categoryDot,
                {
                  backgroundColor:
                    CATEGORY_COLORS[item.category] || "#1A8CFF",
                },
              ]}
            />
            <Text
              style={[
                styles.categoryText,
                {
                  color: CATEGORY_COLORS[item.category] || "#1A8CFF",
                },
              ]}
            >
              {item.category}
            </Text>
          </View>
        </View>
        <View style={styles.videoInfo}>
          <Text
            style={[styles.videoTitle, isWide && styles.videoTitleWide]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          {!isWide && (
            <Text style={styles.videoDesc} numberOfLines={2}>
              {item.description}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + (Platform.OS === "web" ? 20 : 10),
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>VIDEOS</Text>
        <Text style={styles.subtitle}>Tempo Science & Instruction</Text>
      </View>

      <FlatList
        data={VIDEOS}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={[
          styles.grid,
          {
            paddingBottom:
              insets.bottom + (Platform.OS === "web" ? 84 : 60) + 20,
          },
        ]}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        visible={selectedVideo !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedVideo(null)}
      >
        {selectedVideo && (
          <View style={styles.modalContainer}>
            <Pressable
              style={styles.modalClose}
              onPress={() => setSelectedVideo(null)}
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </Pressable>

            <View style={styles.modalPlayer}>
              <View style={styles.modalPlayCircle}>
                <Feather name="play" size={40} color="#FFFFFF" />
              </View>
              <Text style={styles.modalPlayerNote}>
                Video playback coming soon
              </Text>
            </View>

            <View style={styles.modalInfo}>
              <View
                style={[
                  styles.modalCategoryBadge,
                  {
                    backgroundColor:
                      CATEGORY_COLORS[selectedVideo.category] + "22",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modalCategory,
                    {
                      color:
                        CATEGORY_COLORS[selectedVideo.category] || "#1A8CFF",
                    },
                  ]}
                >
                  {selectedVideo.category}
                </Text>
              </View>
              <Text style={styles.modalTitle}>{selectedVideo.title}</Text>
              <Text style={styles.modalDuration}>
                {selectedVideo.duration} • Instructional
              </Text>
              <Text style={styles.modalDescription}>
                {selectedVideo.description}
              </Text>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 16,
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
  grid: {
    paddingHorizontal: 16,
    gap: 10,
  },
  columnWrapper: {
    gap: 10,
  },
  videoCard: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  videoCardWide: {
    flex: 1,
  },
  thumbnail: {
    height: 100,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  thumbnailWide: {
    height: 140,
  },
  playOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(26, 140, 255, 0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationText: {
    fontSize: 10,
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  categoryBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  categoryDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  videoInfo: {
    padding: 10,
    gap: 4,
  },
  videoTitle: {
    fontSize: 12,
    color: "#CCCCCC",
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    lineHeight: 16,
  },
  videoTitleWide: {
    fontSize: 14,
  },
  videoDesc: {
    fontSize: 10,
    color: "#444444",
    lineHeight: 14,
    fontFamily: "Inter_400Regular",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPlayer: {
    height: 240,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  modalPlayCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1A8CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPlayerNote: {
    fontSize: 12,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
  modalInfo: {
    padding: 24,
    gap: 12,
  },
  modalCategoryBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modalCategory: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    fontFamily: "Inter_600SemiBold",
  },
  modalTitle: {
    fontSize: 22,
    color: "#FFFFFF",
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    lineHeight: 28,
  },
  modalDuration: {
    fontSize: 13,
    color: "#444444",
    fontFamily: "Inter_400Regular",
  },
  modalDescription: {
    fontSize: 15,
    color: "#888888",
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
  },
});
