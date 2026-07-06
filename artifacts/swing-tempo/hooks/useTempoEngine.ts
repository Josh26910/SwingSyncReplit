import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { getEffectiveDef, useTempo } from "@/context/TempoContext";

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

/* ── Audio helpers ────────────────────────────────────────────────── */

function playTone(frequency = 880, duration = 0.08, gain = 0.4) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* ignore */ }
}

function playPiano(frequency = 880, duration = 0.5, gain = 0.35) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    // Triangle wave has richer harmonics → closer to piano-ish tone
    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    // ADSR-ish envelope: fast attack, short decay, gentle release
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.02);   // attack
    g.gain.exponentialRampToValueAtTime(gain * 0.4, now + 0.15); // decay
    g.gain.exponentialRampToValueAtTime(0.001, now + duration); // release
    osc.start(now);
    osc.stop(now + duration);
  } catch { /* ignore */ }
}

/** Speak a word using the best available TTS engine */
async function speak(word: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(word);
      u.rate  = 1.1;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    }
    return;
  }
  try {
    const Speech = (await import("expo-speech")).default;
    Speech.speak(word, { rate: 1.1, pitch: 1.0, language: "en" });
  } catch {
    // expo-speech unavailable → fall back silently
  }
}

/* ── Trigger helpers wired to audio mode ──────────────────────────── */

function triggerStart(audioMode: string) {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  if (audioMode === "tones")  { playTone(660, 0.06, 0.3); }
  if (audioMode === "piano")  { playPiano(523.25, 0.35, 0.35); } // C5
  if (audioMode === "voice")  { speak("start"); }
}

function triggerTop(audioMode: string) {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
  if (audioMode === "tones")  { playTone(880, 0.08, 0.45); }
  if (audioMode === "piano")  { playPiano(659.25, 0.45, 0.40); } // E5
  if (audioMode === "voice")  { speak("top"); }
}

function triggerImpact(audioMode: string) {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
  if (audioMode === "tones")  { playTone(1100, 0.12, 0.6); }
  if (audioMode === "piano")  { playPiano(880.0, 0.55, 0.45); }  // A5
  if (audioMode === "voice")  { speak("impact"); }
}

export function useTempoEngine() {
  const {
    isPlaying,
    selectedTempo,
    customTempo,
    audioMode,
    setCurrentPhase,
    setCycleProgress,
  } = useTempo();

  const stateRef       = useRef({ startTime: 0, running: false });
  const pendingTimers  = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cycleInterval  = useRef<ReturnType<typeof setInterval> | null>(null);
  const animInterval   = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEngine = useCallback(() => {
    stateRef.current.running = false;
    pendingTimers.current.forEach(clearTimeout);
    pendingTimers.current = [];
    if (cycleInterval.current)  { clearInterval(cycleInterval.current);  cycleInterval.current  = null; }
    if (animInterval.current)   { clearInterval(animInterval.current);   animInterval.current   = null; }
    setCurrentPhase("ready");
    setCycleProgress(0);
  }, [setCurrentPhase, setCycleProgress]);

  const startEngine = useCallback(() => {
    // Use the effective definition — respects custom player tempo
    const tempo        = getEffectiveDef(selectedTempo, customTempo);
    const cycleDuration = tempo.impactMs + 700;
    stateRef.current.running = true;

    const runCycle = () => {
      stateRef.current.startTime = Date.now();
      setCurrentPhase("start");
      triggerStart(audioMode);

      const t1 = setTimeout(() => { setCurrentPhase("top");    triggerTop(audioMode);    }, tempo.topMs);
      const t2 = setTimeout(() => { setCurrentPhase("impact"); triggerImpact(audioMode); }, tempo.impactMs);

      pendingTimers.current = [t1, t2];
    };

    runCycle();

    cycleInterval.current = setInterval(() => {
      pendingTimers.current.forEach(clearTimeout);
      runCycle();
    }, cycleDuration);

    animInterval.current = setInterval(() => {
      if (!stateRef.current.running) return;
      const elapsed  = Date.now() - stateRef.current.startTime;
      const progress = Math.min(elapsed / cycleDuration, 1);
      setCycleProgress(progress);
    }, 33);
  }, [selectedTempo, customTempo, setCurrentPhase, setCycleProgress]);

  useEffect(() => {
    if (isPlaying) startEngine();
    else stopEngine();
    return stopEngine;
  }, [isPlaying, selectedTempo, customTempo, startEngine, stopEngine]);
}
