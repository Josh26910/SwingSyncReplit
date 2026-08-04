import {
  ChangePasswordBody,
  DeleteAccountBody,
  GetCurrentUserResponse,
  LoginBody,
  SignupBody,
  UpdateProfileBody,
} from "@workspace/api-zod";
import {
  db,
  practiceSessionsTable,
  swingRecordsTable,
  type User,
  usersTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { type AuthedRequest, requireAuth, signAuthToken } from "../middlewares/auth";
import { authLimiter, signupLimiter } from "../middlewares/rateLimit";

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
