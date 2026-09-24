import "server-only";
import { createHash } from "node:crypto";
import { getEnv, isEmailConfigured, DEFAULT_EMAIL_SERVER_URL } from "@/lib/platform/env";
import { scoped } from "@/lib/platform/logger";
import { prisma } from "@/lib/platform/prisma";
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
  | { status: "failed"; retryable: boolean; error: unknown; failedRecipients?: string[] };

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
  /**
   * Makes the send safe to repeat: recipients who already received it under
   * this key are skipped, each copy gets a stable Message-ID, and the subject
   * gets a stable reference. Queued mail gets it from `emailOptionsForJob`.
   * Must not contain a secret; it is stored and hashed into headers.
   */
  idempotencyKey?: string;
  /**
   * Asks the gateway to look for this copy's Message-ID in the sender's Sent
   * folder first, and skip it if found. Covers the one case the delivery
   * records cannot: an attempt that timed out here but was delivered anyway.
   * Costs the gateway an IMAP lookup (~3s), so only retries ask for it.
   * Needs `idempotencyKey`.
   */
  skipIfAlreadySent?: boolean;
};

export type JobEmailOptions = Pick<SendEmailInput, "idempotencyKey" | "skipIfAlreadySent">;

/**
 * The idempotency options for mail sent by a queued job. The key is the job id,
 * which is stable across its retries and never a secret (unlike, say, a reset
 * token in the payload). No job, as when a handler is called directly: no key.
 */
export function emailOptionsForJob(job?: { jobId: string; retrying: boolean }): JobEmailOptions {
  if (!job) return {};
  return { idempotencyKey: `job:${job.jobId}`, ...(job.retrying ? { skipIfAlreadySent: true } : {}) };
}

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

/**
 * How long to wait for the gateway. It runs on Vercel, where a cold start plus
 * the Gmail SMTP handshake has been measured past 15s. Abandoning a request
 * does not cancel it: the gateway went on to deliver both "timed out" attempts
 * of a password reset on 24 Sep 2026, and the retries sent duplicates. So this
 * is generous, and `skipIfAlreadySent` covers the case it still does not.
 */
export const EMAIL_GATEWAY_TIMEOUT_MS = 45_000;

/** Domain for generated Message-IDs; matches the address the gateway sends from. */
const MESSAGE_ID_DOMAIN = "basilissagh.com";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * A short reference appended to the subject, stable for a given key.
 *
 * Gmail threads messages that share a subject, so two separate invitations to
 * the same test landed in one conversation and the second looked like it never
 * arrived. A per-send reference keeps them apart. Derived from the key rather
 * than random so a retry carries the same subject as the attempt it repeats.
 */
export function subjectReference(key: string): string {
  return sha256(`subject\n${key}`).slice(0, 6).toUpperCase();
}

/**
 * The RFC 5322 Message-ID for one recipient's copy, stable for a given key.
 *
 * Stable so a retry can ask the gateway whether this exact copy is already in
 * the Sent folder (`skipIfAlreadySent`). Not a deduplication by itself: Gmail
 * delivered both copies of a repeated Message-ID when tested on 24 Sep 2026.
 * Hashed, so the key never appears in a header.
 */
export function messageIdFor(key: string, recipient: string): string {
  return `<${sha256(`message\n${key}\n${recipient}`).slice(0, 40)}@${MESSAGE_ID_DOMAIN}>`;
}

type RecipientFailure = { email: string; retryable: boolean; error: unknown };

/**
 * Sends one message to each recipient, one gateway request per recipient.
 *
 * Never throws. Every recipient is attempted even after one fails: a bad
 * address used to stop the loop, so everyone after it waited on retries of a
 * message that could never go.
 *
 * With an `idempotencyKey`, recipients who already received this message are
 * skipped, which is what makes the send safe to retry. Without one, every call
 * sends to everyone.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { from, recipientName, template, data, html, context, idempotencyKey, skipIfAlreadySent } = input;
  const to = Array.from(new Set(input.to.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  const subject =
    input.subject && idempotencyKey ? `${input.subject} · #${subjectReference(idempotencyKey)}` : input.subject;

  if (!isEmailConfigured()) {
    log.warn("email is not configured, skipping", { subject, ...context });
    return { status: "skipped", reason: "not_configured" };
  }

  if (to.length === 0) {
    log.warn("no recipients resolved, skipping", context);
    return { status: "skipped", reason: "no_recipients" };
  }

  const endpoint = getEnv().EMAIL_SERVER_URL || DEFAULT_EMAIL_SERVER_URL;

  let pending = to;
  if (idempotencyKey) {
    try {
      const delivered = await prisma.emailDelivery.findMany({
        where: { key: idempotencyKey, recipient: { in: to } },
        select: { recipient: true },
      });
      const done = new Set(delivered.map((row) => row.recipient));
      pending = to.filter((email) => !done.has(email));
    } catch (error) {
      // Better a possible duplicate than a message never sent.
      log.error("could not read delivery records, sending to everyone", { error, ...context });
    }
    if (pending.length === 0) {
      log.info("every recipient already has this message, nothing to send", { subject, ...context });
      return { status: "sent", id: idempotencyKey };
    }
  }

  const failures: RecipientFailure[] = [];

  for (const email of pending) {
    const failure = await sendOne(endpoint, {
      email,
      from: from || "Basilissa",
      ...(recipientName ? { name: recipientName } : {}),
      ...(subject ? { subject } : {}),
      ...(template ? { template, ...(data ? { data } : {}) } : html ? { html } : {}),
      ...(idempotencyKey ? { messageId: messageIdFor(idempotencyKey, email) } : {}),
      ...(idempotencyKey && skipIfAlreadySent ? { skipIfSent: true } : {}),
    });

    if (failure) {
      failures.push(failure);
      log.error("email was not sent", {
        email,
        subject,
        error: failure.error instanceof Error ? failure.error.message : String(failure.error),
        retryable: failure.retryable,
        ...context,
      });
      notifyEmailFailure({
        to: email,
        subject,
        from,
        error: failure.error instanceof Error ? failure.error.message : String(failure.error),
        retryable: failure.retryable,
      }).catch(() => {});
      continue;
    }

    if (idempotencyKey) {
      try {
        await prisma.emailDelivery.upsert({
          where: { key_recipient: { key: idempotencyKey, recipient: email } },
          create: { key: idempotencyKey, recipient: email },
          update: {},
        });
      } catch (error) {
        // The message went out; failing to record it only risks a duplicate
        // on a retry, which the gateway's Sent-folder check then catches.
        log.error("sent, but could not record the delivery", { error, ...context });
      }
    }
  }

  if (failures.length === 0) {
    return { status: "sent", id: idempotencyKey ?? `sent_${Date.now()}` };
  }

  const detail = failures
    .map((f) => `${f.email}: ${f.error instanceof Error ? f.error.message : String(f.error)}`)
    .join("; ");
  const delivered = to.length - failures.length;
  return {
    status: "failed",
    // Worth another attempt if any recipient might yet succeed. Recipients
    // rejected for good fail again on that retry, which is the honest outcome:
    // the job dies naming them once the attempts run out.
    retryable: failures.some((f) => f.retryable),
    error: new Error(
      failures.length === to.length ? detail : `${delivered} of ${to.length} sent; failed: ${detail}`,
    ),
    failedRecipients: failures.map((f) => f.email),
  };
}

/** One gateway request. Returns the failure, or null when the gateway accepted it. */
async function sendOne(endpoint: string, payload: Record<string, unknown>): Promise<RecipientFailure | null> {
  const email = payload.email as string;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMAIL_GATEWAY_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const resBody = (await response.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
    } | null;

    if (response.ok && resBody?.success !== false) return null;

    return {
      email,
      // 5xx and 429 are the gateway or Gmail being unavailable. A 4xx, which
      // includes the 422 the gateway returns for a permanent SMTP rejection,
      // will fail the same way every time.
      retryable: response.status >= 500 || response.status === 429,
      error: new Error(resBody?.error || `HTTP ${response.status} ${response.statusText}`),
    };
  } catch (error) {
    const timedOut = controller.signal.aborted;
    return {
      email,
      retryable: true,
      error: timedOut
        ? new Error(`no response from the email gateway within ${EMAIL_GATEWAY_TIMEOUT_MS / 1000}s`)
        : error,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Deletes delivery records no retry can still need. A job's retries span hours
 * at most; a week leaves room for a person to retry a dead job from the email
 * queue, which reuses the job and so the key.
 */
export async function purgeOldEmailDeliveries(now = new Date(), maxAgeMs = 7 * 24 * 3_600_000): Promise<number> {
  const { count } = await prisma.emailDelivery.deleteMany({
    where: { sentAt: { lt: new Date(now.getTime() - maxAgeMs) } },
  });
  return count;
}
