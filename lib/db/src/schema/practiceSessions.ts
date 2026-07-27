import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

/**
 * One row per (user, day) — mirrors the client's local Session shape
 * (utils/sessions.ts) so synced rows can be merged 1:1 against local
 * AsyncStorage entries without any reshaping.
 */
export const practiceSessionsTable = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    durationSeconds: integer("duration_seconds").notNull().default(0),
    swings: integer("swings").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("practice_sessions_user_date_idx").on(table.userId, table.date)],
);

export const insertPracticeSessionSchema = createInsertSchema(practiceSessionsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertPracticeSession = z.infer<typeof insertPracticeSessionSchema>;
export type PracticeSession = typeof practiceSessionsTable.$inferSelect;
