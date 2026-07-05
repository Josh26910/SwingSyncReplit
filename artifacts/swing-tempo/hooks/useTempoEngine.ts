import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { TEMPOS, useTempo } from "@/context/TempoContext";

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (Platform.OS !== "web") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function playWebBeep(frequency = 880, duration = 0.08, gain = 0.4) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // ignore
  }
}

function triggerStart() {
  if (Platform.OS === "web") playWebBeep(660, 0.06, 0.3);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
function triggerTop() {
  if (Platform.OS === "web") playWebBeep(880, 0.08, 0.45);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}
function triggerImpact() {
  if (Platform.OS === "web") playWebBeep(1100, 0.12, 0.6);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

export function useTempoEngine() {
  const { isPlaying, selectedTempo, setCurrentPhase, setCycleProgress } =
    useTempo();

  const stateRef = useRef({ startTime: 0, running: false });
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cycleInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const animInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEngine = useCallback(() => {
    stateRef.current.running = false;
    pendingTimers.current.forEach(clearTimeout);
    pendingTimers.current = [];
    if (cycleInterval.current) {
      clearInterval(cycleInterval.current);
      cycleInterval.current = null;
    }
    if (animInterval.current) {
      clearInterval(animInterval.current);
      animInterval.current = null;
    }
    setCurrentPhase("ready");
    setCycleProgress(0);
  }, [setCurrentPhase, setCycleProgress]);

  const startEngine = useCallback(() => {
    const tempo = TEMPOS[selectedTempo];
    const cycleDuration = tempo.impactMs + 700; // full cycle including follow-through
    stateRef.current.running = true;

    const runCycle = () => {
      stateRef.current.startTime = Date.now();
      setCurrentPhase("start");
      triggerStart();

      const t1 = setTimeout(() => {
        setCurrentPhase("top");
        triggerTop();
      }, tempo.topMs);

      const t2 = setTimeout(() => {
        setCurrentPhase("impact");
        triggerImpact();
      }, tempo.impactMs);

      pendingTimers.current = [t1, t2];
    };

    runCycle();

    cycleInterval.current = setInterval(() => {
      pendingTimers.current.forEach(clearTimeout);
      runCycle();
    }, cycleDuration);

    // Drive cycleProgress at ~30 fps for smooth golfer animation
    animInterval.current = setInterval(() => {
      if (!stateRef.current.running) return;
      const elapsed = Date.now() - stateRef.current.startTime;
      const progress = Math.min(elapsed / cycleDuration, 1);
      setCycleProgress(progress);
    }, 33);
  }, [selectedTempo, setCurrentPhase, setCycleProgress]);

  useEffect(() => {
    if (isPlaying) startEngine();
    else stopEngine();
    return stopEngine;
  }, [isPlaying, selectedTempo, startEngine, stopEngine]);
}
