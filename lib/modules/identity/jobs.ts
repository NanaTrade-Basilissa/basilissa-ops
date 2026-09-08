/**
 * Identity module — background work, and the ONLY identity entry point the
 * worker may import.
 *
 * Deliberately holds nothing request-scoped. `server.ts` re-exports the Data
 * Access Layer, which imports `next/navigation`; in the worker's plain Node
 * process that reaches React's client context and the process dies at startup
 * with `React.createContext is not a function`. Keeping the worker on this
 * file is what stops that recurring.
 */
import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/platform/prisma";
import { getEnv } from "@/lib/platform/env";
import { escapeHtml, sendEmail } from "@/lib/platform/email";
import { PermanentJobError } from "@/lib/platform/jobs";
import { scoped } from "@/lib/platform/logger";
import { APP_NAME } from "@/lib/platform/constants";
import { RESET_TOKEN_TTL_MS } from "./constants";

const log = scoped("identity.password-reset");

export const PASSWORD_RESET_SEND = "identity.password_reset_send";

/**
 * The token travels in the payload, unlike every other job in this codebase,
 * which carries an id and reloads.
 *
 * It has to: only the hash is stored, so there is nothing to reload. The
 * consequence is that a live token sits in the `jobs` table, which is a real
 * exposure — reloading is not an option, so the window is bounded instead. The
 * TTL is an hour, the token is single use, and the worker's periodic sweep
 * deletes these rows once they are past expiry
 * (`purgeExpiredPasswordResets`).
 */
export const passwordResetSendPayload = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  /// Defaulted so jobs enqueued before this field existed still parse.
  purpose: z.enum(["RESET", "INVITE"]).default("RESET"),
  /// Only used by the invite wording, and only a first name at most.
  name: z.string().optional(),
});

function buildInviteEmailHtml(url: string, expiresAt: Date, name?: string): string {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
  const greeting = name ? `Hello ${escapeHtml(name.split(" ")[0]!)},` : "Hello,";

  return `
  <div style="background:#f7f1e8;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#3f3226;">Your ${escapeHtml(APP_NAME)} account</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#3f3226;line-height:1.6;">
        ${greeting} an account has been created for you. Choose a password using the
        link below and you are set up. It works once and expires in about
        ${minutes} minutes.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(url)}"
           style="display:inline-block;background:#8a4b1f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
          Choose a password
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b5c4d;line-height:1.6;">
        If the link has expired by the time you open this, use &ldquo;Forgotten
        password&rdquo; on the sign-in page and one will be sent straight away.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#9b8b7c;word-break:break-all;">
        If the button does not work, paste this into your browser:<br />${escapeHtml(url)}
      </p>
    </div>
  </div>`;
}

function buildResetEmailHtml(resetUrl: string, expiresAt: Date): string {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));

  return `
  <div style="background:#f7f1e8;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#3f3226;">Set a new password</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#3f3226;line-height:1.6;">
        Someone asked to reset the password for your ${escapeHtml(APP_NAME)} account.
        The link below works once and expires in about ${minutes} minutes.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(resetUrl)}"
           style="display:inline-block;background:#8a4b1f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
          Set a new password
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b5c4d;line-height:1.6;">
        If you did not ask for this, you can ignore it. Your password has not changed.
        Nobody can use the link without this email.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#9b8b7c;word-break:break-all;">
        If the button does not work, paste this into your browser:<br />${escapeHtml(resetUrl)}
      </p>
    </div>
  </div>`;
}

export async function handlePasswordResetSend(payload: unknown): Promise<void> {
  const { email, token, expiresAt, purpose, name } = passwordResetSendPayload.parse(payload);

  const resetUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/admin/reset-password?token=${encodeURIComponent(token)}`;
  const expiry = new Date(expiresAt);

  // Already useless by the time it would arrive. Sending it invites someone to
  // click a link that only tells them to start again.
  if (expiry <= new Date()) {
    log.warn("reset link expired before it could be sent, dropping");
    return;
  }

  const invite = purpose === "INVITE";

  const result = await sendEmail({
    to: [email],
    subject: invite ? `Your ${APP_NAME} account` : `Set a new ${APP_NAME} password`,
    html: invite
      ? buildInviteEmailHtml(resetUrl, expiry, name)
      : buildResetEmailHtml(resetUrl, expiry),
    // Deliberately no context: the logger would record it alongside the
    // subject, and a reset token in the logs is the thing this all guards.
  });

  /*
    "Not configured" is a supported outcome for a feedback notification and a
    broken feature here — the person is staring at a page that says a link is
    on its way. Dead-lettering makes that visible as a job needing a human,
    which is the only honest signal available: the queue cannot tell them.
  */
  if (result.status === "skipped") {
    throw new PermanentJobError(
      `${invite ? "Invite" : "Password reset"} email could not be sent: ${result.reason}. ` +
        "Email is not configured, so nobody can be sent a sign-in link.",
    );
  }

  if (result.status === "failed") {
    const detail = result.error instanceof Error ? result.error.message : String(result.error);
    if (!result.retryable) {
      throw new PermanentJobError(`${invite ? "Invite" : "Password reset"} email rejected: ${detail}`);
    }
    throw new Error(`${invite ? "Invite" : "Password reset"} email failed, will retry: ${detail}`);
  }
}

export type ResetPurge = { tokens: number; jobs: number };

/**
 * Removes spent reset material once it can no longer be used.
 *
 * Two places hold a live token. The `password_reset_tokens` row holds its
 * hash, and the queued send job holds the token ITSELF in its payload —
 * unavoidable, because only the hash is stored so there is nothing for the job
 * to reload. That payload outlives the send, so a `jobs` table read months
 * later would otherwise still yield working tokens.
 *
 * Both are worthless past `expiresAt`, so both go. Nothing evidentiary is
 * lost: the audit log separately records that a reset was requested and
 * completed, which is the part anyone comes looking for.
 *
 * Runs on the worker's periodic sweep rather than a timer of its own. This is
 * housekeeping; being a few minutes late costs nothing.
 */
export async function purgeExpiredPasswordResets(now = new Date()): Promise<ResetPurge> {
  const cutoff = new Date(now.getTime() - RESET_TOKEN_TTL_MS);

  const [tokens, jobs] = await Promise.all([
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    }),
    // By age, not by status: a DEAD send job is exactly the one somebody needs
    // to see, but it does not need to keep the token to be useful.
    prisma.job.deleteMany({
      where: { type: PASSWORD_RESET_SEND, createdAt: { lt: cutoff } },
    }),
  ]);

  if (tokens.count > 0 || jobs.count > 0) {
    log.info("purged expired reset material", { tokens: tokens.count, jobs: jobs.count });
  }
  return { tokens: tokens.count, jobs: jobs.count };
}
