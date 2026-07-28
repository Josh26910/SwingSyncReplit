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

  // Absolute-time scheduler state: every event's fire time is an offset from
  // a single epoch, and the tick below re-derives "where we should be right
  // now" from real elapsed time on every pass. A setTimeout chain re-arms
  // its next delay relative to whenever the previous callback actually fired,
  // so JS-thread jitter compounds cycle over cycle; this catches up instead
  // of drifting, because each tick compares wall-clock time against the
  // fixed schedule rather than against the previous (possibly late) tick.
  const engineRef  = useRef({
    running: false,
    epoch: 0,
    cycleDur: 0,
    lastCycleIndex: -1,
    fired: new Set<string>(),
  });
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEngine = useCallback(() => {
    engineRef.current.running = false;
    if (schedulerRef.current) { clearInterval(schedulerRef.current); schedulerRef.current = null; }
    setCurrentPhase("ready");
    setCycleProgress(0);
  }, [setCurrentPhase, setCycleProgress]);

  const startEngine = useCallback(() => {
    const tempo    = getEffectiveDef(selectedTempo, customTempo);
    const cycleDur = tempo.impactMs + 700;

    const events = [
      { key: "start",  atMs: 0,             phase: "start"  as const, play: playStart,  haptic: hapticTakeaway },
      { key: "top",    atMs: tempo.topMs,    phase: "top"    as const, play: playTop,    haptic: hapticTop },
      { key: "impact", atMs: tempo.impactMs, phase: "impact" as const, play: playImpact, haptic: hapticImpact },
    ];

    engineRef.current = {
      running: true,
      epoch: Date.now(),
      cycleDur,
      lastCycleIndex: -1,
      fired: new Set(),
    };

    // 10ms ticks (vs. one setTimeout per event) keep worst-case beep lateness
    // to a single tick instead of a whole dropped/delayed timer callback.
    schedulerRef.current = setInterval(() => {
      const eng = engineRef.current;
      if (!eng.running) return;

      const elapsed     = Date.now() - eng.epoch;
      const cycleIndex   = Math.floor(elapsed / eng.cycleDur);
      const cycleElapsed = elapsed - cycleIndex * eng.cycleDur;

      if (cycleIndex !== eng.lastCycleIndex) {
        eng.lastCycleIndex = cycleIndex;
        eng.fired.clear();
      }

      setCycleProgress(Math.min(cycleElapsed / eng.cycleDur, 1));

      for (const ev of events) {
        if (eng.fired.has(ev.key)) continue;
        if (cycleElapsed >= ev.atMs) {
          eng.fired.add(ev.key);
          setCurrentPhase(ev.phase);
          ev.haptic();
          ev.play(audioMode);
        }
      }
    }, 10);
  }, [selectedTempo, customTempo, audioMode, setCurrentPhase, setCycleProgress]);

  useEffect(() => {
    if (isPlaying) startEngine();
    else stopEngine();
    return stopEngine;
  }, [isPlaying, selectedTempo, customTempo, audioMode, startEngine, stopEngine]);
}
