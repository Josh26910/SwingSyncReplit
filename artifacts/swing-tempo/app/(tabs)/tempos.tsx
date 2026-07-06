import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTempo } from "@/context/TempoContext";
import {
  CATEGORY_LABELS,
  getPlayersByCategory,
  PlayerTempo,
  ShotCategory,
} from "@/data/tempoPlayers";

const BLUE    = "#1A8CFF";
const BG      = "#000000";
const CARD_BG = "#111111";
const BORDER  = "#1E1E1E";
const TEXT    = "#FFFFFF";
const MUTED   = "#888888";

const CATEGORIES: ShotCategory[] = ["tee", "approach", "shortgame", "putting"];

// ── Player Detail Overlay ─────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={detail.statBox}>
      <Text style={detail.statLabel}>{label}</Text>
      <Text style={detail.statValue}>{value}</Text>
    </View>
  );
}

function PlayerDetail({
  player,
  onBack,
  onStartTempo,
}: {
  player: PlayerTempo;
  onBack: () => void;
  onStartTempo: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [audioMode, setAudioMode] = useState<"beats" | "voice">("beats");

  return (
    <View style={[detail.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      {/* Back */}
      <TouchableOpacity onPress={onBack} style={detail.backBtn}>
        <Feather name="chevron-left" size={20} color={BLUE} />
        <Text style={detail.backText}>Back</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={detail.scroll}>
        {/* Title */}
        <Text style={detail.playerName}>{player.name.toUpperCase()}</Text>
        <Text style={detail.playerSub}>{player.year} · {player.club.toUpperCase()}</Text>

        {/* Big ratio */}
        <Text style={detail.bigRatio}>{player.ratio.toFixed(2)}:1</Text>
        <Text style={detail.ratioLabel}>TEMPO RATIO</Text>

        {/* Duration */}
        <Text style={detail.duration}>{player.duration.toFixed(2)}s</Text>
        <Text style={detail.durationLabel}>START TO IMPACT</Text>

        {/* Stat boxes */}
        <View style={detail.statsRow}>
          <StatBox label="BACKSWING" value={`${player.backswing.toFixed(2)}s`} />
          <StatBox label="DOWNSWING" value={`${player.downswing.toFixed(2)}s`} />
        </View>

        {/* Timeline nodes */}
        <View style={detail.timelineRow}>
          <View style={detail.timelineNode}>
            <View style={detail.timelineDotEmpty} />
            <Text style={detail.timelineLabel}>START</Text>
          </View>
          <View style={detail.timelineLine} />
          <View style={detail.timelineNode}>
            <View style={detail.timelineDot} />
            <Text style={detail.timelineLabel}>TOP</Text>
          </View>
          <View style={detail.timelineLine} />
          <View style={detail.timelineNode}>
            <View style={detail.timelineDot} />
            <Text style={detail.timelineLabel}>HIT</Text>
          </View>
        </View>

        {/* Event badge */}
        <View style={detail.eventBadge}>
          <MaterialCommunityIcons name="trophy-outline" size={14} color={BLUE} />
          <Text style={detail.eventText}>
            {player.event} · {player.year}{player.result ? `  ·  ${player.result}` : ""}
          </Text>
        </View>

        {/* Audio mode toggle */}
        <View style={detail.toggleRow}>
          <TouchableOpacity
            style={[detail.toggleBtn, audioMode === "beats" && detail.toggleActive]}
            onPress={() => setAudioMode("beats")}
          >
            <Text style={[detail.toggleText, audioMode === "beats" && detail.toggleTextActive]}>
              Beats
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[detail.toggleBtn, audioMode === "voice" && detail.toggleActive]}
            onPress={() => setAudioMode("voice")}
          >
            <Text style={[detail.toggleText, audioMode === "voice" && detail.toggleTextActive]}>
              Voice
            </Text>
          </TouchableOpacity>
        </View>

        {/* Start Tempo */}
        <TouchableOpacity style={detail.startBtn} onPress={onStartTempo} activeOpacity={0.85}>
          <Feather name="play" size={18} color={TEXT} style={{ marginRight: 8 }} />
          <Text style={detail.startBtnText}>Start Tempo</Text>
        </TouchableOpacity>
        <Text style={detail.startHint}>Loads this tempo into the trainer and starts playback</Text>
      </ScrollView>
    </View>
  );
}

// ── Player Card ───────────────────────────────────────────────────────────────

function PlayerCard({ player, onPress }: { player: PlayerTempo; onPress: () => void }) {
  return (
    <TouchableOpacity style={card.container} onPress={onPress} activeOpacity={0.75}>
      <View style={card.body}>
        <Text style={card.name}>{player.name}</Text>
        <Text style={card.sub}>{player.event} · {player.year}</Text>

        <View style={card.statsRow}>
          <View style={card.statBlock}>
            <Text style={card.statLabel}>TEMPO</Text>
            <Text style={card.statValue}>{player.ratio.toFixed(2)}:1</Text>
          </View>
          <View style={card.divider} />
          <View style={card.statBlock}>
            <Text style={card.statLabel}>DURATION</Text>
            <Text style={card.statValue}>{player.duration.toFixed(2)}s</Text>
          </View>
        </View>
      </View>

      <View style={card.arrow}>
        <Feather name="play" size={14} color={BLUE} />
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TemposScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const {
    setCustomTempo,
    setSelectedTempo,
    setIsPlaying,
  } = useTempo();

  const [activeCategory, setActiveCategory] = useState<ShotCategory>("tee");
  const [search,          setSearch]          = useState("");
  const [selectedPlayer,  setSelectedPlayer]  = useState<PlayerTempo | null>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const openDetail = (player: PlayerTempo) => {
    setSelectedPlayer(player);
    slideAnim.setValue(0);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 12,
    }).start();
  };

  const closeDetail = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setSelectedPlayer(null));
  };

  const players = getPlayersByCategory(activeCategory).filter((p) =>
    search.trim() === "" ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.event.toLowerCase().includes(search.toLowerCase())
  );

  const handleStartTempo = () => {
    if (!selectedPlayer) return;
    // 1. Store player data as the custom tempo
    setCustomTempo(selectedPlayer);
    // 2. Switch the trainer to custom mode
    setSelectedTempo("custom");
    // 3. Auto-start playback
    setIsPlaying(true);
    // 4. Dismiss detail and navigate to Tones tab
    closeDetail();
    setTimeout(() => router.push("/"), 260);
  };

  return (
    <View style={[screen.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={screen.header}>
        <Text style={screen.tagline}>Copy the best, at their best.</Text>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={screen.catScroll}
        contentContainerStyle={screen.catContent}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={screen.catTab}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[screen.catLabel, activeCategory === cat && screen.catLabelActive]}>
              {CATEGORY_LABELS[cat]}
            </Text>
            {activeCategory === cat && <View style={screen.catUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={screen.catBorder} />

      {/* Search */}
      <View style={screen.searchRow}>
        <Feather name="search" size={16} color={MUTED} style={{ marginRight: 8 }} />
        <TextInput
          style={screen.searchInput}
          placeholder="Search any player or shot"
          placeholderTextColor={MUTED}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={MUTED} />
          </Pressable>
        )}
      </View>

      {/* Player list */}
      <ScrollView
        style={screen.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            onPress={() => openDetail(player)}
          />
        ))}
      </ScrollView>

      {/* Detail overlay */}
      {selectedPlayer !== null && (
        <Animated.View
          style={[
            screen.overlay,
            {
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [700, 0],
                }),
              }],
              opacity: slideAnim,
            },
          ]}
        >
          <PlayerDetail
            player={selectedPlayer}
            onBack={closeDetail}
            onStartTempo={handleStartTempo}
          />
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const screen = StyleSheet.create({
  root:          { flex: 1, backgroundColor: BG },
  header:        { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  tagline:       { color: TEXT, fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  catScroll:     { flexGrow: 0 },
  catContent:    { paddingHorizontal: 16, gap: 4 },
  catTab:        { paddingHorizontal: 10, paddingBottom: 10, alignItems: "center" },
  catLabel:      { color: MUTED, fontSize: 14, fontFamily: "Inter_500Medium" },
  catLabelActive:{ color: TEXT, fontFamily: "Inter_600SemiBold" },
  catUnderline:  { position: "absolute", bottom: 0, left: 10, right: 10, height: 2, backgroundColor: BLUE, borderRadius: 1 },
  catBorder:     { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#131313",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 10 : 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  searchInput:   { flex: 1, color: TEXT, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  list:          { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  overlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: BG, zIndex: 100 },
});

const card = StyleSheet.create({
  container:  { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  body:        { flex: 1 },
  name:        { color: TEXT,  fontSize: 17, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  sub:         { color: MUTED, fontSize: 12, fontFamily: "Inter_400Regular",  marginBottom: 10 },
  statsRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  statBlock:   { gap: 2 },
  statLabel:   { color: MUTED, fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  statValue:   { color: TEXT,  fontSize: 15, fontFamily: "Inter_700Bold" },
  divider:     { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: BORDER },
  arrow:       { paddingLeft: 12 },
});

const detail = StyleSheet.create({
  container:     { flex: 1, backgroundColor: BG, paddingHorizontal: 24 },
  scroll:        { paddingBottom: 40 },
  backBtn:       { flexDirection: "row", alignItems: "center", marginBottom: 24, gap: 2 },
  backText:      { color: BLUE, fontSize: 16, fontFamily: "Inter_500Medium" },
  playerName:    { color: TEXT,  fontSize: 18, fontFamily: "Inter_700Bold",  textAlign: "center", letterSpacing: 1.5, marginBottom: 4 },
  playerSub:     { color: MUTED, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", letterSpacing: 1, marginBottom: 28 },
  bigRatio:      { color: TEXT,  fontSize: 80, fontFamily: "Inter_700Bold",  textAlign: "center", letterSpacing: -4, lineHeight: 88 },
  ratioLabel:    { color: MUTED, fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center", letterSpacing: 1.5, marginTop: 4, marginBottom: 16 },
  duration:      { color: TEXT,  fontSize: 28, fontFamily: "Inter_700Bold",  textAlign: "center" },
  durationLabel: { color: MUTED, fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center", letterSpacing: 1.5, marginTop: 2, marginBottom: 24 },
  statsRow:      { flexDirection: "row", gap: 12, marginBottom: 28 },
  statBox:       { flex: 1, backgroundColor: CARD_BG, borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  statLabel:     { color: MUTED, fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, marginBottom: 6 },
  statValue:     { color: TEXT,  fontSize: 26, fontFamily: "Inter_700Bold" },
  timelineRow:   { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 24, paddingHorizontal: 8 },
  timelineNode:  { alignItems: "center", gap: 6 },
  timelineDot:   { width: 14, height: 14, borderRadius: 7, backgroundColor: MUTED },
  timelineDotEmpty: { width: 14, height: 14, borderRadius: 7, backgroundColor: "transparent", borderWidth: 2, borderColor: MUTED },
  timelineLine:  { flex: 1, height: 2, backgroundColor: "#2A2A2A", marginTop: -18, marginHorizontal: 4 },
  timelineLabel: { color: MUTED, fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.8 },
  eventBadge:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#0A1A2A", borderWidth: StyleSheet.hairlineWidth, borderColor: "#1A3A5A", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 28 },
  eventText:     { color: BLUE, fontSize: 12, fontFamily: "Inter_500Medium" },
  toggleRow:     { flexDirection: "row", backgroundColor: CARD_BG, borderRadius: 14, padding: 4, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  toggleBtn:     { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 11 },
  toggleActive:  { backgroundColor: BLUE },
  toggleText:    { color: MUTED, fontSize: 14, fontFamily: "Inter_500Medium" },
  toggleTextActive: { color: TEXT, fontFamily: "Inter_600SemiBold" },
  startBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: BLUE, borderRadius: 24, paddingVertical: 28, marginBottom: 8, shadowColor: BLUE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  startBtnText:  { color: TEXT, fontSize: 24, fontFamily: "Inter_700Bold" },
  startHint:     { color: MUTED, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", letterSpacing: 0.5 },
});
