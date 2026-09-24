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
import { sendEmail } from "@/lib/platform/email";
import { PermanentJobError } from "@/lib/platform/jobs";
import { scoped } from "@/lib/platform/logger";
import { DEFAULT_INVITATION_TTL_HOURS, APTITUDE_NOTIFY_HR } from "./constants";
import { finalizeAttempt } from "./finalize";
import { getHrNotificationEmails } from "@/lib/modules/identity/jobs";
import { APP_NAME } from "@/lib/platform/constants";
import {
  buildAptitudeInvitationEmailHtml,
  buildAptitudeCompletedEmailHtml,
} from "@/lib/email-templates";

const log = scoped("aptitude.invitation-send");

export const APTITUDE_INVITATION_SEND = "aptitude.invitation_send";
export { APTITUDE_NOTIFY_HR };

export const aptitudeInvitationSendPayload = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  testTitle: z.string().min(1),
  candidateName: z.string().min(1),
});

export async function handleAptitudeInvitationSend(payload: unknown): Promise<void> {
  const { email, token, expiresAt, testTitle, candidateName } = aptitudeInvitationSendPayload.parse(payload);

  const url = `${getEnv().NEXT_PUBLIC_APP_URL}/aptitude/${encodeURIComponent(token)}`;
  const expiry = new Date(expiresAt);

  if (expiry <= new Date()) {
    log.warn("invitation expired before it could be sent, dropping");
    return;
  }

  const first = candidateName.split(" ")[0]!;
  const deadline = expiry.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  const result = await sendEmail({
    to: [email],
    from: "Basilissa HR",
    recipientName: candidateName,
    subject: `You've been invited to take "${testTitle}"`,
    template: "generic",
    data: {
      heading: `HELLO, ${candidateName.toUpperCase()}`,
      message: `Hello ${first},\n\nYou have been invited to take this aptitude test for ${APP_NAME}. The link below is yours alone and works once.\n\nIt expires on ${deadline}.\n\nGood luck!`,
      buttonText: "Start the test",
      buttonUrl: url,
      from: "Basilissa HR Team",
    },
    html: buildAptitudeInvitationEmailHtml(url, testTitle, expiry, candidateName),
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

export const aptitudeNotifyHrPayload = z.object({
  attemptId: z.string().min(1),
});



export async function handleAptitudeNotifyHr(payload: unknown): Promise<void> {
  const { attemptId } = aptitudeNotifyHrPayload.parse(payload);

  const attempt = await prisma.aptitudeAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      submittedAt: true,
      autoSubmitted: true,
      declaredName: true,
      declaredEmail: true,
      scoredPoints: true,
      maxPoints: true,
      invitation: {
        select: {
          id: true,
          candidateName: true,
          candidateEmail: true,
          test: {
            select: {
              id: true,
              title: true,
              passMarkPercent: true,
              createdBy: true,
            },
          },
        },
      },
    },
  });

  if (!attempt) {
    scoped("aptitude.notify_hr").warn("attempt no longer exists, skipping", { attemptId });
    return;
  }

  const candidateName = attempt.declaredName || attempt.invitation.candidateName || "Candidate";
  const candidateEmail = attempt.declaredEmail || attempt.invitation.candidateEmail || null;
  const testTitle = attempt.invitation.test.title;
  const scoredPoints = attempt.scoredPoints ?? 0;
  const maxPoints = attempt.maxPoints ?? 0;
  const percent = maxPoints > 0 ? Math.round((scoredPoints / maxPoints) * 100) : 0;
  const submittedAt = attempt.submittedAt ?? new Date();
  const url = `${getEnv().NEXT_PUBLIC_APP_URL}/admin/aptitude-tests/${attempt.invitation.test.id}/attempts/${attempt.id}`;

  const hrEmails = await getHrNotificationEmails(attempt.invitation.test.createdBy);
  if (hrEmails.length === 0) {
    scoped("aptitude.notify_hr").warn("no HR recipients found, skipping", { attemptId });
    return;
  }

  const result = await sendEmail({
    to: hrEmails,
    from: "Basilissa Aptitude",
    subject: `Aptitude Test Completed: ${testTitle} (${candidateName})`,
    html: buildAptitudeCompletedEmailHtml({
      url,
      testTitle,
      candidateName,
      candidateEmail,
      submittedAt,
      autoSubmitted: attempt.autoSubmitted,
      scoredPoints,
      maxPoints,
      percent,
      passMarkPercent: attempt.invitation.test.passMarkPercent,
    }),
    context: { attemptId, testId: attempt.invitation.test.id },
  });

  if (result.status === "failed") {
    const detail = result.error instanceof Error ? result.error.message : String(result.error);
    if (!result.retryable) {
      throw new PermanentJobError(`Aptitude HR notification rejected: ${detail}`, result.error);
    }
    throw new Error(`Aptitude HR notification failed, will retry: ${detail}`);
  }
}

