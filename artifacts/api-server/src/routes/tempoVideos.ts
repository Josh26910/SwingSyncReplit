import {
  CreateTempoVideoBody,
  ListTempoVideosQueryParams,
  UpdateTempoVideoBody,
} from "@workspace/api-zod";
import { db, tempoVideosTable, type TempoVideoRow } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { requireAdmin } from "../middlewares/auth";

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

  res.json(rows.map(toDto));
});

router.post("/tempo-videos", requireAdmin, async (req, res) => {
  const parsed = CreateTempoVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tempo video payload." });
    return;
  }

  const [created] = await db.insert(tempoVideosTable).values(parsed.data).returning();
  res.status(201).json(toDto(created!));
});

router.patch("/tempo-videos/:id", requireAdmin, async (req, res) => {
  const parsed = UpdateTempoVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tempo video payload." });
    return;
  }

  const [updated] = await db
    .update(tempoVideosTable)
    .set(parsed.data)
    .where(eq(tempoVideosTable.id, String(req.params.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "No tempo video with that id." });
    return;
  }
  res.json(toDto(updated));
});

router.delete("/tempo-videos/:id", requireAdmin, async (req, res) => {
  await db.delete(tempoVideosTable).where(eq(tempoVideosTable.id, String(req.params.id)));
  res.status(204).end();
});

export default router;
