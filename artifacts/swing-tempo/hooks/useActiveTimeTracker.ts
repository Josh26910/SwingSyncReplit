import { useEffect, useRef } from "react";

import { addActiveSeconds } from "@/utils/sessions";

const FLUSH_INTERVAL_MS = 15000;

/**
 * Accumulates wall-clock time spent "active" (tempo playing, video being
 * analyzed, ...) into today's practice-time bucket. Flushes periodically
 * while active and once more on stop, so a crash/backgrounded app never
 * loses more than one flush interval of practice time.
 */
export function useActiveTimeTracker(active: boolean) {
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    startRef.current = Date.now();
    const flush = () => {
      if (startRef.current === null) return;
      const now = Date.now();
      const elapsedSec = Math.floor((now - startRef.current) / 1000);
      if (elapsedSec > 0) {
        addActiveSeconds(elapsedSec);
        startRef.current = now;
      }
    };

    const timer = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      flush();
      startRef.current = null;
    };
  }, [active]);
}
