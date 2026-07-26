import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "swingTempo:sessions";
const SESSION_START_KEY = "swingTempo:sessionStart";

export interface Session {
  date: string;        // ISO date string YYYY-MM-DD
  duration: number;    // seconds
  swings?: number;     // swings analyzed that day
}

export async function getSessions(): Promise<Session[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(sessions));
  } catch { /* ignore */ }
}

export async function recordSessionStart(): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_START_KEY, Date.now().toString());
  } catch { /* ignore */ }
}

export async function finalizeSession(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_START_KEY);
    if (!raw) return;
    const startMs  = parseInt(raw, 10);
    const duration = Math.floor((Date.now() - startMs) / 1000);
    if (duration < 5) return; // ignore accidental taps
    await AsyncStorage.removeItem(SESSION_START_KEY);
    const sessions = await getSessions();
    const today    = new Date().toISOString().slice(0, 10);
    const existing = sessions.find((s) => s.date === today);
    if (existing) {
      existing.duration += duration;
    } else {
      sessions.push({ date: today, duration });
    }
    await saveSessions(sessions);
  } catch { /* ignore */ }
}

/**
 * Adds elapsed active-practice seconds (tempo playing / video being
 * analyzed) to today's bucket. Safe to call frequently — each call is a
 * small incremental add, not a full session replace.
 */
export async function addActiveSeconds(seconds: number): Promise<void> {
  if (seconds <= 0) return;
  try {
    const sessions = await getSessions();
    const today    = new Date().toISOString().slice(0, 10);
    const existing = sessions.find((s) => s.date === today);
    if (existing) existing.duration += seconds;
    else sessions.push({ date: today, duration: seconds });
    await saveSessions(sessions);
  } catch { /* ignore */ }
}

/** Bumps today's "swings analyzed" counter by one. */
export async function incrementSwingsAnalyzed(): Promise<void> {
  try {
    const sessions = await getSessions();
    const today    = new Date().toISOString().slice(0, 10);
    const existing = sessions.find((s) => s.date === today);
    if (existing) existing.swings = (existing.swings ?? 0) + 1;
    else sessions.push({ date: today, duration: 0, swings: 1 });
    await saveSessions(sessions);
  } catch { /* ignore */ }
}

export function getTodaySession(sessions: Session[]): Session {
  const today = new Date().toISOString().slice(0, 10);
  return sessions.find((s) => s.date === today) ?? { date: today, duration: 0, swings: 0 };
}

export function computeTotalSwings(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + (s.swings ?? 0), 0);
}

/** Consecutive days (ending today) with a recorded session. */
export function computeStreak(sessions: Session[]): number {
  const dates = new Set(sessions.map((s) => s.date));
  let streak = 0;
  const d = new Date();
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    if (!dates.has(iso)) break;
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
