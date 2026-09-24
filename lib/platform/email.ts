import "server-only";
import { getEnv, isEmailConfigured, DEFAULT_EMAIL_SERVER_URL } from "@/lib/platform/env";
import { scoped } from "@/lib/platform/logger";
import { notifyEmailFailure } from "@/lib/platform/slack";

const log = scoped("email");

/** Public HTTPS URL for hosted Basilissa brand logo served by NanaTradeServer. */
export const HOSTED_EMAIL_LOGO_URL = "https://nana-trade-server.vercel.app/email-assets/logo.png";

/** Content-ID kept for backwards-compatibility with tests. */
export const EMAIL_LOGO_CID = "basilissa-logo";

/** What became of a send. `skipped` is a supported outcome, not a failure. */
export type SendEmailResult =
  | { status: "sent"; id: string | null }
  | { status: "skipped"; reason: "not_configured" | "no_recipients" }
  | { status: "failed"; retryable: boolean; error: unknown };

export type SendEmailInput = {
  to: string[];
  /** Dynamic sender display name, e.g. "Basilissa Spintex", "Basilissa HR", "Basilissa Admin". */
  from?: string;
  /** Recipient name for personalized greeting in built-in templates. */
  recipientName?: string;
  subject?: string;
  template?: "password-reset" | "invite" | "welcome" | "order" | "generic";
  data?: Record<string, unknown>;
  html?: string;
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
 * Resolves the publicly accessible absolute URL for the Basilissa brand logo.
 */
export function getEmailLogoUrl(): string {
  return HOSTED_EMAIL_LOGO_URL;
}

/**
 * Returns an email-client safe HTML <img> snippet for the Basilissa brand logo.
 */
export function renderEmailLogo(size = 36): string {
  return `<img src="${HOSTED_EMAIL_LOGO_URL}" alt="Basilissa" width="${size}" height="${size}" style="display:block;border-radius:8px;width:${size}px;height:${size}px;object-fit:contain;" />`;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, from, recipientName, subject, template, data, html, context } = input;

  try {
    if (!isEmailConfigured()) {
      log.warn("email is not configured, skipping", { subject, ...context });
      return { status: "skipped", reason: "not_configured" };
    }

    if (to.length === 0) {
      log.warn("no recipients resolved, skipping", context);
      return { status: "skipped", reason: "no_recipients" };
    }

    const env = getEnv();
    const endpoint = env.EMAIL_SERVER_URL || DEFAULT_EMAIL_SERVER_URL;

    // Send to each recipient and await confirmation from the Nodemailer backend
    for (const email of to) {
      const payload: Record<string, unknown> = {
        email,
        from: from || "Basilissa",
      };

      if (recipientName) payload.name = recipientName;
      if (subject) payload.subject = subject;
      if (template) {
        payload.template = template;
        if (data) payload.data = data;
      } else if (html) {
        payload.html = html;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const resBody = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
      } | null;

      if (!response.ok || resBody?.success === false) {
        const errorDetail = resBody?.error || `HTTP ${response.status} ${response.statusText}`;
        const retryable = response.status >= 500 || response.status === 429;
        log.error("email server rejected the message", {
          email,
          subject,
          error: errorDetail,
          retryable,
          ...context,
        });

        // Fire-and-forget alert to Slack
        notifyEmailFailure({
          to: email,
          subject,
          from,
          error: errorDetail,
          retryable,
        }).catch(() => {});

        return {
          status: "failed",
          retryable,
          error: new Error(errorDetail),
        };
      }
    }

    return { status: "sent", id: `sent_${Date.now()}` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error("failed to send email via gateway", { subject, error, ...context });

    for (const email of to) {
      notifyEmailFailure({
        to: email,
        subject,
        from,
        error: errorMsg,
        retryable: true,
      }).catch(() => {});
    }

    return { status: "failed", retryable: true, error };
  }
}
