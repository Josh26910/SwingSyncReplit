import { useCallback, useEffect, useRef } from "react";

import { getEffectiveDef, useTempo } from "@/context/TempoContext";
import { playImpact, playStart, playTop, preloadSounds } from "@/utils/audio";
import { useActiveTimeTracker } from "@/hooks/useActiveTimeTracker";
import { hapticImpact, hapticTakeaway, hapticTop } from "@/utils/haptics";

// Pre-warm the audio engine (native: on-disk WAV cache, web: AudioContext)
// the first time this module loads, so the first tap of Play has no
// cold-start latency.
preloadSounds();

export function useTempoEngine() {
  const {
    isPlaying,
    selectedTempo,
    customTempo,
    audioMode,
    setCurrentPhase,
    setCycleProgress,
  } = useTempo();

  useActiveTimeTracker(isPlaying);

  const stateRef   = useRef({ running: false, startTime: 0 });
  const timers     = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cycleRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEngine = useCallback(() => {
    stateRef.current.running = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (cycleRef.current) { clearInterval(cycleRef.current); cycleRef.current = null; }
    if (animRef.current)  { clearInterval(animRef.current);  animRef.current  = null; }
    setCurrentPhase("ready");
    setCycleProgress(0);
  }, [setCurrentPhase, setCycleProgress]);

  const startEngine = useCallback(() => {
    const tempo    = getEffectiveDef(selectedTempo, customTempo);
    const cycleDur = tempo.impactMs + 700;
    stateRef.current.running = true;

    const runCycle = () => {
      stateRef.current.startTime = Date.now();
      setCurrentPhase("start");
      hapticTakeaway();
      playStart(audioMode);

      const t1 = setTimeout(() => {
        setCurrentPhase("top");
        hapticTop();
        playTop(audioMode);
      }, tempo.topMs);

      const t2 = setTimeout(() => {
        setCurrentPhase("impact");
        hapticImpact();
        playImpact(audioMode);
      }, tempo.impactMs);

      timers.current = [t1, t2];
    };

    runCycle();

    cycleRef.current = setInterval(() => {
      timers.current.forEach(clearTimeout);
      runCycle();
    }, cycleDur);

    animRef.current = setInterval(() => {
      if (!stateRef.current.running) return;
      const elapsed = Date.now() - stateRef.current.startTime;
      setCycleProgress(Math.min(elapsed / cycleDur, 1));
    }, 33);
  }, [selectedTempo, customTempo, audioMode, setCurrentPhase, setCycleProgress]);

  useEffect(() => {
    if (isPlaying) startEngine();
    else stopEngine();
    return stopEngine;
  }, [isPlaying, selectedTempo, customTempo, audioMode, startEngine, stopEngine]);
}
