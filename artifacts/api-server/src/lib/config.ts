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

/**
 * The web origin reset-password links point at. Falls back to the same
 * Replit dev domain the API and CORS allowlist already assume, since the
 * Expo web build and the API are routed under that one domain.
 */
function resolveAppUrl(): string | null {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  return replitDomain ? `https://${replitDomain}` : null;
}

export const config = {
  jwtSecret: requiredSecret("JWT_SECRET"),
  adminToken: requiredSecret("ADMIN_TOKEN"),
  allowedOrigins: parseAllowedOrigins(),
  isProduction: process.env.NODE_ENV === "production",
  /** JWT issuer/audience — pinned so tokens can't be replayed elsewhere. */
  jwtIssuer: "swingtempo-api",
  jwtAudience: "swingtempo-app",

  /**
   * Email is optional at boot — not every environment (local dev, CI) needs
   * to send mail, and failing the whole server over a missing mail provider
   * would take down signup/login/sync along with it. Routes that need it
   * (forgot-password) check `email.isConfigured` and degrade explicitly
   * instead.
   */
  email: {
    resendApiKey: process.env.RESEND_API_KEY ?? null,
    // onboarding@resend.dev is Resend's shared sandbox sender: it works
    // with zero setup but can only deliver to the email address on the
    // Resend account itself, not to real app users. Set FROM_EMAIL to an
    // address on a verified domain before shipping this to real users.
    fromEmail: process.env.FROM_EMAIL ?? "SwingTempo <onboarding@resend.dev>",
    get isConfigured(): boolean {
      return this.resendApiKey !== null;
    },
  },
  appUrl: resolveAppUrl(),
} as const;
