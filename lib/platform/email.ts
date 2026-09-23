import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import { getEnv, isEmailConfigured } from "@/lib/platform/env";
import { scoped } from "@/lib/platform/logger";

const log = scoped("email");

/** Content-ID used for inline logo attachment in transactional emails. */
export const EMAIL_LOGO_CID = "basilissa-logo";

/**
 * Generic transactional email sender. Domain modules own their own templates
 * and recipient lists (see `lib/modules/feedback/notifications.ts`); this file
 * owns only the transport.
 *
 * Never throws, and reports what happened instead. Swallowing the failure was
 * right when this ran inline — an outage at the provider must never fail a
 * customer's submission — but sending now happens on the job queue, where a
 * silent failure means the notification is simply lost while the job records
 * success. The caller decides what a failure is worth; this only reports it.
 */

/** What became of a send. `skipped` is a supported outcome, not a failure. */
export type SendEmailResult =
  | { status: "sent"; id: string | null }
  | { status: "skipped"; reason: "not_configured" | "no_recipients" }
  | { status: "failed"; retryable: boolean; error: unknown };

/**
 * Resend failures a retry can never fix: the request itself is unacceptable
 * and will be equally unacceptable in an hour.
 *
 * Everything absent from this list is treated as retryable, including
 * credentials and rate limits — deliberately, because that is the direction
 * that errs safely. Retrying a hopeless job wastes a few attempts; giving up
 * on a recoverable one loses the message. Bad credentials in particular are
 * worth retrying: a human can correct the environment while attempts remain.
 */
const PERMANENT_RESEND_ERRORS = new Set([
  "missing_required_field",
  "invalid_access",
  "invalid_parameter",
  "invalid_region",
  "validation_error",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "not_found",
  "method_not_allowed",
]);

export type SendEmailInput = {
  to: string[];
  subject: string;
  html: string;
  /** Included in log lines so a failure can be traced back to its source record. */
  context?: Record<string, unknown>;
};

/** Escapes user-supplied values before interpolating them into an HTML template. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Resolves the publicly accessible absolute URL for the Basilissa brand logo
 * to embed in transactional email templates.
 */
export function getEmailLogoUrl(): string {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL}/bsa-logo-icon.png`;
}

/**
 * Returns an email-client safe HTML <img> snippet for the Basilissa brand logo.
 * Uses CID inline embedding so the logo renders reliably across all email clients
 * (including Gmail, Outlook, Apple Mail) even in local development without a public domain.
 */
export function renderEmailLogo(size = 36): string {
  return `<img src="cid:${EMAIL_LOGO_CID}" alt="Basilissa" width="${size}" height="${size}" style="display:block;border-radius:8px;width:${size}px;height:${size}px;" />`;
}

export async function sendEmail({
  to,
  subject,
  html,
  context,
}: SendEmailInput): Promise<SendEmailResult> {
  try {
    // Unconfigured is a supported state, not an error: the app is expected to
    // run without a Resend account, and notifications are a courtesy on top of
    // data that is already saved.
    if (!isEmailConfigured()) {
      log.warn("email is not configured, skipping", { subject, ...context });
      return { status: "skipped", reason: "not_configured" };
    }

    if (to.length === 0) {
      log.warn("no recipients resolved, skipping", context);
      return { status: "skipped", reason: "no_recipients" };
    }

    const env = getEnv();
    const resend = new Resend(env.RESEND_API_KEY!);

    const rawFrom = env.RESEND_FROM_EMAIL!;
    const from = rawFrom.includes("<") ? rawFrom : `Basilissa <${rawFrom}>`;

    // Attach inline logo when referenced via CID in the email HTML
    const attachments = [];
    if (html.includes(`cid:${EMAIL_LOGO_CID}`)) {
      try {
        const logoPath = path.join(process.cwd(), "public", "bsa-logo-icon.png");
        if (fs.existsSync(logoPath)) {
          attachments.push({
            filename: "bsa-logo-icon.png",
            content: fs.readFileSync(logoPath),
            contentType: "image/png",
            inlineContentId: EMAIL_LOGO_CID,
          });
        }
      } catch (err) {
        log.warn("failed to attach inline logo to email", { err });
      }
    }

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(attachments.length > 0 ? { attachments } : {}),
    });

    if (error) {
      const retryable = !PERMANENT_RESEND_ERRORS.has(error.name);
      log.error("provider rejected the message", { subject, error, retryable, ...context });
      return { status: "failed", retryable, error };
    }

    return { status: "sent", id: data?.id ?? null };
  } catch (error) {
    // A thrown error is a network or client fault rather than a verdict on the
    // message, so it is always worth another attempt.
    log.error("failed to send", { subject, error, ...context });
    return { status: "failed", retryable: true, error };
  }
}
