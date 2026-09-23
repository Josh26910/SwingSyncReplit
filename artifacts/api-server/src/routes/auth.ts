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
import { db, passwordResetCodesTable, type User, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { type AuthedRequest, requireAuth, signAuthToken } from "../middlewares/auth";

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

const router: IRouter = Router();

function toAuthUser(user: User) {
  return GetCurrentUserResponse.parse({
    id: user.id,
    email: user.email,
    name: user.name,
  });
}

router.post("/auth/signup", async (req, res) => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid signup payload." });
    return;
  }
  const email = parsed.data.email.toLowerCase();

  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });
  if (existing) {
    res.status(400).json({ error: "An account with that email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const [created] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name: parsed.data.name ?? null })
    .returning();

  if (!created) {
    res.status(500).json({ error: "Failed to create account." });
    return;
  }

  res.status(201).json({
    token: signAuthToken(created.id),
    user: toAuthUser(created),
  });
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login payload." });
    return;
  }
  const email = parsed.data.email.toLowerCase();

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  res.json({
    token: signAuthToken(user.id),
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

router.patch("/auth/password", requireAuth, async (req: AuthedRequest, res) => {
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

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  res.json(toAuthUser(updated!));
});

// App Store guideline 5.1.1(v) / Google Play account-deletion policy: any app
// with account creation must let users delete the account from inside the app.
// practice_sessions and swing_records rows go with it via ON DELETE CASCADE.
router.delete("/auth/me", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = DeleteAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid delete-account payload." });
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

function hashResetCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

function resetCodeEmail(code: string) {
  const text =
    `Your 3to1 Golf password reset code is ${code}\n\n` +
    `It expires in 15 minutes. If you didn't ask to reset your password, you can ignore this email.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
  <p style="font-size:15px;margin:0 0 16px">Your 3to1 Golf password reset code:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${code}</p>
  <p style="font-size:13px;color:#555;margin:0">It expires in 15 minutes. If you didn't ask to reset your password, you can ignore this email.</p>
</div>`;
  return { subject: `${code} is your 3to1 Golf reset code`, text, html };
}

// Responds identically whether or not the email has an account, so this
// can't be used to find out who's registered. Re-requests inside the cooldown
// are silently ignored (same response) for the same reason.
router.post("/auth/forgot-password", async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const genericResponse = { message: "If an account exists for that email, we've sent a 6-digit code." };

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, parsed.data.email.toLowerCase()),
  });
  if (!user) {
    res.json(genericResponse);
    return;
  }

  const latest = await db.query.passwordResetCodesTable.findFirst({
    where: eq(passwordResetCodesTable.userId, user.id),
    orderBy: desc(passwordResetCodesTable.createdAt),
  });
  if (latest && Date.now() - latest.createdAt.getTime() < RESET_RESEND_COOLDOWN_MS) {
    res.json(genericResponse);
    return;
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db.delete(passwordResetCodesTable).where(eq(passwordResetCodesTable.userId, user.id));
  await db.insert(passwordResetCodesTable).values({
    userId: user.id,
    codeHash: hashResetCode(user.id, code),
    expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
  });

  try {
    await sendEmail({ to: user.email, ...resetCodeEmail(code) });
  } catch (err) {
    logger.error({ err }, "Failed to send password reset email");
    // Drop the unsent code so the cooldown doesn't block an immediate retry.
    await db.delete(passwordResetCodesTable).where(eq(passwordResetCodesTable.userId, user.id));
    res.status(500).json({ error: "Couldn't send the email right now. Please try again shortly." });
    return;
  }

  res.json(genericResponse);
});

router.post("/auth/reset-password", async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the 6-digit code and a new password of at least 8 characters." });
    return;
  }
  const expired = "That code has expired. Request a new one.";

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, parsed.data.email.toLowerCase()),
  });
  const record = user
    ? await db.query.passwordResetCodesTable.findFirst({
        where: eq(passwordResetCodesTable.userId, user.id),
        orderBy: desc(passwordResetCodesTable.createdAt),
      })
    : undefined;
  if (!user || !record || record.expiresAt.getTime() < Date.now() || record.attempts >= RESET_MAX_ATTEMPTS) {
    res.status(400).json({ error: expired });
    return;
  }

  const expected = Buffer.from(record.codeHash, "hex");
  const actual = Buffer.from(hashResetCode(user.id, parsed.data.code), "hex");
  if (!timingSafeEqual(expected, actual)) {
    const attempts = record.attempts + 1;
    await db
      .update(passwordResetCodesTable)
      .set({ attempts })
      .where(eq(passwordResetCodesTable.id, record.id));
    res.status(400).json({
      error: attempts >= RESET_MAX_ATTEMPTS ? "Too many wrong attempts. Request a new code." : "That code is incorrect.",
    });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, user.id))
    .returning();
  await db.delete(passwordResetCodesTable).where(eq(passwordResetCodesTable.userId, user.id));

  res.json({ token: signAuthToken(updated!.id), user: toAuthUser(updated!) });
});

export default router;
