import { Resend } from "resend";

import { config } from "./config";
import { logger } from "./logger";

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!config.email.isConfigured) return null;
  if (!client) client = new Resend(config.email.resendApiKey!);
  return client;
}

/**
 * Sends the password-reset email. Returns true if Resend accepted the send,
 * false if email isn't configured or the send failed — callers treat both
 * as "couldn't send" without distinguishing why, since the forgot-password
 * endpoint's response is generic either way (see routes/auth.ts).
 *
 * IMPORTANT — sandbox sender limitation: until FROM_EMAIL is set to an
 * address on a verified Resend domain, config.email.fromEmail defaults to
 * Resend's shared onboarding@resend.dev sender, which can only deliver to
 * the email address on the Resend account itself. In that state this
 * function works for testing (send yourself a reset email) but silently
 * cannot reach real users — Resend accepts the API call and the send still
 * fails asynchronously. Verify a domain and set FROM_EMAIL before relying on
 * this for real accounts.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    logger.warn("Password reset requested but RESEND_API_KEY is not configured — no email sent.");
    return false;
  }

  const { error } = await resend.emails.send({
    from: config.email.fromEmail,
    to: toEmail,
    subject: "Reset your SwingTempo password",
    text:
      `Reset your SwingTempo password by opening this link:\n\n${resetUrl}\n\n` +
      `This link expires in 30 minutes and can only be used once. ` +
      `If you didn't request this, you can ignore this email — your password hasn't changed.`,
    html: renderResetEmailHtml(resetUrl),
  });

  if (error) {
    logger.error({ err: error }, "Resend rejected the password-reset email");
    return false;
  }
  return true;
}

function renderResetEmailHtml(resetUrl: string): string {
  const escapedUrl = escapeHtml(resetUrl);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#000000;font-family:-apple-system,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:420px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 24px 24px;">
                <p style="color:#ffffff;font-size:20px;font-weight:700;margin:0;">SwingTempo</p>
              </td>
            </tr>
            <tr>
              <td style="background:#0d0d0d;border:1px solid #1a1a1a;border-radius:14px;padding:28px 24px;">
                <p style="color:#ffffff;font-size:16px;font-weight:600;margin:0 0 12px;">Reset your password</p>
                <p style="color:#888888;font-size:14px;line-height:1.6;margin:0 0 20px;">
                  Tap the button below to choose a new password. This link expires in 30 minutes
                  and can only be used once.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#1A8CFF;border-radius:10px;">
                      <a href="${escapedUrl}"
                         style="display:inline-block;padding:12px 24px;color:#ffffff;
                                font-size:14px;font-weight:700;text-decoration:none;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="color:#444444;font-size:12px;line-height:1.6;margin:20px 0 0;">
                  If you didn't request this, you can ignore this email — your password hasn't changed.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
