import { SyncBody, SyncResponse } from "@workspace/api-zod";
import { db, practiceSessionsTable, swingRecordsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { syncLimiter } from "../middlewares/rateLimit";

const router: IRouter = Router();

/**
 * Postgres caps a statement at 65535 bound parameters. Each swing record
 * binds ~11, so chunk well under that rather than relying on the request
 * body limit to keep us safe.
 */
const INSERT_CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

router.post("/sync", requireAuth, syncLimiter, async (req: AuthedRequest, res) => {
  const parsed = SyncBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid sync payload." });
    return;
  }
  const userId = req.user!.id;
  const { sessions, swingRecords } = parsed.data;
  const deletedIds = parsed.data.deletedSwingRecordIds ?? [];

  // One transaction for the whole merge. Previously each row was its own
  // statement with no transaction, so a failure partway through left the
  // account half-written — and the client swallows sync errors, so nobody
  // ever found out.
  const [allSessions, allRecords] = await db.transaction(async (tx) => {
    // Deletions first, so a record deleted on one device isn't resurrected
    // by the same payload that reports it gone.
    for (const ids of chunk(deletedIds, INSERT_CHUNK)) {
      await tx
        .delete(swingRecordsTable)
        .where(
          and(eq(swingRecordsTable.userId, userId), inArray(swingRecordsTable.clientId, ids)),
        );
    }

    // Sessions: upsert per (user, date). A safe merge for a value that may
    // have been recorded independently on two devices is to keep the larger
    // number rather than overwrite — that way a sync never erases practice
    // time that was already recorded server-side. Note this makes an
    // inflated value permanent, which is why duration/swings are bounded in
    // the OpenAPI schema.
    for (const batch of chunk(sessions, INSERT_CHUNK)) {
      await tx
        .insert(practiceSessionsTable)
        .values(
          batch.map((s) => ({
            userId,
            date: s.date,
            durationSeconds: s.duration,
            swings: s.swings ?? 0,
          })),
        )
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
    // addSwingRecord) — dedupe on (user, clientId), never overwrite. The
    // conflict target is the composite key, so one account's ids can no
    // longer collide with another's.
    const deleted = new Set(deletedIds);
    const toInsert = swingRecords.filter((r) => !deleted.has(r.id));
    for (const batch of chunk(toInsert, INSERT_CHUNK)) {
      await tx
        .insert(swingRecordsTable)
        .values(
          batch.map((r) => ({
            userId,
            clientId: r.id,
            date: r.date,
            timestamp: new Date(r.timestamp),
            swingId: r.swingId,
            origin: r.origin,
            golferName: r.golferName,
            gameMode: r.gameMode,
            club: r.club,
            ratio: r.ratio,
            accuracy: r.accuracy,
          })),
        )
        .onConflictDoNothing({
          target: [swingRecordsTable.userId, swingRecordsTable.clientId],
        });
    }

    return Promise.all([
      tx.query.practiceSessionsTable.findMany({
        where: eq(practiceSessionsTable.userId, userId),
      }),
      tx.query.swingRecordsTable.findMany({ where: eq(swingRecordsTable.userId, userId) }),
    ]);
  });

  res.json(
    SyncResponse.parse({
      sessions: allSessions.map((s) => ({
        date: s.date,
        duration: s.durationSeconds,
        swings: s.swings,
      })),
      swingRecords: allRecords.map((r) => ({
        id: r.clientId,
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
