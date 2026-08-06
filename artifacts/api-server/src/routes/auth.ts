import { createHash, randomBytes } from "node:crypto";

import {
  ChangePasswordBody,
  DeleteAccountBody,
  ForgotPasswordBody,
  GetCurrentUserResponse,
  LoginBody,
  ResetPasswordBody,
  SignupBody,
  UpdateProfileBody,
} from "@workspace/api-zod";
import {
  db,
  passwordResetTokensTable,
  practiceSessionsTable,
  swingRecordsTable,
  type User,
  usersTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { config } from "../lib/config";
import { sendPasswordResetEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { type AuthedRequest, requireAuth, signAuthToken } from "../middlewares/auth";
import { authLimiter, passwordResetLimiter, signupLimiter } from "../middlewares/rateLimit";

const router: IRouter = Router();

const BCRYPT_ROUNDS = 12;

/**
 * A pre-computed hash of a throwaway value. Compared against on the
 * "no such user" login path so that a request for a non-existent account
 * costs the same ~300ms of bcrypt as a real one — otherwise response time
 * alone tells an attacker which emails are registered.
 */
const DUMMY_HASH = bcrypt.hashSync("swingtempo-timing-equalisation-dummy", BCRYPT_ROUNDS);

function toAuthUser(user: User) {
  return GetCurrentUserResponse.parse({
    id: user.id,
    email: user.email,
    name: user.name,
  });
}

router.post("/auth/signup", signupLimiter, async (req, res) => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid signup payload." });
    return;
  }
  const email = parsed.data.email.toLowerCase();

  // Hash before the existence check so both outcomes cost the same, rather
  // than the "already exists" path returning in milliseconds and leaking
  // registration status through timing.
  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);

  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });
  if (existing) {
    res.status(400).json({ error: "An account with that email already exists." });
    return;
  }

  const [created] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name: parsed.data.name ?? null })
    .returning();

  if (!created) {
    res.status(500).json({ error: "Failed to create account." });
    return;
  }

  res.status(201).json({
    token: signAuthToken(created.id, created.tokenVersion),
    user: toAuthUser(created),
  });
});

router.post("/auth/login", authLimiter, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login payload." });
    return;
  }
  const email = parsed.data.email.toLowerCase();

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });

  // Always run a bcrypt comparison, even with no matching user, so the
  // unknown-email and wrong-password paths take the same time.
  const matches = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !matches) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  res.json({
    token: signAuthToken(user.id, user.tokenVersion),
    user: toAuthUser(user),
  });
});

router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json(toAuthUser(req.user!));
});

router.patch("/auth/me", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile payload." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ name: parsed.data.name })
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  res.json(toAuthUser(updated!));
});

router.patch("/auth/password", requireAuth, authLimiter, async (req: AuthedRequest, res) => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid password payload." });
    return;
  }

  const matches = await bcrypt.compare(parsed.data.currentPassword, req.user!.passwordHash);
  if (!matches) {
    res.status(400).json({ error: "Current password is incorrect." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS);
  // Bumping tokenVersion is the whole point: changing a password has to
  // invalidate sessions an attacker may already hold, otherwise the one
  // action a compromised user takes does nothing for 30 days.
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash, tokenVersion: req.user!.tokenVersion + 1 })
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  // The caller's own token is now stale too, so hand back a fresh one —
  // changing your password shouldn't sign you out of the device you did it on.
  res.json({
    token: signAuthToken(updated!.id, updated!.tokenVersion),
    user: toAuthUser(updated!),
  });
});

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Request a password-reset email.
 *
 * Always responds with the same generic message regardless of whether the
 * email is registered — that's what keeps this endpoint from being usable
 * to enumerate accounts (see the signup/login timing fix above for the same
 * principle). The token itself is a random 32-byte value; only its SHA-256
 * hash is stored, so a database read can never be turned into a working
 * reset link.
 */
router.post("/auth/forgot-password", passwordResetLimiter, async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  const GENERIC_MESSAGE = "If that email has an account, a reset link is on its way.";
  const email = parsed.data.email.toLowerCase();

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (!user) {
    res.json({ message: GENERIC_MESSAGE });
    return;
  }

  const token = randomBytes(RESET_TOKEN_BYTES).toString("hex");
  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  if (config.appUrl) {
    const resetUrl = `${config.appUrl}/reset-password?token=${token}`;
    const sent = await sendPasswordResetEmail(user.email, resetUrl);
    if (!sent) {
      // Not surfaced to the caller — the response is generic either way —
      // but worth knowing about from the logs (e.g. RESEND_API_KEY unset,
      // or the sandbox sender rejecting a non-account recipient).
      logger.warn({ userId: user.id }, "Password-reset email could not be sent");
    }
  } else {
    logger.warn("APP_URL/REPLIT_DEV_DOMAIN not set — cannot build a reset link.");
  }

  res.json({ message: GENERIC_MESSAGE });
});

/**
 * Redeem a reset token. Single-use: the token row is marked used in the same
 * transaction as the password change, so a second redemption attempt — a
 * retry, a race, or an attacker who intercepted the link after the real
 * user already used it — fails the same way an unknown token does.
 */
router.post("/auth/reset-password", passwordResetLimiter, async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  const tokenHash = hashResetToken(parsed.data.token);
  const result = await db.transaction(async (tx) => {
    const row = await tx.query.passwordResetTokensTable.findFirst({
      where: and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        isNull(passwordResetTokensTable.usedAt),
      ),
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return null;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS);
    const [updatedUser] = await tx
      .update(usersTable)
      // Bumping tokenVersion here too: a password reset is exactly the
      // scenario where an attacker might already hold a valid session
      // (that's plausibly why the legitimate owner is resetting at all).
      .set({ passwordHash, tokenVersion: sql`${usersTable.tokenVersion} + 1` })
      .where(eq(usersTable.id, row.userId))
      .returning();

    await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, row.id));

    return updatedUser ?? null;
  });

  if (!result) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  res.json({
    token: signAuthToken(result.id, result.tokenVersion),
    user: toAuthUser(result),
  });
});

/**
 * Full account export. Everything the server holds for this account, in the
 * same shape the API returns it elsewhere.
 */
router.get("/auth/me/export", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const [sessions, records] = await Promise.all([
    db.query.practiceSessionsTable.findMany({
      where: eq(practiceSessionsTable.userId, userId),
    }),
    db.query.swingRecordsTable.findMany({ where: eq(swingRecordsTable.userId, userId) }),
  ]);

  res.json({
    exportedAt: new Date().toISOString(),
    user: toAuthUser(req.user!),
    sessions: sessions.map((s) => ({
      date: s.date,
      duration: s.durationSeconds,
      swings: s.swings,
    })),
    swingRecords: records.map((r) => ({
      id: r.clientId,
      date: r.date,
      timestamp: r.timestamp.getTime(),
      swingId: r.swingId,
      origin: r.origin,
      golferName: r.golferName,
      gameMode: r.gameMode,
      club: r.club,
      ratio: r.ratio,
      accuracy: r.accuracy,
    })),
  });
});

/**
 * Permanent account deletion. Required by App Store guideline 5.1.1(v) for
 * any app offering account creation, and by the access/erasure rights under
 * the Australian Privacy Act and GDPR.
 *
 * The password is re-checked here rather than trusting the bearer token
 * alone, so a stolen token can't destroy someone's data. practice_sessions
 * and swing_records both cascade off the user row, so one delete is enough.
 */
router.delete("/auth/me", requireAuth, authLimiter, async (req: AuthedRequest, res) => {
  const parsed = DeleteAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Password is required to delete an account." });
    return;
  }

  const matches = await bcrypt.compare(parsed.data.password, req.user!.passwordHash);
  if (!matches) {
    res.status(400).json({ error: "Password is incorrect." });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, req.user!.id));
  res.status(204).end();
});

export default router;
