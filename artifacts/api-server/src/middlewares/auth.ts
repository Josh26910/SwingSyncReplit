import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { db, type User, usersTable } from "@workspace/db";

import { config } from "../lib/config";

export interface AuthedRequest extends Request {
  user?: User;
}

const JWT_ALGORITHM = "HS256" as const;

interface AuthTokenPayload {
  sub: string;
  /** Must match users.tokenVersion, otherwise the token has been revoked. */
  ver: number;
}

/**
 * Signs a 30-day access token carrying the account's current token version.
 * Bumping users.tokenVersion (see the password-change route) invalidates
 * every token issued before it — that's what makes these JWTs revocable
 * without a server-side session table.
 */
export function signAuthToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, ver: tokenVersion }, config.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: "30d",
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
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
    // Pin the algorithm and issuer/audience rather than accepting whatever
    // the token claims. Not exploitable today with an HMAC-only setup, but
    // it means a future move to asymmetric keys can't silently reopen the
    // classic alg-confusion hole.
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: [JWT_ALGORITHM],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }) as Partial<AuthTokenPayload>;

    if (typeof payload.sub !== "string" || typeof payload.ver !== "number") {
      res.status(401).json({ error: "Invalid token." });
      return;
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, payload.sub),
    });
    if (!user) {
      res.status(401).json({ error: "Invalid token." });
      return;
    }

    if (user.tokenVersion !== payload.ver) {
      res.status(401).json({ error: "Session expired. Please sign in again." });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * Constant-time string comparison. `===` on secrets leaks their contents
 * through response timing, one byte at a time.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on length mismatch, and comparing lengths first
  // leaks only the length — which is not the secret itself.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Gates the tempo-videos admin endpoints behind a single shared secret
 * (ADMIN_TOKEN) rather than full user-role auth — there's exactly one
 * operator managing this content, not a multi-admin system worth building
 * out RBAC for. ADMIN_TOKEN is validated at boot (lib/config.ts), so a
 * missing one fails the process rather than the request.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const provided = req.headers["x-admin-token"];
  if (typeof provided !== "string" || !secretsMatch(provided, config.adminToken)) {
    res.status(401).json({ error: "Invalid admin token." });
    return;
  }
  next();
}
