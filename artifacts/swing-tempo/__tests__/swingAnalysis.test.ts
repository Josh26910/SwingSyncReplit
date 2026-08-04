import { describe, expect, it } from "vitest";

import { computeSwingAnalysis, gradeForAccuracy } from "@/utils/swingAnalysis";

const marks = (takeaway: number, top: number, impact: number) => ({ takeaway, top, impact });

describe("computeSwingAnalysis", () => {
  it("derives the ratio from the backswing and downswing spans", () => {
    // 900ms back, 300ms down = a textbook 3:1 long-game swing.
    const result = computeSwingAnalysis(marks(0, 900, 1200), 3);
    expect(result).not.toBeNull();
    expect(result!.backswingMs).toBe(900);
    expect(result!.downswingMs).toBe(300);
    expect(result!.ratio).toBeCloseTo(3, 5);
    expect(result!.ratioStr).toBe("3.00");
  });

  it("scores a swing on the target ratio as perfect", () => {
    const result = computeSwingAnalysis(marks(0, 900, 1200), 3);
    expect(result!.accuracy).toBe(100);
    expect(result!.grade).toBe("ELITE");
  });

  it("converts spans to 30fps frame counts", () => {
    const result = computeSwingAnalysis(marks(0, 700, 933), 3);
    expect(result!.backswingFrames).toBe(21);
    expect(result!.downswingFrames).toBe(7);
  });

  it("penalises deviation from the target ratio at 33 points per unit", () => {
    // ratio 2.0 against a 3.0 target = 1.0 off = 33 points lost.
    const result = computeSwingAnalysis(marks(0, 800, 1200), 3);
    expect(result!.ratio).toBeCloseTo(2, 5);
    expect(result!.accuracy).toBe(67);
  });

  it("never reports a negative accuracy however far off the swing is", () => {
    const result = computeSwingAnalysis(marks(0, 5000, 5100), 2);
    expect(result!.accuracy).toBeGreaterThanOrEqual(0);
  });

  it("returns null when any marker is unset", () => {
    expect(computeSwingAnalysis({ takeaway: null, top: 900, impact: 1200 }, 3)).toBeNull();
    expect(computeSwingAnalysis({ takeaway: 0, top: null, impact: 1200 }, 3)).toBeNull();
    expect(computeSwingAnalysis({ takeaway: 0, top: 900, impact: null }, 3)).toBeNull();
  });

  it("returns null for markers that are out of order", () => {
    // Impact before top, or top before takeaway, is a mis-marked swing —
    // not a swing with a negative ratio.
    expect(computeSwingAnalysis(marks(0, 900, 800), 3)).toBeNull();
    expect(computeSwingAnalysis(marks(900, 0, 1200), 3)).toBeNull();
  });

  it("returns null when top and impact coincide (zero-length downswing)", () => {
    expect(computeSwingAnalysis(marks(0, 900, 900), 3)).toBeNull();
  });
});

describe("gradeForAccuracy", () => {
  it("maps accuracy onto the four grade bands", () => {
    expect(gradeForAccuracy(100).grade).toBe("ELITE");
    expect(gradeForAccuracy(90).grade).toBe("ELITE");
    expect(gradeForAccuracy(89).grade).toBe("TOUR");
    expect(gradeForAccuracy(75).grade).toBe("TOUR");
    expect(gradeForAccuracy(74).grade).toBe("GOOD");
    expect(gradeForAccuracy(60).grade).toBe("GOOD");
    expect(gradeForAccuracy(59).grade).toBe("IMPROVE");
    expect(gradeForAccuracy(0).grade).toBe("IMPROVE");
  });

  it("gives every grade a distinct colour", () => {
    const colors = [100, 80, 65, 10].map((a) => gradeForAccuracy(a).gradeColor);
    expect(new Set(colors).size).toBe(4);
  });
});
