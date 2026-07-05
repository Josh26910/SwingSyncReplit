import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { TEMPOS, TempoKey, useTempo } from "@/context/TempoContext";

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

function playWebBeep(
  frequency: number = 880,
  duration: number = 0.08,
  gain: number = 0.4
) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // silently ignore audio errors
  }
}

function triggerStart() {
  if (Platform.OS === "web") {
    playWebBeep(660, 0.06, 0.3);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

function triggerTop() {
  if (Platform.OS === "web") {
    playWebBeep(880, 0.08, 0.45);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

function triggerImpact() {
  if (Platform.OS === "web") {
    playWebBeep(1100, 0.12, 0.6);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
}

export function useTempoEngine() {
  const { isPlaying, selectedTempo, setCurrentPhase, setDialProgress } =
    useTempo();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);

  const stopEngine = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setCurrentPhase("ready");
    setDialProgress(0);
  }, [setCurrentPhase, setDialProgress]);

  const startEngine = useCallback(() => {
    const tempo = TEMPOS[selectedTempo];
    const cycleDuration = tempo.impactMs + 600;

    const runCycle = () => {
      startTimeRef.current = Date.now();
      setCurrentPhase("start");
      triggerStart();

      const topTimer = setTimeout(() => {
        setCurrentPhase("top");
        triggerTop();
      }, tempo.topMs);

      const impactTimer = setTimeout(() => {
        setCurrentPhase("impact");
        triggerImpact();
      }, tempo.impactMs);

      return { topTimer, impactTimer };
    };

    const timers = runCycle();
    let topTimer = timers.topTimer;
    let impactTimer = timers.impactTimer;

    intervalRef.current = setInterval(() => {
      clearTimeout(topTimer);
      clearTimeout(impactTimer);
      const newTimers = runCycle();
      topTimer = newTimers.topTimer;
      impactTimer = newTimers.impactTimer;
    }, cycleDuration);

    const animateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / tempo.impactMs, 1);
      setDialProgress(progress);
      animFrameRef.current = requestAnimationFrame(animateProgress);
    };

    if (Platform.OS === "web") {
      animFrameRef.current = requestAnimationFrame(animateProgress);
    } else {
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const progress = Math.min(elapsed / tempo.impactMs, 1);
        setDialProgress(progress);
      }, 16);
      const origStop = stopEngine;
      intervalRef.current = setInterval(() => {
        clearTimeout(topTimer);
        clearTimeout(impactTimer);
        const newTimers = runCycle();
        topTimer = newTimers.topTimer;
        impactTimer = newTimers.impactTimer;
      }, cycleDuration);
      return () => {
        clearInterval(progressInterval);
        origStop();
      };
    }
  }, [selectedTempo, setCurrentPhase, setDialProgress, stopEngine]);

  useEffect(() => {
    if (isPlaying) {
      startEngine();
    } else {
      stopEngine();
    }
    return () => {
      stopEngine();
    };
  }, [isPlaying, selectedTempo, startEngine, stopEngine]);
}
