import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request } from "express";

/**
 * Rate limiters.
 *
 * The auth limiter matters most: bcrypt at cost 12 burns ~300ms of CPU per
 * attempt on a single-threaded process, so an unthrottled login endpoint is
 * both a credential-brute-force target and a trivial CPU-exhaustion DoS.
 * It's keyed on IP *and* submitted email so one attacker can't lock out a
 * whole NAT'd office by spraying, and spraying many emails from one IP is
 * still caught by the IP half.
 */

const json = (message: string): Partial<Options> => ({
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: message },
});

/** Normalises an email for use in a rate-limit key. */
function emailKey(req: Request): string {
  const body: unknown = req.body;
  const email =
    body && typeof body === "object" && typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email.toLowerCase().trim()
      : "";
  return email.slice(0, 254);
}

/** Credential endpoints: deliberately strict. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // ipKeyGenerator normalises IPv6 into a /64 subnet so an attacker with a
  // v6 range can't trivially rotate addresses to reset the counter.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${emailKey(req)}`,
  ...json("Too many attempts. Try again in a few minutes."),
});

/** Account creation: slower still — each call writes a row. */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  ...json("Too many accounts created from this address. Try again later."),
});

/**
 * Sync is the most expensive endpoint in the app (bulk upsert + full read
 * back). The client only syncs once a minute, so 30/5min is generous for
 * legitimate use even across several devices on one connection.
 */
export const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  ...json("Sync rate limit reached. Your local data is safe — try again shortly."),
});

/** Admin mutations: the shared secret has unlimited lifetime, so cap guesses. */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  ...json("Too many admin requests."),
});

/** Backstop for everything else, including the public tempo-videos list. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  ...json("Too many requests."),
});
