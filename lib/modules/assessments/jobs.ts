/**
 * Assessments module — background work, and the ONLY assessments entry point
 * the worker may import.
 *
 * Deliberately holds nothing request-scoped, for the same reason
 * `lib/modules/identity/jobs.ts` does: the worker runs as a plain Node
 * process, and `server.ts` re-exports code that reaches `next/navigation`.
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
import { getHrNotificationEmails } from "@/lib/modules/identity/hr-recipients";

const log = scoped("assessments.invitation-send");

export const ASSESSMENT_INVITATION_SEND = "assessments.invitation_send";
export const ASSESSMENT_NOTIFY_HR = "assessments.notify_hr";

/**
 * The token travels in the payload, as it does for password resets, and for
 * the same reason: only its hash is stored, so there is nothing else to
 * reload it from.
 *
 * The exposure window is worse here, though. A reset token lives an hour; an
 * invitation lives a week by default (`invitationTtlHours`), so a raw token
 * left sitting in `jobs` would too — see `purgeSentInvitationJobs` below,
 * which is what actually bounds it.
 */
export const assessmentInvitationSendPayload = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  assessmentTitle: z.string().min(1),
  inviteeName: z.string().min(1),
});

function buildInvitationEmailHtml(url: string, assessmentTitle: string, expiresAt: Date, name: string): string {
  const first = name.split(" ")[0]!;
  const deadline = expiresAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  return `
  <div style="background:#f7f1e8;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#3f3226;">${escapeHtml(assessmentTitle)}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#3f3226;line-height:1.6;">
        Hello ${escapeHtml(first)}, you have been invited to take this assessment for
        ${escapeHtml(APP_NAME)}. The link below is yours alone and works once. It
        expires ${escapeHtml(deadline)}.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(url)}"
           style="display:inline-block;background:#8a4b1f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
          Start the assessment
        </a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#9b8b7c;word-break:break-all;">
        If the button does not work, paste this into your browser:<br />${escapeHtml(url)}
      </p>
    </div>
  </div>`;
}

export async function handleAssessmentInvitationSend(payload: unknown): Promise<void> {
  const { email, token, expiresAt, assessmentTitle, inviteeName } =
    assessmentInvitationSendPayload.parse(payload);

  const url = `${getEnv().NEXT_PUBLIC_APP_URL}/assessment/${encodeURIComponent(token)}`;
  const expiry = new Date(expiresAt);

  // Already useless by the time it would arrive. Sending it invites someone to
  // click a link that only tells them it is gone.
  if (expiry <= new Date()) {
    log.warn("invitation expired before it could be sent, dropping");
    return;
  }

  const result = await sendEmail({
    to: [email],
    subject: `You've been invited to take "${assessmentTitle}"`,
    html: buildInvitationEmailHtml(url, assessmentTitle, expiry, inviteeName),
    // Deliberately no context: the logger would record it alongside the
    // subject, and a live token in the logs is the thing this guards against.
  });

  /*
    "Not configured" is a supported outcome when HR is still relying on the
    copy-the-link fallback for everyone else, but a broken one for THIS
    invitation specifically — it was enqueued because an address was on file,
    so somebody is now expecting an email that will never come. Dead-lettering
    it, named to the assessment, is the only honest signal: the queue cannot
    tell HR on its own.
  */
  if (result.status === "skipped") {
    throw new PermanentJobError(
      `Invitation email for "${assessmentTitle}" could not be sent: ${result.reason}. ` +
        "Email is not configured, so nobody was sent a link.",
    );
  }

  if (result.status === "failed") {
    const detail = result.error instanceof Error ? result.error.message : String(result.error);
    if (!result.retryable) {
      throw new PermanentJobError(`Invitation email for "${assessmentTitle}" rejected: ${detail}`);
    }
    throw new Error(`Invitation email for "${assessmentTitle}" failed, will retry: ${detail}`);
  }
}

export type InvitationSendPurge = { succeeded: number; dead: number };

/**
 * Bounds how long a raw token sits in `jobs`.
 *
 * Two exits, at different ages, because a SUCCEEDED and a DEAD job mean
 * different things. A SUCCEEDED one has done its job — the email is out, the
 * token in its payload is now redundant with the one already on its way to an
 * inbox — so it is swept at any age, typically within one periodic tick. A
 * DEAD one is exactly the row a human needs to see, so it is kept until the
 * invitation itself would have expired anyway; deleting it sooner would hide
 * the failure before anyone could act on it.
 *
 * This is deliberately tighter than `purgeExpiredPasswordResets`, which keeps
 * every row — sent or not — for the token's full lifetime. That is fine for a
 * one-hour reset token; it would leave a raw invitation token live for a full
 * week here, which is the gap this closes.
 */
export async function purgeSentInvitationJobs(now = new Date()): Promise<InvitationSendPurge> {
  const cutoff = new Date(now.getTime() - DEFAULT_INVITATION_TTL_HOURS * 3_600_000);

  const [succeeded, dead] = await Promise.all([
    prisma.job.deleteMany({
      where: { type: ASSESSMENT_INVITATION_SEND, status: "SUCCEEDED" },
    }),
    prisma.job.deleteMany({
      where: { type: ASSESSMENT_INVITATION_SEND, status: "DEAD", createdAt: { lt: cutoff } },
    }),
  ]);

  if (succeeded.count > 0 || dead.count > 0) {
    log.info("purged invitation-send jobs", { succeeded: succeeded.count, dead: dead.count });
  }
  return { succeeded: succeeded.count, dead: dead.count };
}

export const assessmentNotifyHrPayload = z.object({
  responseId: z.string().min(1),
});

function buildAssessmentCompletedEmailHtml(params: {
  url: string;
  assessmentTitle: string;
  candidateName: string;
  candidateEmail: string | null;
  submittedAt: Date;
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

  return `
  <div style="background:#f7f1e8;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="border-bottom:1px solid #eee;padding-bottom:16px;margin-bottom:20px;">
        <span style="display:inline-block;padding:4px 8px;background:#eef2ff;color:#3730a3;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
          Assessment Completed
        </span>
        <h1 style="margin:12px 0 0;font-size:20px;color:#3f3226;">${escapeHtml(params.assessmentTitle)}</h1>
      </div>

      <p style="margin:0 0 16px;font-size:15px;color:#3f3226;line-height:1.6;">
        A candidate has completed an assessment on ${escapeHtml(APP_NAME)}.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;color:#3f3226;">
        <tr style="border-bottom:1px solid #f0ece7;">
          <td style="padding:8px 0;color:#786c5e;width:140px;">Candidate</td>
          <td style="padding:8px 0;font-weight:600;">
            ${escapeHtml(params.candidateName)}
            ${params.candidateEmail ? `<span style="font-weight:normal;color:#786c5e;">(${escapeHtml(params.candidateEmail)})</span>` : ""}
          </td>
        </tr>
        <tr style="border-bottom:1px solid #f0ece7;">
          <td style="padding:8px 0;color:#786c5e;">Submitted at</td>
          <td style="padding:8px 0;">${escapeHtml(formattedDate)}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0ece7;">
          <td style="padding:8px 0;color:#786c5e;">Score</td>
          <td style="padding:8px 0;font-weight:600;font-size:16px;color:#8a4b1f;">
            ${params.scoredPoints} / ${params.maxPoints} (${params.percent}%)
          </td>
        </tr>
        ${
          passStatus
            ? `
        <tr style="border-bottom:1px solid #f0ece7;">
          <td style="padding:8px 0;color:#786c5e;">Outcome</td>
          <td style="padding:8px 0;">${passStatus}</td>
        </tr>`
            : ""
        }
      </table>

      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(params.url)}"
           style="display:inline-block;background:#8a4b1f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
          Review full response in Admin
        </a>
      </p>

      <p style="margin:16px 0 0;font-size:12px;color:#9b8b7c;word-break:break-all;">
        Or copy and paste this link:<br />${escapeHtml(params.url)}
      </p>
    </div>
  </div>`;
}

export async function handleAssessmentNotifyHr(payload: unknown): Promise<void> {
  const { responseId } = assessmentNotifyHrPayload.parse(payload);

  const response = await prisma.assessmentResponse.findUnique({
    where: { id: responseId },
    select: {
      id: true,
      submittedAt: true,
      declaredName: true,
      declaredEmail: true,
      scoredPoints: true,
      maxPoints: true,
      invitation: {
        select: {
          id: true,
          inviteeName: true,
          inviteeEmail: true,
          assessment: {
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

  if (!response) {
    scoped("assessments.notify_hr").warn("response no longer exists, skipping", { responseId });
    return;
  }

  const candidateName = response.declaredName || response.invitation.inviteeName || "Candidate";
  const candidateEmail = response.declaredEmail || response.invitation.inviteeEmail || null;
  const assessmentTitle = response.invitation.assessment.title;
  const scoredPoints = response.scoredPoints ?? 0;
  const maxPoints = response.maxPoints ?? 0;
  const percent = maxPoints > 0 ? Math.round((scoredPoints / maxPoints) * 100) : 0;
  const submittedAt = response.submittedAt ?? new Date();
  const url = `${getEnv().NEXT_PUBLIC_APP_URL}/admin/assessments/${response.invitation.assessment.id}/responses/${response.id}`;

  const hrEmails = await getHrNotificationEmails(response.invitation.assessment.createdBy);
  if (hrEmails.length === 0) {
    scoped("assessments.notify_hr").warn("no HR recipients found, skipping", { responseId });
    return;
  }

  const result = await sendEmail({
    to: hrEmails,
    subject: `Assessment Completed: ${assessmentTitle} (${candidateName})`,
    html: buildAssessmentCompletedEmailHtml({
      url,
      assessmentTitle,
      candidateName,
      candidateEmail,
      submittedAt,
      scoredPoints,
      maxPoints,
      percent,
      passMarkPercent: response.invitation.assessment.passMarkPercent,
    }),
    context: { responseId, assessmentId: response.invitation.assessment.id },
  });

  if (result.status === "failed") {
    const detail = result.error instanceof Error ? result.error.message : String(result.error);
    if (!result.retryable) {
      throw new PermanentJobError(`Assessment HR notification rejected: ${detail}`, result.error);
    }
    throw new Error(`Assessment HR notification failed, will retry: ${detail}`);
  }
}

