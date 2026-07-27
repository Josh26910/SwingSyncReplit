import { integer, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

/**
 * Append-only swing analysis log — mirrors the client's local SwingRecord
 * shape (utils/swingHistory.ts). `id` is client-generated (see
 * addSwingRecord) so sync can dedupe by id instead of needing a separate
 * client/server id mapping.
 *
 * videoUrl/thumbnailUrl are nullable and unused until cloud video storage
 * (R2) lands — added now so that feature won't need a migration.
 */
export const swingRecordsTable = pgTable("swing_records", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  swingId: text("swing_id").notNull(),
  origin: text("origin", { enum: ["mine", "pro"] }).notNull(),
  golferName: text("golfer_name").notNull().default(""),
  gameMode: text("game_mode", { enum: ["long", "short"] }).notNull(),
  club: text("club"),
  ratio: real("ratio").notNull(),
  accuracy: integer("accuracy").notNull(),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSwingRecordSchema = createInsertSchema(swingRecordsTable).omit({
  createdAt: true,
});
export type InsertSwingRecord = z.infer<typeof insertSwingRecordSchema>;
export type SwingRecordRow = typeof swingRecordsTable.$inferSelect;
