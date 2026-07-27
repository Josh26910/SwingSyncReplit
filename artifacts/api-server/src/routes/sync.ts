import { SyncBody, SyncResponse } from "@workspace/api-zod";
import { db, practiceSessionsTable, swingRecordsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/sync", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = SyncBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid sync payload." });
    return;
  }
  const userId = req.user!.id;
  const { sessions, swingRecords } = parsed.data;

  // Sessions: upsert per (user, date). A safe merge for a value that may
  // have been recorded independently on two devices is to keep the larger
  // number rather than overwrite — that way a sync never erases practice
  // time that was already recorded server-side.
  for (const s of sessions) {
    await db
      .insert(practiceSessionsTable)
      .values({
        userId,
        date: s.date,
        durationSeconds: s.duration,
        swings: s.swings ?? 0,
      })
      .onConflictDoUpdate({
        target: [practiceSessionsTable.userId, practiceSessionsTable.date],
        set: {
          durationSeconds: sql`greatest(${practiceSessionsTable.durationSeconds}, excluded.duration_seconds)`,
          swings: sql`greatest(${practiceSessionsTable.swings}, excluded.swings)`,
          updatedAt: new Date(),
        },
      });
  }

  // Swing records are immutable once created client-side (see
  // addSwingRecord) — dedupe by client-generated id, never overwrite.
  for (const r of swingRecords) {
    await db
      .insert(swingRecordsTable)
      .values({
        id: r.id,
        userId,
        date: r.date,
        timestamp: new Date(r.timestamp),
        swingId: r.swingId,
        origin: r.origin,
        golferName: r.golferName,
        gameMode: r.gameMode,
        club: r.club,
        ratio: r.ratio,
        accuracy: r.accuracy,
      })
      .onConflictDoNothing({ target: swingRecordsTable.id });
  }

  const [allSessions, allRecords] = await Promise.all([
    db.query.practiceSessionsTable.findMany({ where: eq(practiceSessionsTable.userId, userId) }),
    db.query.swingRecordsTable.findMany({ where: eq(swingRecordsTable.userId, userId) }),
  ]);

  res.json(
    SyncResponse.parse({
      sessions: allSessions.map((s) => ({
        date: s.date,
        duration: s.durationSeconds,
        swings: s.swings,
      })),
      swingRecords: allRecords.map((r) => ({
        id: r.id,
        date: r.date,
        timestamp: r.timestamp.getTime(),
        swingId: r.swingId,
        origin: r.origin as "mine" | "pro",
        golferName: r.golferName,
        gameMode: r.gameMode as "long" | "short",
        club: r.club,
        ratio: r.ratio,
        accuracy: r.accuracy,
      })),
    }),
  );
});

export default router;
