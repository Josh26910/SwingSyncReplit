import { afterEach, describe, expect, it, vi } from "vitest";

import { daysAgoIso, toLocalIsoDate, todayIso } from "@/utils/dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("toLocalIsoDate", () => {
  it("formats as YYYY-MM-DD with zero padding", () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("uses the local calendar, not UTC", () => {
    // The bug this replaces: toISOString() reports the UTC date, so an
    // evening swing anywhere east of Greenwich was filed under tomorrow —
    // which is what silently broke streaks for Australian users. Constructing
    // from local components means the local day is what's recorded, whatever
    // the runner's timezone.
    const lateEvening = new Date(2026, 7, 4, 23, 30, 0);
    expect(toLocalIsoDate(lateEvening)).toBe("2026-08-04");

    const earlyMorning = new Date(2026, 7, 4, 0, 30, 0);
    expect(toLocalIsoDate(earlyMorning)).toBe("2026-08-04");
  });

  it("agrees with the date's own local getters", () => {
    const d = new Date(2026, 2, 9, 14, 12);
    const [year, month, day] = toLocalIsoDate(d).split("-").map(Number);
    expect(year).toBe(d.getFullYear());
    expect(month).toBe(d.getMonth() + 1);
    expect(day).toBe(d.getDate());
  });
});

describe("todayIso", () => {
  it("returns the current local date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4, 21, 0, 0));
    expect(todayIso()).toBe("2026-08-04");
  });
});

describe("daysAgoIso", () => {
  it("steps back whole local days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0));
    expect(daysAgoIso(0)).toBe("2026-08-04");
    expect(daysAgoIso(1)).toBe("2026-08-03");
    expect(daysAgoIso(7)).toBe("2026-07-28");
  });

  it("crosses month and year boundaries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 2, 12, 0, 0));
    expect(daysAgoIso(1)).toBe("2026-01-01");
    expect(daysAgoIso(2)).toBe("2025-12-31");
    expect(daysAgoIso(3)).toBe("2025-12-30");
  });

  it("handles leap days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2028, 2, 1, 12, 0, 0));
    expect(daysAgoIso(1)).toBe("2028-02-29");
  });
});
