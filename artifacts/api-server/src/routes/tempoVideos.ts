import {
  CreateTempoVideoBody,
  ListTempoVideosQueryParams,
  UpdateTempoVideoBody,
  UpdateTempoVideoParams,
} from "@workspace/api-zod";
import { db, tempoVideosTable, type TempoVideoRow } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { requireAdmin } from "../middlewares/auth";
import { adminLimiter } from "../middlewares/rateLimit";

const router: IRouter = Router();

function toDto(row: TempoVideoRow) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    event: row.event,
    year: row.year,
    club: row.club,
    ratio: row.ratio,
    duration: row.duration,
    backswing: row.backswing,
    downswing: row.downswing,
    result: row.result,
    youtubeId: row.youtubeId,
    clipStartSec: row.clipStartSec,
    clipEndSec: row.clipEndSec,
    sortOrder: row.sortOrder,
  };
}

/**
 * `id` is a uuid column, so a non-uuid path segment makes Postgres raise
 * 22P02 and surfaces as a 500. Validate first and answer 404 instead.
 */
function parseId(req: Request, res: Response): string | null {
  const parsed = UpdateTempoVideoParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(404).json({ error: "No tempo video with that id." });
    return null;
  }
  return parsed.data.id;
}

router.get("/tempo-videos", async (req, res) => {
  const parsed = ListTempoVideosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query." });
    return;
  }

  const rows = await db.query.tempoVideosTable.findMany({
    where: parsed.data.category ? eq(tempoVideosTable.category, parsed.data.category) : undefined,
    orderBy: [asc(tempoVideosTable.sortOrder), asc(tempoVideosTable.name)],
  });

  // Reference tempos change roughly never (only when the operator attaches
  // a clip), and every Tempos-tab mount refetches the whole table. A short
  // cache keeps that off the database without making admin edits feel stale.
  res.set("Cache-Control", "public, max-age=300");
  res.json(rows.map(toDto));
});

router.post("/tempo-videos", adminLimiter, requireAdmin, async (req, res) => {
  const parsed = CreateTempoVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tempo video payload." });
    return;
  }

  const [created] = await db.insert(tempoVideosTable).values(parsed.data).returning();
  res.status(201).json(toDto(created!));
});

router.patch("/tempo-videos/:id", adminLimiter, requireAdmin, async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const parsed = UpdateTempoVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tempo video payload." });
    return;
  }

  const [updated] = await db
    .update(tempoVideosTable)
    .set(parsed.data)
    .where(eq(tempoVideosTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "No tempo video with that id." });
    return;
  }
  res.json(toDto(updated));
});

router.delete("/tempo-videos/:id", adminLimiter, requireAdmin, async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const deleted = await db
    .delete(tempoVideosTable)
    .where(eq(tempoVideosTable.id, id))
    .returning();

  if (deleted.length === 0) {
    res.status(404).json({ error: "No tempo video with that id." });
    return;
  }
  res.status(204).end();
});

export default router;
