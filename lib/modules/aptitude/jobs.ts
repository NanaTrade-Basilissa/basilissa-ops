/**
 * Aptitude module — background work, and the ONLY aptitude entry point the
 * worker may import. Deliberately holds nothing request-scoped, for the same
 * reason `lib/modules/assessments/jobs.ts` does: the worker runs as a plain
 * Node process, and `server.ts` re-exports code that reaches
 * `next/navigation`.
 */
import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/platform/prisma";
import { getEnv } from "@/lib/platform/env";
import { escapeHtml, sendEmail } from "@/lib/platform/email";
import { PermanentJobError } from "@/lib/platform/jobs";
import { scoped } from "@/lib/platform/logger";
import { APP_NAME } from "@/lib/platform/constants";
import { DEFAULT_INVITATION_TTL_HOURS } from "./constants";
import { finalizeAttempt } from "./finalize";

const log = scoped("aptitude.invitation-send");

export const APTITUDE_INVITATION_SEND = "aptitude.invitation_send";

export const aptitudeInvitationSendPayload = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  testTitle: z.string().min(1),
  candidateName: z.string().min(1),
});

function buildInvitationEmailHtml(url: string, testTitle: string, expiresAt: Date, name: string): string {
  const first = name.split(" ")[0]!;
  const deadline = expiresAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  return `
  <div style="background:#f7f1e8;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#3f3226;">${escapeHtml(testTitle)}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#3f3226;line-height:1.6;">
        Hello ${escapeHtml(first)}, you have been invited to take this aptitude test for
        ${escapeHtml(APP_NAME)}. The link below is yours alone and works once. It
        expires ${escapeHtml(deadline)}.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(url)}"
           style="display:inline-block;background:#8a4b1f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
          Start the test
        </a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#9b8b7c;word-break:break-all;">
        If the button does not work, paste this into your browser:<br />${escapeHtml(url)}
      </p>
    </div>
  </div>`;
}

export async function handleAptitudeInvitationSend(payload: unknown): Promise<void> {
  const { email, token, expiresAt, testTitle, candidateName } = aptitudeInvitationSendPayload.parse(payload);

  const url = `${getEnv().NEXT_PUBLIC_APP_URL}/aptitude/${encodeURIComponent(token)}`;
  const expiry = new Date(expiresAt);

  if (expiry <= new Date()) {
    log.warn("invitation expired before it could be sent, dropping");
    return;
  }

  const result = await sendEmail({
    to: [email],
    subject: `You've been invited to take "${testTitle}"`,
    html: buildInvitationEmailHtml(url, testTitle, expiry, candidateName),
  });

  if (result.status === "skipped") {
    throw new PermanentJobError(
      `Invitation email for "${testTitle}" could not be sent: ${result.reason}. ` +
        "Email is not configured, so nobody was sent a link.",
    );
  }

  if (result.status === "failed") {
    const detail = result.error instanceof Error ? result.error.message : String(result.error);
    if (!result.retryable) {
      throw new PermanentJobError(`Invitation email for "${testTitle}" rejected: ${detail}`);
    }
    throw new Error(`Invitation email for "${testTitle}" failed, will retry: ${detail}`);
  }
}

export type InvitationSendPurge = { succeeded: number; dead: number };

/** Same two-exit reasoning as Assessments' `purgeSentInvitationJobs`. */
export async function purgeSentInvitationJobs(now = new Date()): Promise<InvitationSendPurge> {
  const cutoff = new Date(now.getTime() - DEFAULT_INVITATION_TTL_HOURS * 3_600_000);

  const [succeeded, dead] = await Promise.all([
    prisma.job.deleteMany({ where: { type: APTITUDE_INVITATION_SEND, status: "SUCCEEDED" } }),
    prisma.job.deleteMany({ where: { type: APTITUDE_INVITATION_SEND, status: "DEAD", createdAt: { lt: cutoff } } }),
  ]);

  if (succeeded.count > 0 || dead.count > 0) {
    log.info("purged invitation-send jobs", { succeeded: succeeded.count, dead: dead.count });
  }
  return { succeeded: succeeded.count, dead: dead.count };
}

const sweepLog = scoped("aptitude.auto-submit-sweep");

export type AutoSubmitSweepSummary = { examined: number; submitted: number };

/**
 * The worker backstop for a candidate who simply closed the tab:
 * `loadForTaking` already force-submits opportunistically when the
 * candidate reopens an expired link, but nothing reopens it for someone who
 * never comes back. Not a queued job — see `runPeriodic()` in
 * `worker/index.ts` for why time-driven work stays out of the job queue.
 */
export async function autoSubmitExpiredAttempts(now: Date = new Date(), limit = 200): Promise<AutoSubmitSweepSummary> {
  const expired = await prisma.aptitudeAttempt.findMany({
    where: { submittedAt: null, deadlineAt: { not: null, lt: now } },
    take: limit,
    select: { id: true },
  });

  let submitted = 0;
  for (const { id } of expired) {
    const result = await finalizeAttempt(id);
    if (result.ok && !result.alreadyDone) submitted += 1;
  }

  if (expired.length > 0) {
    sweepLog.info("auto-submit sweep", { examined: expired.length, submitted });
  }
  return { examined: expired.length, submitted };
}
