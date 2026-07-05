import React, { createContext, useContext, useState } from "react";

export type TempoKey = "18/6" | "21/7" | "24/8" | "27/9" | "30/10";
export type GameMode = "long" | "short";
export type AudioMode = "tones" | "voice";

export interface TempoDefinition {
  key: TempoKey;
  label: string;
  topMs: number;
  impactMs: number;
  backswingFrames: number;
  downswingFrames: number;
}

export const TEMPOS: Record<TempoKey, TempoDefinition> = {
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
};

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
  /** 0–1 over the full cycle duration (backswing → downswing → follow-through → reset) */
  cycleProgress: number;
  setCycleProgress: (n: number) => void;
}

const TempoContext = createContext<TempoContextValue | null>(null);

export function TempoProvider({ children }: { children: React.ReactNode }) {
  const [selectedTempo, setSelectedTempo] = useState<TempoKey>("21/7");
  const [gameMode, setGameMode] = useState<GameMode>("long");
  const [audioMode, setAudioMode] = useState<AudioMode>("tones");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<SwingPhase>("ready");
  const [cycleProgress, setCycleProgress] = useState(0);

  return (
    <TempoContext.Provider
      value={{
        selectedTempo,
        setSelectedTempo,
        gameMode,
        setGameMode,
        audioMode,
        setAudioMode,
        isPlaying,
        setIsPlaying,
        currentPhase,
        setCurrentPhase,
        cycleProgress,
        setCycleProgress,
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
