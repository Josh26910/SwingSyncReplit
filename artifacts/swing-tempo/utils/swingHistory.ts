import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GameMode } from "@/context/TempoContext";
import type { SwingOrigin } from "@/context/SwingLibraryContext";
import type { ShotCategory } from "@/data/tempoPlayers";

const RECORDS_KEY = "swingTempo:swingHistory";
const MAX_RECORDS = 500;

export interface SwingRecord {
  id: string;
  date: string;        // ISO date string YYYY-MM-DD
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
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
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
    date: new Date(now).toISOString().slice(0, 10),
    timestamp: now,
  });
  // Cap history length so AsyncStorage doesn't grow unbounded.
  await saveSwingRecords(records.slice(-MAX_RECORDS));
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

