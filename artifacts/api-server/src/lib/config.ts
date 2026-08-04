/**
 * Single place where every environment variable is read and validated.
 *
 * This module is imported at the top of the process, so a missing or weak
 * secret crashes the server at boot with a clear message rather than
 * surfacing as a 500 the first time somebody happens to hit an admin route
 * (which is what used to happen with ADMIN_TOKEN).
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set. Did you forget to configure it?`);
  }
  return value;
}

function requiredSecret(name: string, minLength = 32): string {
  const value = required(name);
  if (value.length < minLength) {
    throw new Error(
      `${name} must be at least ${minLength} characters. ` +
        `Generate one with: openssl rand -base64 48`,
    );
  }
  return value;
}

/**
 * Origins allowed to call this API from a browser. Native builds don't send
 * an Origin header at all, so restricting this costs mobile nothing — it
 * only stops arbitrary websites from using a visitor's browser to hammer
 * the API or brute-force the admin token.
 *
 * Comma-separated. Defaults to the Replit dev domain the Expo web build is
 * served from, which is the same origin the API is routed under.
 */
function parseAllowedOrigins(): string[] {
  const explicit = process.env.CORS_ALLOWED_ORIGINS;
  if (explicit) {
    return explicit
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  return replitDomain ? [`https://${replitDomain}`] : [];
}

export const config = {
  jwtSecret: requiredSecret("JWT_SECRET"),
  adminToken: requiredSecret("ADMIN_TOKEN"),
  allowedOrigins: parseAllowedOrigins(),
  isProduction: process.env.NODE_ENV === "production",
  /** JWT issuer/audience — pinned so tokens can't be replayed elsewhere. */
  jwtIssuer: "swingtempo-api",
  jwtAudience: "swingtempo-app",
} as const;
