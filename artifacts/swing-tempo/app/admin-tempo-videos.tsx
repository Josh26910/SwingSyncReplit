/**
 * Not linked from any tab — reach it by typing /admin-tempo-videos in the
 * address bar (web) or navigating there directly. Gated by a shared secret
 * (ADMIN_TOKEN on the server) rather than a real login: there's one operator
 * managing this content, not a multi-admin system worth building auth for.
 *
 * Lets you: add a new reference-tempo entry, and — the main point of this
 * screen — attach a youtubeId (+ optional clip start/end seconds) to an
 * existing entry once you've sourced/uploaded that swing's video, without
 * touching code or waiting on a redeploy.
 */
import {
  createTempoVideo,
  deleteTempoVideo,
  updateTempoVideo,
  useListTempoVideos,
  type TempoVideoDto,
} from "@workspace/api-client-react";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATEGORY_LABELS, type ShotCategory } from "@/data/tempoPlayers";
import { getToken, setToken } from "@/utils/tokenStorage";

const TOKEN_KEY = "swingtempo_admin_token";
const CATEGORIES: ShotCategory[] = ["tee", "approach", "shortgame", "putting"];
const BLUE = "#1A8CFF";

function extractYoutubeId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : trimmed;
}

function VideoLinkRow({ entry, adminToken, onSaved }: { entry: TempoVideoDto; adminToken: string; onSaved: () => void }) {
  const [value, setValue] = useState(entry.youtubeId ?? "");
  const [start, setStart] = useState(entry.clipStartSec != null ? String(entry.clipStartSec) : "");
  const [end, setEnd] = useState(entry.clipEndSec != null ? String(entry.clipEndSec) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const startSec = start.trim() ? Number(start) : undefined;
    const endSec = end.trim() ? Number(end) : undefined;
    if (startSec !== undefined && endSec !== undefined && endSec <= startSec) {
      Alert.alert("Invalid Clip", "The end time has to be after the start time.");
      return;
    }
    setSaving(true);
    try {
      await updateTempoVideo(
        entry.id,
        {
          youtubeId: value.trim() ? extractYoutubeId(value) : undefined,
          clipStartSec: startSec,
          clipEndSec: endSec,
        },
        { headers: { "x-admin-token": adminToken } },
      );
      onSaved();
    } catch (err) {
      Alert.alert("Save Failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert("Delete Entry", `Remove "${entry.name}" (${entry.event} ${entry.year})?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTempoVideo(entry.id, { headers: { "x-admin-token": adminToken } });
          onSaved();
        },
      },
    ]);
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{entry.name}</Text>
        <Text style={styles.rowSub}>
          {CATEGORY_LABELS[entry.category as ShotCategory]} · {entry.event} {entry.year} · {entry.ratio.toFixed(2)}:1
        </Text>
      </View>
      <View style={styles.rowInputs}>
        <TextInput
          style={[styles.input, { flex: 3 }]}
          value={value}
          onChangeText={setValue}
          placeholder="YouTube URL or video id"
          placeholderTextColor="#555"
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={start}
          onChangeText={setStart}
          placeholder="start (s)"
          placeholderTextColor="#555"
          keyboardType="decimal-pad"
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={end}
          onChangeText={setEnd}
          placeholder="end (s)"
          placeholderTextColor="#555"
          keyboardType="decimal-pad"
        />
        <Pressable style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </Pressable>
      </View>
      <Pressable onPress={remove}>
        <Text style={styles.deleteText}>Delete entry</Text>
      </Pressable>
    </View>
  );
}

function NewEntryForm({ adminToken, onSaved }: { adminToken: string; onSaved: () => void }) {
  const [category, setCategory] = useState<ShotCategory>("tee");
  const [name, setName] = useState("");
  const [event, setEvent] = useState("");
  const [year, setYear] = useState("");
  const [club, setClub] = useState("");
  const [backswing, setBackswing] = useState("");
  const [downswing, setDownswing] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const b = Number(backswing);
    const d = Number(downswing);
    const y = Number(year);
    if (!name.trim() || !event.trim() || !club.trim() || !Number.isFinite(b) || !Number.isFinite(d) || !Number.isFinite(y)) {
      Alert.alert("Missing Fields", "Name, event, year, club, backswing, and downswing are all required.");
      return;
    }
    setSaving(true);
    try {
      await createTempoVideo(
        {
          category,
          name: name.trim(),
          event: event.trim(),
          year: y,
          club: club.trim(),
          ratio: d > 0 ? b / d : 0,
          duration: b + d,
          backswing: b,
          downswing: d,
          youtubeId: youtubeUrl.trim() ? extractYoutubeId(youtubeUrl) : undefined,
        },
        { headers: { "x-admin-token": adminToken } },
      );
      setName(""); setEvent(""); setYear(""); setClub(""); setBackswing(""); setDownswing(""); setYoutubeUrl("");
      onSaved();
    } catch (err) {
      Alert.alert("Save Failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.newCard}>
      <Text style={styles.sectionTitle}>Add New Entry</Text>
      <View style={styles.categoryRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            style={[styles.categoryChip, category === c && styles.categoryChipActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
              {CATEGORY_LABELS[c]}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Player name" placeholderTextColor="#555" />
      <TextInput style={styles.input} value={event} onChangeText={setEvent} placeholder="Event" placeholderTextColor="#555" />
      <View style={styles.rowInputs}>
        <TextInput style={[styles.input, { flex: 1 }]} value={year} onChangeText={setYear} placeholder="Year" placeholderTextColor="#555" keyboardType="number-pad" />
        <TextInput style={[styles.input, { flex: 1 }]} value={club} onChangeText={setClub} placeholder="Club" placeholderTextColor="#555" />
      </View>
      <View style={styles.rowInputs}>
        <TextInput style={[styles.input, { flex: 1 }]} value={backswing} onChangeText={setBackswing} placeholder="Backswing (s)" placeholderTextColor="#555" keyboardType="decimal-pad" />
        <TextInput style={[styles.input, { flex: 1 }]} value={downswing} onChangeText={setDownswing} placeholder="Downswing (s)" placeholderTextColor="#555" keyboardType="decimal-pad" />
      </View>
      <TextInput style={styles.input} value={youtubeUrl} onChangeText={setYoutubeUrl} placeholder="YouTube URL (optional, add later if not ready)" placeholderTextColor="#555" autoCapitalize="none" />
      <Pressable style={styles.submitBtn} onPress={submit} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.submitBtnText}>Add Entry</Text>}
      </Pressable>
    </View>
  );
}

export default function AdminTempoVideosScreen() {
  const insets = useSafeAreaInsets();
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [checkingStoredToken, setCheckingStoredToken] = useState(true);

  useEffect(() => {
    getToken(TOKEN_KEY).then((stored) => {
      if (stored) setAdminToken(stored);
      setCheckingStoredToken(false);
    });
  }, []);

  // The generated hook's `query` option type demands a `queryKey` even though
  // it happily defaults one at runtime when omitted — cast around that.
  const { data: entries, refetch, isLoading } = useListTempoVideos(undefined, {
    query: { enabled: !!adminToken } as never,
  });

  const unlock = async () => {
    if (!tokenInput.trim()) return;
    await setToken(TOKEN_KEY, tokenInput.trim());
    setAdminToken(tokenInput.trim());
  };

  if (checkingStoredToken) return null;

  if (!adminToken) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.title}>Admin Access</Text>
        <TextInput
          style={styles.input}
          value={tokenInput}
          onChangeText={setTokenInput}
          placeholder="Admin token"
          placeholderTextColor="#555"
          secureTextEntry
          autoCapitalize="none"
        />
        <Pressable style={styles.submitBtn} onPress={unlock}>
          <Text style={styles.submitBtnText}>Unlock</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 60, paddingHorizontal: 20 }}
    >
      <Text style={styles.title}>Tempo Videos Admin</Text>
      <Text style={styles.subtitle}>
        Paste a YouTube link next to any entry below to attach its clip — no code change, no redeploy.
      </Text>

      <NewEntryForm adminToken={adminToken} onSaved={() => refetch()} />

      <Text style={styles.sectionTitle}>All Entries ({entries?.length ?? 0})</Text>
      {isLoading && <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} />}
      {entries?.map((entry) => (
        <VideoLinkRow key={entry.id} entry={entry} adminToken={adminToken} onSaved={() => refetch()} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  title: { color: "#FFF", fontSize: 20, fontWeight: "700", marginBottom: 8, paddingHorizontal: 20 },
  subtitle: { color: "#888", fontSize: 13, marginBottom: 20, paddingHorizontal: 20 },
  sectionTitle: { color: "#FFF", fontSize: 15, fontWeight: "700", marginTop: 8, marginBottom: 12 },
  newCard: { backgroundColor: "#0D0D0D", borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A", padding: 16, marginBottom: 28, gap: 10 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "#111", borderWidth: 1, borderColor: "#222" },
  categoryChipActive: { backgroundColor: BLUE + "22", borderColor: BLUE },
  categoryChipText: { color: "#888", fontSize: 12 },
  categoryChipTextActive: { color: BLUE },
  input: { backgroundColor: "#111", borderRadius: 8, borderWidth: 1, borderColor: "#222", paddingHorizontal: 12, paddingVertical: 10, color: "#FFF", fontSize: 14, marginBottom: 10 },
  rowInputs: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 },
  submitBtn: { backgroundColor: BLUE, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  submitBtnText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  row: { backgroundColor: "#0D0D0D", borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A", padding: 14, marginBottom: 10 },
  rowHeader: { marginBottom: 10 },
  rowTitle: { color: "#FFF", fontSize: 14, fontWeight: "600" },
  rowSub: { color: "#666", fontSize: 11, marginTop: 2 },
  saveBtn: { backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  saveBtnText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  deleteText: { color: "#FF3B30", fontSize: 12, textAlign: "right" },
});
