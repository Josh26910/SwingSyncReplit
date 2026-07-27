/**
 * Distinct per-phase haptic patterns, not just per-phase intensity — lets a
 * player feel where they are in the swing cycle with the phone in a pocket
 * or eyes closed, instead of having to distinguish three impact strengths.
 */
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function pulse(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === "web") return;
  try {
    await Haptics.impactAsync(style);
  } catch {
    /* ignore */
  }
}

/** Single light pulse — takeaway. */
export async function hapticTakeaway() {
  await pulse(Haptics.ImpactFeedbackStyle.Light);
}

/** Two quick pulses — top of backswing. */
export async function hapticTop() {
  await pulse(Haptics.ImpactFeedbackStyle.Medium);
  await delay(90);
  await pulse(Haptics.ImpactFeedbackStyle.Medium);
}

/** One heavy pulse — impact. */
export async function hapticImpact() {
  await pulse(Haptics.ImpactFeedbackStyle.Heavy);
}
