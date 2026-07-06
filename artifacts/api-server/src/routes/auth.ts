import { GetCurrentUserResponse, LoginBody, SignupBody } from "@workspace/api-zod";
import { db, type User, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { type AuthedRequest, requireAuth, signAuthToken } from "../middlewares/auth";

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

export default router;
