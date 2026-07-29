import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { db, type User, usersTable } from "@workspace/db";

export interface AuthedRequest extends Request {
  user?: User;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET must be set. Did you forget to configure it?");
  }
  return secret;
}

export function signAuthToken(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: "30d" });
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string };
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, payload.sub),
    });
    if (!user) {
      res.status(401).json({ error: "Invalid token." });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * Gates the tempo-videos admin endpoints behind a single shared secret
 * (ADMIN_TOKEN) rather than full user-role auth — there's exactly one
 * operator managing this content, not a multi-admin system worth building
 * out RBAC for.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    throw new Error("ADMIN_TOKEN must be set. Did you forget to configure it?");
  }
  const provided = req.headers["x-admin-token"];
  if (provided !== expected) {
    res.status(401).json({ error: "Invalid admin token." });
    return;
  }
  next();
}
