import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

import { logger } from "../lib/logger";

/**
 * Terminal error handler.
 *
 * Without this, Express's default handler renders an HTML error page for a
 * JSON API and includes the stack trace whenever NODE_ENV !== "production" —
 * which made stack-trace exposure depend entirely on one env var being set
 * correctly in the deploy config. This always returns JSON, never leaks
 * internals, and logs the real error against a correlation id the caller
 * can quote.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const errorId = randomUUID();
  logger.error({ err, errorId }, "Unhandled request error");

  res.status(500).json({
    error: "Something went wrong. Quote this id if you report it.",
    errorId,
  });
}

/** 404 for unmatched API routes, so they don't fall through to HTML. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found." });
}
