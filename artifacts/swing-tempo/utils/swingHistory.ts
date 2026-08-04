import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GameMode } from "@/context/TempoContext";
import type { SwingOrigin } from "@/context/SwingLibraryContext";
import type { ShotCategory } from "@/data/tempoPlayers";
import { todayIso } from "@/utils/dates";

const RECORDS_KEY = "swingTempo:swingHistory";
/**
 * Ids the user deleted locally, queued until a sync can tell the server.
 * Without this a deleted record just comes back on the next pull, since
 * sync replaces local storage with the server's full set.
 */
const PENDING_DELETES_KEY = "swingTempo:swingHistoryDeletes";

/**
 * Matches the server's SyncPayload maxItems. Enforced inside
 * saveSwingRecords rather than at the call site — when the cap lived in
 * addSwingRecord only, the sync write-back path bypassed it entirely and
 * the local store grew without limit for exactly the signed-in users the
 * cap was meant to protect.
 */
const MAX_RECORDS = 500;

export interface SwingRecord {
  id: string;
  date: string;        // ISO date string YYYY-MM-DD (device-local calendar)
  timestamp: number;    // Date.now() when recorded
  swingId: string;      // links back to SwingLibraryContext's Swing.id
  origin: SwingOrigin;
  golferName: string;
  gameMode: GameMode;
  club: ShotCategory | null;
  ratio: number;
  accuracy: number;
  /** Local frame-capture thumbnail (native only), null if unavailable. */
  thumbnailUri?: string | null;
}

export async function getSwingRecords(): Promise<SwingRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(RECORDS_KEY);
    return raw ? (JSON.parse(raw) as SwingRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveSwingRecords(records: SwingRecord[]): Promise<void> {
  try {
    // Keep the most recent MAX_RECORDS. Every write path goes through here,
    // including the post-sync merge, so the cap actually holds.
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    /* ignore */
  }
}

export async function addSwingRecord(
  record: Omit<SwingRecord, "id" | "date" | "timestamp">
): Promise<void> {
  const records = await getSwingRecords();
  const now = Date.now();
  records.push({
    ...record,
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    date: todayIso(),
    timestamp: now,
  });
  await saveSwingRecords(records);
}

/** Ids deleted locally but not yet confirmed removed server-side. */
export async function getPendingDeletes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_DELETES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function savePendingDeletes(ids: string[]): Promise<void> {
  try {
    // Bounded by the same cap — the server rejects longer lists anyway.
    await AsyncStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(ids.slice(-MAX_RECORDS)));
  } catch {
    /* ignore */
  }
}

/**
 * Removes a record locally and queues the id so the next sync deletes it
 * server-side too.
 */
export async function deleteSwingRecord(id: string): Promise<void> {
  const [records, pending] = await Promise.all([getSwingRecords(), getPendingDeletes()]);
  await Promise.all([
    saveSwingRecords(records.filter((r) => r.id !== id)),
    savePendingDeletes(pending.includes(id) ? pending : [...pending, id]),
  ]);
}

/** Called once a sync has successfully carried the deletions to the server. */
export async function clearPendingDeletes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const pending = await getPendingDeletes();
  const done = new Set(ids);
  await savePendingDeletes(pending.filter((id) => !done.has(id)));
}

export function getRecordsForDate(records: SwingRecord[], date: string): SwingRecord[] {
  return records.filter((r) => r.date === date);
}

export interface ConsistencyStats {
  count: number;
  avgAccuracy: number;
  avgDeviation: number;
  goldStandard: number;
}

/** Rolling accuracy/deviation over the most recent `sampleSize` swings for a game mode. */
export function computeConsistency(
  records: SwingRecord[],
  gameMode: GameMode,
  sampleSize = 20
): ConsistencyStats | null {
  const goldStandard = gameMode === "long" ? 3.0 : 2.0;
  const filtered = records.filter((r) => r.gameMode === gameMode).slice(-sampleSize);
  if (filtered.length === 0) return null;

  const avgAccuracy = filtered.reduce((sum, r) => sum + r.accuracy, 0) / filtered.length;
  const avgDeviation = filtered.reduce((sum, r) => sum + Math.abs(r.ratio - goldStandard), 0) / filtered.length;

  return {
    count: filtered.length,
    avgAccuracy: Math.round(avgAccuracy),
    avgDeviation,
    goldStandard,
  };
}

/** Accuracy trend: recent window average minus the window before it (+ improving, - declining). */
export function computeConsistencyTrend(
  records: SwingRecord[],
  gameMode: GameMode,
  windowSize = 10
): number | null {
  const filtered = records.filter((r) => r.gameMode === gameMode);
  if (filtered.length < windowSize + 1) return null;

  const recent = filtered.slice(-windowSize);
  const prior = filtered.slice(-windowSize * 2, -windowSize);
  if (prior.length === 0) return null;

  const avg = (arr: SwingRecord[]) => arr.reduce((s, r) => s + r.accuracy, 0) / arr.length;
  return Math.round(avg(recent) - avg(prior));
}

export interface ClubBreakdown {
  club: ShotCategory;
  count: number;
  avgRatio: number;
  avgAccuracy: number;
}

export function computeClubBreakdown(records: SwingRecord[]): ClubBreakdown[] {
  const byClub = new Map<ShotCategory, { count: number; totalRatio: number; totalAccuracy: number }>();
  for (const r of records) {
    if (!r.club) continue;
    const cur = byClub.get(r.club) ?? { count: 0, totalRatio: 0, totalAccuracy: 0 };
    cur.count += 1;
    cur.totalRatio += r.ratio;
    cur.totalAccuracy += r.accuracy;
    byClub.set(r.club, cur);
  }
  return Array.from(byClub.entries())
    .map(([club, v]) => ({
      club,
      count: v.count,
      avgRatio: v.totalRatio / v.count,
      avgAccuracy: Math.round(v.totalAccuracy / v.count),
    }))
    .sort((a, b) => b.count - a.count);
}

/** All-time headline numbers for the profile summary card. */
export interface CareerStats {
  totalSwings: number;
  bestRatio: number | null;
  bestAccuracy: number | null;
  avgAccuracy: number | null;
}

/**
 * "Best" is the swing whose ratio landed closest to its mode's gold
 * standard (3:1 long, 2:1 short) — a raw max would just surface the most
 * extreme outlier, which is the opposite of good tempo.
 */
export function computeCareerStats(records: SwingRecord[]): CareerStats {
  if (records.length === 0) {
    return { totalSwings: 0, bestRatio: null, bestAccuracy: null, avgAccuracy: null };
  }

  let best = records[0];
  for (const r of records) if (r.accuracy > best.accuracy) best = r;

  const avgAccuracy = records.reduce((sum, r) => sum + r.accuracy, 0) / records.length;

  return {
    totalSwings: records.length,
    bestRatio: best.ratio,
    bestAccuracy: best.accuracy,
    avgAccuracy: Math.round(avgAccuracy),
  };
}
