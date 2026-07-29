import { integer, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Reference-pro tempo entries shown on the Tempos tab (formerly a static
 * array in the client, artifacts/swing-tempo/data/tempoPlayers.ts).
 *
 * The video itself is never stored here or anywhere in our infrastructure —
 * these are real broadcast swings we don't own the rights to re-host.
 * `youtubeId` just points at wherever the clip already lives on YouTube, and
 * is nullable: entries can exist (and drive the tempo trainer) before a
 * video has been sourced/uploaded for them.
 */
export const tempoVideosTable = pgTable("tempo_videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category", { enum: ["tee", "approach", "shortgame", "putting"] }).notNull(),
  name: text("name").notNull(),
  event: text("event").notNull(),
  year: integer("year").notNull(),
  club: text("club").notNull(),
  ratio: real("ratio").notNull(),
  duration: real("duration").notNull(),
  backswing: real("backswing").notNull(),
  downswing: real("downswing").notNull(),
  result: text("result"),
  youtubeId: text("youtube_id"),
  clipStartSec: real("clip_start_sec"),
  clipEndSec: real("clip_end_sec"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTempoVideoSchema = createInsertSchema(tempoVideosTable).omit({
  id: true,
  createdAt: true,
});
export const updateTempoVideoSchema = insertTempoVideoSchema.partial();
export type InsertTempoVideo = z.infer<typeof insertTempoVideoSchema>;
export type UpdateTempoVideo = z.infer<typeof updateTempoVideoSchema>;
export type TempoVideoRow = typeof tempoVideosTable.$inferSelect;
