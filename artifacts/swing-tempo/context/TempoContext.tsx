import React, { createContext, useContext, useState } from "react";

import type { PlayerTempo } from "@/data/tempoPlayers";

export type TempoKey =
  | "18/6" | "21/7" | "24/8" | "27/9" | "30/10"
  | "14/7" | "16/8" | "18/9" | "20/10" | "22/11" | "24/12"
  | "custom";
export type GameMode  = "long" | "short";
export type AudioMode = "tones" | "piano" | "voice";

export interface TempoDefinition {
  key: TempoKey;
  label: string;
  topMs: number;
  impactMs: number;
  backswingFrames: number;
  downswingFrames: number;
}

export const TEMPOS: Record<Exclude<TempoKey, "custom">, TempoDefinition> = {
  "18/6": {
    key: "18/6",
    label: "18/6",
    topMs: 600,
    impactMs: 800,
    backswingFrames: 18,
    downswingFrames: 6,
  },
  "21/7": {
    key: "21/7",
    label: "21/7",
    topMs: 700,
    impactMs: 933,
    backswingFrames: 21,
    downswingFrames: 7,
  },
  "24/8": {
    key: "24/8",
    label: "24/8",
    topMs: 800,
    impactMs: 1067,
    backswingFrames: 24,
    downswingFrames: 8,
  },
  "27/9": {
    key: "27/9",
    label: "27/9",
    topMs: 900,
    impactMs: 1200,
    backswingFrames: 27,
    downswingFrames: 9,
  },
  "30/10": {
    key: "30/10",
    label: "30/10",
    topMs: 1000,
    impactMs: 1333,
    backswingFrames: 30,
    downswingFrames: 10,
  },
  // ── Short Game presets (2:1 ratio) ──────────────────────────────
  "14/7": {
    key: "14/7",
    label: "14/7",
    topMs: 467,
    impactMs: 700,
    backswingFrames: 14,
    downswingFrames: 7,
  },
  "16/8": {
    key: "16/8",
    label: "16/8",
    topMs: 533,
    impactMs: 800,
    backswingFrames: 16,
    downswingFrames: 8,
  },
  "18/9": {
    key: "18/9",
    label: "18/9",
    topMs: 600,
    impactMs: 900,
    backswingFrames: 18,
    downswingFrames: 9,
  },
  "20/10": {
    key: "20/10",
    label: "20/10",
    topMs: 667,
    impactMs: 1000,
    backswingFrames: 20,
    downswingFrames: 10,
  },
  "22/11": {
    key: "22/11",
    label: "22/11",
    topMs: 733,
    impactMs: 1100,
    backswingFrames: 22,
    downswingFrames: 11,
  },
  "24/12": {
    key: "24/12",
    label: "24/12",
    topMs: 800,
    impactMs: 1200,
    backswingFrames: 24,
    downswingFrames: 12,
  },
};

export const LONG_TEMPO_KEYS: TempoKey[] = ["18/6", "21/7", "24/8", "27/9", "30/10"];
export const SHORT_TEMPO_KEYS: TempoKey[] = ["14/7", "16/8", "18/9", "20/10", "22/11", "24/12"];

/** Returns the effective TempoDefinition, using player data when "custom". */
export function getEffectiveDef(
  key: TempoKey,
  customTempo: PlayerTempo | null
): TempoDefinition {
  if (key === "custom" && customTempo !== null) {
    const topMs    = Math.round(customTempo.backswing * 1000);
    const impactMs = Math.round((customTempo.backswing + customTempo.downswing) * 1000);
    return {
      key:              "custom",
      label:            customTempo.name,
      topMs,
      impactMs,
      backswingFrames:  Math.round(customTempo.backswing * 30),
      downswingFrames:  Math.round(customTempo.downswing * 30),
    };
  }
  // Fallback: never use TEMPOS["custom"] directly
  return key === "custom" ? TEMPOS["21/7"] : TEMPOS[key];
}

export type SwingPhase = "ready" | "start" | "top" | "impact";

interface TempoContextValue {
  selectedTempo: TempoKey;
  setSelectedTempo: (t: TempoKey) => void;
  gameMode: GameMode;
  setGameMode: (m: GameMode) => void;
  audioMode: AudioMode;
  setAudioMode: (m: AudioMode) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  currentPhase: SwingPhase;
  setCurrentPhase: (p: SwingPhase) => void;
  cycleProgress: number;
  setCycleProgress: (n: number) => void;
  /** Non-null when a player tempo has been loaded via "Start Tempo" */
  customTempo: PlayerTempo | null;
  setCustomTempo: (t: PlayerTempo | null) => void;
}

const TempoContext = createContext<TempoContextValue | null>(null);

export function TempoProvider({ children }: { children: React.ReactNode }) {
  const [selectedTempo,  setSelectedTempo]  = useState<TempoKey>("21/7");
  const [gameMode,       setGameMode]        = useState<GameMode>("long");
  const [audioMode,      setAudioMode]       = useState<AudioMode>("tones");
  const [isPlaying,      setIsPlaying]       = useState(false);
  const [currentPhase,   setCurrentPhase]    = useState<SwingPhase>("ready");
  const [cycleProgress,  setCycleProgress]   = useState(0);
  const [customTempo,    setCustomTempo]     = useState<PlayerTempo | null>(null);

  return (
    <TempoContext.Provider
      value={{
        selectedTempo,  setSelectedTempo,
        gameMode,       setGameMode,
        audioMode,      setAudioMode,
        isPlaying,      setIsPlaying,
        currentPhase,   setCurrentPhase,
        cycleProgress,  setCycleProgress,
        customTempo,    setCustomTempo,
      }}
    >
      {children}
    </TempoContext.Provider>
  );
}

export function useTempo() {
  const ctx = useContext(TempoContext);
  if (!ctx) throw new Error("useTempo must be used inside TempoProvider");
  return ctx;
}
