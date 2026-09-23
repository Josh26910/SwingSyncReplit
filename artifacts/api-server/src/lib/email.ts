import { logger } from "./logger";

/**
 * Transactional email via Resend's HTTP API (plain fetch — no SDK dependency).
 *
 * Env:
 *   RESEND_API_KEY — required to actually send. Without it, emails are logged
 *                    instead (dev only; in production we log that sending was
 *                    skipped but never the body, since it contains reset codes).
 *   EMAIL_FROM     — sender, e.g. "3to1 Golf <noreply@3to1golf.com>". Must be on
 *                    a domain verified in Resend. Defaults to Resend's shared
 *                    test sender, which can only deliver to the Resend account
 *                    owner's own address.
 */
const DEFAULT_FROM = "3to1 Golf <onboarding@resend.dev>";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      logger.error({ to: email.to, subject: email.subject }, "RESEND_API_KEY not set — email not sent");
    } else {
      logger.warn({ to: email.to, subject: email.subject, text: email.text }, "RESEND_API_KEY not set — logging email instead of sending");
    }
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body.slice(0, 300)}`);
  }
}
