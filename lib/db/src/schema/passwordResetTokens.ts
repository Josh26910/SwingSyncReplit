import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

/**
 * One-time password-reset tokens.
 *
 * Only a SHA-256 hash of the token is ever stored — the raw token exists
 * only in the email sent to the user and in the request that redeems it, so
 * a database read (backup, leak, insider) can never be turned into an
 * account takeover. `expiresAt` gives each token a short (30 minute)
 * lifetime, and `usedAt` makes redemption single-use: a request that races
 * a used or expired row is rejected the same way an unknown one is.
 */
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokensTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetTokenRow = typeof passwordResetTokensTable.$inferSelect;
