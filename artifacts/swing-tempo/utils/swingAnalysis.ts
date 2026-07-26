/**
 * Shared backswing/downswing ratio math — used by the live Analysis screen,
 * the Compare screen, and swing-history recording, so grade/accuracy
 * thresholds can't drift between them.
 */
import type { Markers } from "@/context/SwingLibraryContext";

const FPS = 30;
const MS_PER_FRAME = 1000 / FPS;

export type SwingGrade = "ELITE" | "TOUR" | "GOOD" | "IMPROVE";

export interface SwingAnalysis {
  backswingMs: number;
  downswingMs: number;
  backswingFrames: number;
  downswingFrames: number;
  ratio: number;
  ratioStr: string;
  accuracy: number;
  grade: SwingGrade;
  gradeColor: string;
}

export function gradeForAccuracy(accuracy: number): { grade: SwingGrade; gradeColor: string } {
  if (accuracy >= 90) return { grade: "ELITE", gradeColor: "#30D158" };
  if (accuracy >= 75) return { grade: "TOUR", gradeColor: "#1A8CFF" };
  if (accuracy >= 60) return { grade: "GOOD", gradeColor: "#FF9F0A" };
  return { grade: "IMPROVE", gradeColor: "#FF3B30" };
}

export function computeSwingAnalysis(marks: Markers, perfectRatio: number): SwingAnalysis | null {
  if (marks.takeaway === null || marks.top === null || marks.impact === null) return null;
  const backswingMs = marks.top - marks.takeaway;
  const downswingMs = marks.impact - marks.top;
  if (downswingMs <= 0 || backswingMs <= 0) return null;

  const ratio = backswingMs / downswingMs;
  const accuracy = Math.max(0, 100 - Math.abs(ratio - perfectRatio) * 33);
  const { grade, gradeColor } = gradeForAccuracy(accuracy);

  return {
    backswingMs,
    downswingMs,
    backswingFrames: Math.round(backswingMs / MS_PER_FRAME),
    downswingFrames: Math.round(downswingMs / MS_PER_FRAME),
    ratio,
    ratioStr: ratio.toFixed(2),
    accuracy: Math.round(accuracy),
    grade,
    gradeColor,
  };
}
