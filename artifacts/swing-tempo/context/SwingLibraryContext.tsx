import React, { createContext, useCallback, useContext, useState } from "react";

export interface Markers {
  takeaway: number | null;
  top: number | null;
  impact: number | null;
}

export const EMPTY_MARKERS: Markers = { takeaway: null, top: null, impact: null };

export interface Swing {
  id: string;
  uri: string;
  name: string;
  markers: Markers;
  /** Trim in point, ms. Defaults to 0 (start of clip). */
  trimStartMs: number;
  /** Trim out point, ms. null means "end of clip" (no trim applied). */
  trimEndMs: number | null;
}

export type SwingOrigin = "mine" | "pro";

interface SwingLibraryContextValue {
  swings: Swing[];
  proSwings: Swing[];
  addSwing: (origin: SwingOrigin, swing: Swing) => void;
  updateSwing: (origin: SwingOrigin, id: string, patch: Partial<Swing>) => void;
  activeId: string | null;
  activeOrigin: SwingOrigin;
  setActive: (origin: SwingOrigin, id: string | null) => void;
  activeSwing: Swing | null;
}

const SwingLibraryContext = createContext<SwingLibraryContextValue | null>(null);

export function SwingLibraryProvider({ children }: { children: React.ReactNode }) {
  const [swings, setSwings] = useState<Swing[]>([]);
  const [proSwings, setProSwings] = useState<Swing[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<SwingOrigin>("mine");

  const addSwing = useCallback((origin: SwingOrigin, swing: Swing) => {
    const setList = origin === "mine" ? setSwings : setProSwings;
    setList((prev) => [swing, ...prev]);
  }, []);

  const updateSwing = useCallback(
    (origin: SwingOrigin, id: string, patch: Partial<Swing>) => {
      const setList = origin === "mine" ? setSwings : setProSwings;
      setList((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    },
    [],
  );

  const setActive = useCallback((origin: SwingOrigin, id: string | null) => {
    setActiveOrigin(origin);
    setActiveId(id);
  }, []);

  const activeSwing =
    (activeOrigin === "mine" ? swings : proSwings).find((s) => s.id === activeId) ?? null;

  return (
    <SwingLibraryContext.Provider
      value={{
        swings,
        proSwings,
        addSwing,
        updateSwing,
        activeId,
        activeOrigin,
        setActive,
        activeSwing,
      }}
    >
      {children}
    </SwingLibraryContext.Provider>
  );
}

export function useSwingLibrary() {
  const ctx = useContext(SwingLibraryContext);
  if (!ctx) throw new Error("useSwingLibrary must be used inside SwingLibraryProvider");
  return ctx;
}
