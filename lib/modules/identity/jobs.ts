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
import { sendEmail } from "@/lib/platform/email";
import { PermanentJobError } from "@/lib/platform/jobs";
import { scoped } from "@/lib/platform/logger";
import { APP_NAME } from "@/lib/platform/constants";
import { buildInviteEmailHtml, buildResetEmailHtml } from "@/lib/email-templates";
import { RESET_TOKEN_TTL_MS } from "./constants";

const log = scoped("identity.password-reset");

export const PASSWORD_RESET_SEND = "identity.password_reset_send";
export { getHrNotificationEmails } from "./hr-recipients";

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
    from: "Basilissa Admin",
    recipientName: name,
    subject: invite ? `Your ${APP_NAME} account` : `Set a new ${APP_NAME} password`,
    template: invite ? "invite" : "password-reset",
    data: invite
      ? {
          inviteUrl: resetUrl,
          inviterName: "Basilissa Admin",
          inviteTo: "the Basilissa Ops team",
          role: "Staff Member",
          expiresIn: `${Math.max(1, Math.round((expiry.getTime() - Date.now()) / 60_000))} minutes`,
        }
      : {
          resetUrl,
          expiresIn: `${Math.max(1, Math.round((expiry.getTime() - Date.now()) / 60_000))} minutes`,
        },
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
