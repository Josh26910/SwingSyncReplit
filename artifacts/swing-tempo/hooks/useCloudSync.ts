import { sync } from "@workspace/api-client-react";
import { useEffect, useRef } from "react";

import { useAuth } from "@/context/AuthContext";
import { getSessions, saveSessions } from "@/utils/sessions";
import {
  clearPendingDeletes,
  getPendingDeletes,
  getSwingRecords,
  saveSwingRecords,
  type SwingRecord,
} from "@/utils/swingHistory";
import type { ShotCategory } from "@/data/tempoPlayers";

const SYNC_INTERVAL_MS = 60000;

/**
 * Local-first cloud sync: while signed in, periodically pushes the local
 * practice-session/swing-history snapshot to the API and replaces local
 * storage with the merged authoritative response. AsyncStorage stays the
 * source of truth for the UI at all times — this only reconciles it with
 * the account in the background, and any failure (offline, no account yet
 * provisioned) is silently ignored so it never blocks local usage.
 */
export function useCloudSync() {
  const { user } = useAuth();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!user) return;

    const runSync = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const [sessions, swingRecords, pendingDeletes] = await Promise.all([
          getSessions(),
          getSwingRecords(),
          getPendingDeletes(),
        ]);
        const merged = await sync({
          sessions: sessions.map((s) => ({ date: s.date, duration: s.duration, swings: s.swings ?? 0 })),
          // Strip local-only fields — the server's schema rejects unknown
          // keys, and thumbnailUri is a device path it must never store.
          swingRecords: swingRecords.map(({ thumbnailUri: _thumbnailUri, ...rest }) => rest),
          deletedSwingRecordIds: pendingDeletes,
        });
        // thumbnailUri is local-only (a device file path) — the server
        // never stores or returns it, so reattach it from local records by
        // id after merging rather than losing it on every sync round-trip.
        const localThumbnails = new Map(swingRecords.map((r) => [r.id, r.thumbnailUri]));
        const mergedRecords: SwingRecord[] = merged.swingRecords.map((r) => ({
          ...r,
          club: r.club as ShotCategory | null,
          thumbnailUri: localThumbnails.get(r.id) ?? null,
        }));
        await Promise.all([
          saveSessions(merged.sessions.map((s) => ({ date: s.date, duration: s.duration, swings: s.swings }))),
          saveSwingRecords(mergedRecords),
          // The server has now applied these, and the merged response no
          // longer contains them — drop them from the queue so it doesn't
          // grow forever.
          clearPendingDeletes(pendingDeletes),
        ]);
      } catch {
        // Best-effort — local data is unaffected by a failed sync attempt,
        // and pending deletes stay queued for the next round.
      } finally {
        inFlight.current = false;
      }
    };

    runSync();
    const timer = setInterval(runSync, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user]);
}
