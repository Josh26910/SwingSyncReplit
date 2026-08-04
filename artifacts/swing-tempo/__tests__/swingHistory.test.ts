import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));

const {
  addSwingRecord,
  clearPendingDeletes,
  computeCareerStats,
  computeClubBreakdown,
  computeConsistency,
  computeConsistencyTrend,
  deleteSwingRecord,
  getPendingDeletes,
  getRecordsForDate,
  getSwingRecords,
  saveSwingRecords,
} = await import("@/utils/swingHistory");

type SwingRecord = Awaited<ReturnType<typeof getSwingRecords>>[number];

function record(overrides: Partial<SwingRecord> = {}): SwingRecord {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-08-04",
    timestamp: Date.now(),
    swingId: "swing-1",
    origin: "mine",
    golferName: "",
    gameMode: "long",
    club: null,
    ratio: 3,
    accuracy: 100,
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("addSwingRecord", () => {
  it("stamps the local date and a unique id", async () => {
    await addSwingRecord({
      swingId: "s1",
      origin: "mine",
      golferName: "",
      gameMode: "long",
      club: "tee",
      ratio: 3,
      accuracy: 95,
    });
    const [saved] = await getSwingRecords();
    expect(saved.date).toBe("2026-08-04");
    expect(saved.id).toBeTruthy();
    expect(saved.timestamp).toBe(Date.now());
  });
});

describe("the 500-record cap", () => {
  it("is enforced by saveSwingRecords, not only by addSwingRecord", async () => {
    // The cap used to live in addSwingRecord alone, so the post-sync
    // write-back — which calls saveSwingRecords directly with the server's
    // full set — bypassed it entirely and grew without bound for exactly the
    // signed-in users it was meant to protect.
    const many = Array.from({ length: 640 }, (_, i) => record({ id: `r${i}` }));
    await saveSwingRecords(many);
    const saved = await getSwingRecords();
    expect(saved).toHaveLength(500);
  });

  it("keeps the most recent records when trimming", async () => {
    const many = Array.from({ length: 520 }, (_, i) => record({ id: `r${i}` }));
    await saveSwingRecords(many);
    const saved = await getSwingRecords();
    expect(saved[saved.length - 1].id).toBe("r519");
    expect(saved[0].id).toBe("r20");
  });
});

describe("deleteSwingRecord", () => {
  it("removes the record locally and queues the id for the server", async () => {
    await saveSwingRecords([record({ id: "a" }), record({ id: "b" })]);
    await deleteSwingRecord("a");

    expect((await getSwingRecords()).map((r) => r.id)).toEqual(["b"]);
    expect(await getPendingDeletes()).toEqual(["a"]);
  });

  it("does not queue the same id twice", async () => {
    await saveSwingRecords([record({ id: "a" })]);
    await deleteSwingRecord("a");
    await deleteSwingRecord("a");
    expect(await getPendingDeletes()).toEqual(["a"]);
  });

  it("clears the queue once a sync has carried the deletions", async () => {
    await saveSwingRecords([record({ id: "a" }), record({ id: "b" })]);
    await deleteSwingRecord("a");
    await deleteSwingRecord("b");
    await clearPendingDeletes(["a"]);
    expect(await getPendingDeletes()).toEqual(["b"]);
  });
});

describe("computeConsistency", () => {
  it("returns null when the mode has no swings", () => {
    expect(computeConsistency([record({ gameMode: "long" })], "short")).toBeNull();
  });

  it("averages accuracy and deviation against the mode's gold standard", () => {
    const records = [
      record({ gameMode: "long", ratio: 3.0, accuracy: 100 }),
      record({ gameMode: "long", ratio: 2.0, accuracy: 60 }),
    ];
    const stats = computeConsistency(records, "long")!;
    expect(stats.count).toBe(2);
    expect(stats.goldStandard).toBe(3);
    expect(stats.avgAccuracy).toBe(80);
    expect(stats.avgDeviation).toBeCloseTo(0.5, 5);
  });

  it("uses 2:1 as the short-game standard", () => {
    const stats = computeConsistency([record({ gameMode: "short", ratio: 2 })], "short")!;
    expect(stats.goldStandard).toBe(2);
    expect(stats.avgDeviation).toBe(0);
  });

  it("only considers the most recent sampleSize swings", () => {
    const records = [
      ...Array.from({ length: 5 }, () => record({ accuracy: 0 })),
      ...Array.from({ length: 3 }, () => record({ accuracy: 90 })),
    ];
    expect(computeConsistency(records, "long", 3)!.avgAccuracy).toBe(90);
  });
});

describe("computeConsistencyTrend", () => {
  it("returns null without enough history to compare two windows", () => {
    const records = Array.from({ length: 5 }, () => record());
    expect(computeConsistencyTrend(records, "long", 10)).toBeNull();
  });

  it("reports a positive trend when recent swings are better", () => {
    const records = [
      ...Array.from({ length: 3 }, () => record({ accuracy: 50 })),
      ...Array.from({ length: 3 }, () => record({ accuracy: 80 })),
    ];
    expect(computeConsistencyTrend(records, "long", 3)).toBe(30);
  });

  it("reports a negative trend when recent swings are worse", () => {
    const records = [
      ...Array.from({ length: 3 }, () => record({ accuracy: 80 })),
      ...Array.from({ length: 3 }, () => record({ accuracy: 50 })),
    ];
    expect(computeConsistencyTrend(records, "long", 3)).toBe(-30);
  });
});

describe("computeClubBreakdown", () => {
  it("groups by club and sorts by swing count", () => {
    const records = [
      record({ club: "tee", ratio: 3, accuracy: 90 }),
      record({ club: "tee", ratio: 2.8, accuracy: 80 }),
      record({ club: "putting", ratio: 2, accuracy: 70 }),
    ];
    const breakdown = computeClubBreakdown(records);
    expect(breakdown.map((b) => b.club)).toEqual(["tee", "putting"]);
    expect(breakdown[0].count).toBe(2);
    expect(breakdown[0].avgRatio).toBeCloseTo(2.9, 5);
    expect(breakdown[0].avgAccuracy).toBe(85);
  });

  it("skips records with no club tagged", () => {
    expect(computeClubBreakdown([record({ club: null })])).toEqual([]);
  });
});

describe("computeCareerStats", () => {
  it("reports nulls rather than invented numbers for an empty history", () => {
    // The profile card used to show a hardcoded "24 / 3.1:1 / 82%" to every
    // account. Nulls are what let the UI render "—" instead.
    expect(computeCareerStats([])).toEqual({
      totalSwings: 0,
      bestRatio: null,
      bestAccuracy: null,
      avgAccuracy: null,
    });
  });

  it("picks the most accurate swing as best, not the most extreme ratio", () => {
    const records = [
      record({ ratio: 9.5, accuracy: 10 }),
      record({ ratio: 3.0, accuracy: 98 }),
    ];
    const stats = computeCareerStats(records);
    expect(stats.bestRatio).toBe(3.0);
    expect(stats.bestAccuracy).toBe(98);
  });

  it("counts every swing and averages accuracy", () => {
    const records = [record({ accuracy: 90 }), record({ accuracy: 70 })];
    const stats = computeCareerStats(records);
    expect(stats.totalSwings).toBe(2);
    expect(stats.avgAccuracy).toBe(80);
  });
});

describe("getRecordsForDate", () => {
  it("filters to one local day", () => {
    const records = [
      record({ id: "a", date: "2026-08-04" }),
      record({ id: "b", date: "2026-08-03" }),
    ];
    expect(getRecordsForDate(records, "2026-08-04").map((r) => r.id)).toEqual(["a"]);
  });
});
