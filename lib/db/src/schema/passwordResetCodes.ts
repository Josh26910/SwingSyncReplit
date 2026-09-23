import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { usersTable } from "./users";

/**
 * Short-lived 6-digit codes for the Forgot Password flow. Only a SHA-256 hash
 * of the code is stored. Issuing a new code deletes the user's older ones, so
 * at most one is live per user; `attempts` caps guessing at MAX_ATTEMPTS in
 * routes/auth.ts before the code is burned.
 */
export const passwordResetCodesTable = pgTable("password_reset_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PasswordResetCode = typeof passwordResetCodesTable.$inferSelect;
