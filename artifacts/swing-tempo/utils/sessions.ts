import AsyncStorage from "@react-native-async-storage/async-storage";

import { todayIso } from "@/utils/dates";

const KEY = "swingTempo:sessions";

/**
 * Server-side cap (see the OpenAPI SyncPayload schema) — a day can't hold
 * more than 24h of practice, and the sync merge keeps greatest(local,
 * server), so an out-of-range value would be permanent and uncorrectable.
 * Clamp locally too rather than letting the whole sync 400 on one bad row.
 */
const MAX_DURATION_PER_DAY = 86400;
const MAX_SWINGS_PER_DAY = 100000;

export interface Session {
  date: string;        // ISO date string YYYY-MM-DD (device-local calendar)
  duration: number;    // seconds
  swings?: number;     // swings analyzed that day
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), max);
}

/** Normalises anything read from storage or built up locally. */
function sanitize(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => typeof s?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date))
    .map((s) => ({
      date: s.date,
      duration: clamp(s.duration, MAX_DURATION_PER_DAY),
      swings: clamp(s.swings ?? 0, MAX_SWINGS_PER_DAY),
    }));
}

export async function getSessions(): Promise<Session[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(sanitize(sessions)));
  } catch { /* ignore */ }
}

/**
 * Adds elapsed active-practice seconds (tempo playing / video being
 * analyzed) to today's bucket. Safe to call frequently — each call is a
 * small incremental add, not a full session replace.
 *
 * This is the *only* writer of practice time. There used to be a second one
 * (recordSessionStart/finalizeSession around the welcome screen's Start
 * button) which added the whole wall-clock span since Start — double
 * counting these same seconds, and, because finalize only ran on the next
 * app launch, crediting every hour the app sat closed as practice.
 */
export async function addActiveSeconds(seconds: number): Promise<void> {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  try {
    const sessions = await getSessions();
    const today    = todayIso();
    const existing = sessions.find((s) => s.date === today);
    if (existing) existing.duration = clamp(existing.duration + seconds, MAX_DURATION_PER_DAY);
    else sessions.push({ date: today, duration: clamp(seconds, MAX_DURATION_PER_DAY) });
    await saveSessions(sessions);
  } catch { /* ignore */ }
}

/** Bumps today's "swings analyzed" counter by one. */
export async function incrementSwingsAnalyzed(): Promise<void> {
  try {
    const sessions = await getSessions();
    const today    = todayIso();
    const existing = sessions.find((s) => s.date === today);
    if (existing) existing.swings = clamp((existing.swings ?? 0) + 1, MAX_SWINGS_PER_DAY);
    else sessions.push({ date: today, duration: 0, swings: 1 });
    await saveSessions(sessions);
  } catch { /* ignore */ }
}

export function getTodaySession(sessions: Session[]): Session {
  const today = todayIso();
  return sessions.find((s) => s.date === today) ?? { date: today, duration: 0, swings: 0 };
}

export function computeTotalSwings(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + (s.swings ?? 0), 0);
}

/**
 * Consecutive days with recorded activity, ending today. A session today
 * isn't required — a streak that's alive as of yesterday still counts until
 * the day is out, otherwise every streak reads as broken every morning
 * until the user has practised again.
 */
export function computeStreak(sessions: Session[]): number {
  const dates = new Set(
    sessions.filter((s) => s.duration > 0 || (s.swings ?? 0) > 0).map((s) => s.date),
  );

  const d = new Date();
  const isoOf = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  if (!dates.has(isoOf(d))) d.setDate(d.getDate() - 1);

  let streak = 0;
  while (dates.has(isoOf(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Duration → 0-4 intensity level for colour mapping */
export function durationToLevel(seconds: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0)    return 0;
  if (seconds < 120)   return 1;  // < 2 min
  if (seconds < 600)   return 2;  // < 10 min
  if (seconds < 1800)  return 3;  // < 30 min
  return 4;                        // 30 min+
}
