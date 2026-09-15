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
import { DEFAULT_INVITATION_TTL_HOURS, APTITUDE_NOTIFY_HR } from "./constants";
import { finalizeAttempt } from "./finalize";
import { getHrNotificationEmails } from "@/lib/modules/identity/hr-recipients";

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

function buildInvitationEmailHtml(url: string, testTitle: string, expiresAt: Date, name: string): string {
  const first = name.split(" ")[0]!;
  const deadline = expiresAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  return `
  <div style="background:#F8F9FA;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #E4E4E7;border-top:4px solid #EFCE02;">
      <div style="margin-bottom:16px;">
        <span style="display:inline-block;padding:4px 10px;background:#FEFCE8;color:#854D0E;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">
          Basilissa Aptitude Test
        </span>
      </div>
      <h1 style="margin:0 0 16px;font-size:20px;color:#18181B;font-weight:700;">${escapeHtml(testTitle)}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#3F3F46;line-height:1.6;">
        Hello ${escapeHtml(first)}, you have been invited to take this aptitude test for
        ${escapeHtml(APP_NAME)}. The link below is yours alone and works once. It
        expires ${escapeHtml(deadline)}.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(url)}"
           style="display:inline-block;background:#EFCE02;color:#18181B;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:15px;">
          Start the test
        </a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#A1A1AA;word-break:break-all;">
        If the button does not work, paste this into your browser:<br /><a href="${escapeHtml(url)}" style="color:#0284C7;text-decoration:underline;">${escapeHtml(url)}</a>
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

export const aptitudeNotifyHrPayload = z.object({
  attemptId: z.string().min(1),
});

function buildAptitudeCompletedEmailHtml(params: {
  url: string;
  testTitle: string;
  candidateName: string;
  candidateEmail: string | null;
  submittedAt: Date;
  autoSubmitted: boolean;
  scoredPoints: number;
  maxPoints: number;
  percent: number;
  passMarkPercent: number | null;
}): string {
  const formattedDate = params.submittedAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const passStatus =
    params.passMarkPercent !== null
      ? params.percent >= params.passMarkPercent
        ? `<span style="color:#166534;font-weight:600;">Passed (Pass mark: ${params.passMarkPercent}%)</span>`
        : `<span style="color:#991b1b;font-weight:600;">Did not pass (Pass mark: ${params.passMarkPercent}%)</span>`
      : null;

  const submissionModeLabel = params.autoSubmitted
    ? "Auto-submitted (time limit expired)"
    : "Submitted by candidate";

  return `
  <div style="background:#F8F9FA;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #E4E4E7;border-top:4px solid #EFCE02;">
      <div style="border-bottom:1px solid #F4F4F5;padding-bottom:16px;margin-bottom:20px;">
        <span style="display:inline-block;padding:4px 10px;background:#FEFCE8;color:#854D0E;border-radius:6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
          Aptitude Test Completed
        </span>
        <h1 style="margin:12px 0 0;font-size:20px;color:#18181B;font-weight:700;">${escapeHtml(params.testTitle)}</h1>
      </div>

      <p style="margin:0 0 16px;font-size:15px;color:#3F3F46;line-height:1.6;">
        A candidate has completed an aptitude test on ${escapeHtml(APP_NAME)}.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;color:#18181B;">
        <tr style="border-bottom:1px solid #F4F4F5;">
          <td style="padding:8px 0;color:#71717A;width:140px;">Candidate</td>
          <td style="padding:8px 0;font-weight:600;">
            ${escapeHtml(params.candidateName)}
            ${params.candidateEmail ? `<span style="font-weight:normal;color:#71717A;">(${escapeHtml(params.candidateEmail)})</span>` : ""}
          </td>
        </tr>
        <tr style="border-bottom:1px solid #F4F4F5;">
          <td style="padding:8px 0;color:#71717A;">Submitted at</td>
          <td style="padding:8px 0;">${escapeHtml(formattedDate)}</td>
        </tr>
        <tr style="border-bottom:1px solid #F4F4F5;">
          <td style="padding:8px 0;color:#71717A;">Submission status</td>
          <td style="padding:8px 0;">${escapeHtml(submissionModeLabel)}</td>
        </tr>
        <tr style="border-bottom:1px solid #F4F4F5;">
          <td style="padding:8px 0;color:#71717A;">Score</td>
          <td style="padding:8px 0;font-weight:700;font-size:16px;color:#0284C7;">
            ${params.scoredPoints} / ${params.maxPoints} (${params.percent}%)
          </td>
        </tr>
        ${
          passStatus
            ? `
        <tr style="border-bottom:1px solid #F4F4F5;">
          <td style="padding:8px 0;color:#71717A;">Outcome</td>
          <td style="padding:8px 0;">${passStatus}</td>
        </tr>`
            : ""
        }
      </table>

      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(params.url)}"
           style="display:inline-block;background:#EFCE02;color:#18181B;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:15px;">
          Review attempt in Admin
        </a>
      </p>

      <p style="margin:16px 0 0;font-size:12px;color:#A1A1AA;word-break:break-all;">
        Or copy and paste this link:<br /><a href="${escapeHtml(params.url)}" style="color:#0284C7;text-decoration:underline;">${escapeHtml(params.url)}</a>
      </p>
    </div>
  </div>`;
}

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

