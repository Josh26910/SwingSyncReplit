import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AsyncStorage is a native module; back it with an in-memory map so these
// tests exercise the real read/write/sanitise paths without a device.
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));

const {
  addActiveSeconds,
  computeStreak,
  computeTotalSwings,
  durationToLevel,
  getSessions,
  getTodaySession,
  incrementSwingsAnalyzed,
  saveSessions,
} = await import("@/utils/sessions");

type Session = Awaited<ReturnType<typeof getSessions>>[number];

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0)); // 2026-08-04, local
});

afterEach(() => {
  vi.useRealTimers();
});

const iso = (daysAgo: number) => {
  const d = new Date(2026, 7, 4);
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("addActiveSeconds", () => {
  it("accumulates into today's bucket", async () => {
    await addActiveSeconds(30);
    await addActiveSeconds(45);
    const sessions = await getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ date: "2026-08-04", duration: 75 });
  });

  it("ignores zero, negative and non-finite inputs", async () => {
    await addActiveSeconds(0);
    await addActiveSeconds(-100);
    await addActiveSeconds(Number.NaN);
    await addActiveSeconds(Number.POSITIVE_INFINITY);
    expect(await getSessions()).toHaveLength(0);
  });

  it("caps a day at 24 hours", async () => {
    // The server merges with greatest(local, server), so an inflated value
    // would be permanent and uncorrectable — which is exactly what the old
    // session timer produced when it credited days of closed-app time.
    await addActiveSeconds(500_000);
    const [today] = await getSessions();
    expect(today.duration).toBe(86400);
  });
});

describe("incrementSwingsAnalyzed", () => {
  it("starts a day at one and counts up", async () => {
    await incrementSwingsAnalyzed();
    await incrementSwingsAnalyzed();
    const [today] = await getSessions();
    expect(today.swings).toBe(2);
    expect(today.duration).toBe(0);
  });
});

describe("getSessions sanitising", () => {
  it("drops rows with a malformed date", async () => {
    store.set(
      "swingTempo:sessions",
      JSON.stringify([
        { date: "2026-08-04", duration: 60 },
        { date: "not-a-date", duration: 60 },
        { date: "2026-8-4", duration: 60 },
      ]),
    );
    const sessions = await getSessions();
    expect(sessions.map((s) => s.date)).toEqual(["2026-08-04"]);
  });

  it("clamps out-of-range values read back from storage", async () => {
    store.set(
      "swingTempo:sessions",
      JSON.stringify([{ date: "2026-08-04", duration: 999_999, swings: -5 }]),
    );
    const [session] = await getSessions();
    expect(session.duration).toBe(86400);
    expect(session.swings).toBe(0);
  });

  it("survives corrupt JSON", async () => {
    store.set("swingTempo:sessions", "{not json");
    expect(await getSessions()).toEqual([]);
  });
});

describe("computeStreak", () => {
  const withActivity = (...daysAgo: number[]): Session[] =>
    daysAgo.map((n) => ({ date: iso(n), duration: 300, swings: 0 }));

  it("counts consecutive days ending today", () => {
    expect(computeStreak(withActivity(0, 1, 2))).toBe(3);
  });

  it("stops at the first gap", () => {
    expect(computeStreak(withActivity(0, 1, 3, 4))).toBe(2);
  });

  it("keeps a streak alive on a day not yet practised", () => {
    // Practised yesterday, nothing today yet. The streak isn't broken until
    // the day is actually out — otherwise every streak read as zero each
    // morning until the user practised again.
    expect(computeStreak(withActivity(1, 2, 3))).toBe(3);
  });

  it("returns zero once a full day has been missed", () => {
    expect(computeStreak(withActivity(2, 3, 4))).toBe(0);
  });

  it("ignores days with a row but no actual activity", () => {
    const sessions: Session[] = [
      { date: iso(0), duration: 0, swings: 0 },
      { date: iso(1), duration: 600, swings: 0 },
    ];
    expect(computeStreak(sessions)).toBe(1);
  });

  it("returns zero for no sessions at all", () => {
    expect(computeStreak([])).toBe(0);
  });
});

describe("getTodaySession", () => {
  it("returns an empty session when today has no row", () => {
    expect(getTodaySession([])).toEqual({ date: "2026-08-04", duration: 0, swings: 0 });
  });

  it("finds today by local date", () => {
    const sessions: Session[] = [{ date: "2026-08-04", duration: 120, swings: 3 }];
    expect(getTodaySession(sessions).duration).toBe(120);
  });
});

describe("computeTotalSwings", () => {
  it("sums swings across days and tolerates missing counts", () => {
    const sessions = [
      { date: iso(0), duration: 0, swings: 3 },
      { date: iso(1), duration: 0 },
      { date: iso(2), duration: 0, swings: 4 },
    ] as Session[];
    expect(computeTotalSwings(sessions)).toBe(7);
  });
});

describe("durationToLevel", () => {
  it("maps practice time onto the five grid intensities", () => {
    expect(durationToLevel(0)).toBe(0);
    expect(durationToLevel(60)).toBe(1);
    expect(durationToLevel(300)).toBe(2);
    expect(durationToLevel(1200)).toBe(3);
    expect(durationToLevel(3600)).toBe(4);
  });
});

describe("saveSessions", () => {
  it("sanitises on write, not just on read", async () => {
    await saveSessions([{ date: "2026-08-04", duration: 1e9, swings: 5 }]);
    const raw = JSON.parse(store.get("swingTempo:sessions")!);
    expect(raw[0].duration).toBe(86400);
  });
});
