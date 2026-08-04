import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import type { ShotCategory } from "@/data/tempoPlayers";
import {
  deleteVideoFile,
  loadLibrary,
  saveLibrary,
} from "@/utils/swingLibraryStorage";

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
  /** Optional caption shown over the video, e.g. the golfer's name. */
  golferName?: string;
  /** Club/shot type this swing was tagged with, for per-club tempo stats. */
  club?: ShotCategory;
  /** Local frame-capture thumbnail (native only — see utils/thumbnails.ts). */
  thumbnailUri?: string;
}

export type SwingOrigin = "mine" | "pro";

interface SwingLibraryContextValue {
  swings: Swing[];
  proSwings: Swing[];
  /** False until the persisted library has been read back off disk. */
  isLoaded: boolean;
  addSwing: (origin: SwingOrigin, swing: Swing) => void;
  updateSwing: (origin: SwingOrigin, id: string, patch: Partial<Swing>) => void;
  removeSwing: (origin: SwingOrigin, id: string) => void;
  activeId: string | null;
  activeOrigin: SwingOrigin;
  setActive: (origin: SwingOrigin, id: string | null) => void;
  activeSwing: Swing | null;
  findSwing: (origin: SwingOrigin, id: string) => Swing | null;
}

const SwingLibraryContext = createContext<SwingLibraryContextValue | null>(null);

/**
 * The imported-swing library.
 *
 * This used to be plain in-memory state, which meant every imported video,
 * its markers and its thumbnail were lost the moment the app closed — and
 * because the profile's "Recent Swings" archive *does* persist its
 * SwingRecord rows, tapping one after a restart always failed with "this
 * swing is no longer in your library". The library is now mirrored to
 * AsyncStorage (and the video files themselves copied out of the OS cache
 * directory on import — see utils/swingLibraryStorage.ts).
 */
export function SwingLibraryProvider({ children }: { children: React.ReactNode }) {
  const [swings, setSwings] = useState<Swing[]>([]);
  const [proSwings, setProSwings] = useState<Swing[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<SwingOrigin>("mine");

  useEffect(() => {
    let cancelled = false;
    loadLibrary().then((stored) => {
      if (cancelled) return;
      setSwings(stored.swings);
      setProSwings(stored.proSwings);
      setIsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Mirror to disk on every change, but only once the initial read has
  // finished — otherwise the empty starting state would immediately
  // overwrite the stored library before it had been loaded.
  useEffect(() => {
    if (!isLoaded) return;
    void saveLibrary({ swings, proSwings });
  }, [isLoaded, swings, proSwings]);

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

  const removeSwing = useCallback((origin: SwingOrigin, id: string) => {
    const setList = origin === "mine" ? setSwings : setProSwings;
    setList((prev) => {
      const target = prev.find((s) => s.id === id);
      // Reclaim the copied video file too, or deleting a swing would leak
      // its clip into the app's document directory forever.
      if (target) void deleteVideoFile(target.uri);
      return prev.filter((s) => s.id !== id);
    });
    setActiveId((current) => (current === id ? null : current));
  }, []);

  const setActive = useCallback((origin: SwingOrigin, id: string | null) => {
    setActiveOrigin(origin);
    setActiveId(id);
  }, []);

  const activeSwing =
    (activeOrigin === "mine" ? swings : proSwings).find((s) => s.id === activeId) ?? null;

  const findSwing = useCallback(
    (origin: SwingOrigin, id: string): Swing | null =>
      (origin === "mine" ? swings : proSwings).find((s) => s.id === id) ?? null,
    [swings, proSwings],
  );

  return (
    <SwingLibraryContext.Provider
      value={{
        swings,
        proSwings,
        isLoaded,
        addSwing,
        updateSwing,
        removeSwing,
        activeId,
        activeOrigin,
        setActive,
        activeSwing,
        findSwing,
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
