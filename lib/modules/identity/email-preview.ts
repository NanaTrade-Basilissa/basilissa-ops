import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { getEnv } from "@/lib/platform/env";
import { buildFeedbackNotificationEmail } from "@/lib/email-templates/feedback";
import { buildInviteEmailHtml, buildResetEmailHtml } from "@/lib/email-templates/identity";
import {
  buildAssessmentInvitationEmailHtml,
  buildAssessmentCompletedEmailHtml,
} from "@/lib/email-templates/assessments";
import {
  buildAptitudeInvitationEmailHtml,
  buildAptitudeCompletedEmailHtml,
} from "@/lib/email-templates/aptitude";
import { buildAnnouncementEmailHtml } from "@/lib/email-templates/announcements";

export type EmailDeliveryRecord = {
  recipient: string;
  sentAt: Date;
  status: "DELIVERED";
};

export type EmailJobInspectionDetail = {
  id: string;
  type: string;
  status: string;
  recipient: string;
  subject: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  htmlPreview: string;
  deliveries: EmailDeliveryRecord[];
  payload: Record<string, unknown>;
};

/**
 * Renders an HTML preview and fetches delivery confirmations for an email job.
 */
export async function getEmailJobInspection(jobId: string): Promise<EmailJobInspectionDetail | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) return null;

  const deliveries = await prisma.emailDelivery.findMany({
    where: { key: jobId },
    orderBy: { sentAt: "desc" },
  });

  const rawPayload = (typeof job.payload === "object" && job.payload !== null ? job.payload : {}) as Record<
    string,
    unknown
  >;

  let htmlPreview = "";
  let subject = `Job ${job.type}`;
  let primaryRecipient = typeof rawPayload.email === "string" ? rawPayload.email : "Unknown";

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;

  try {
    switch (job.type) {
      case "identity.password_reset_send": {
        const email = typeof rawPayload.email === "string" ? rawPayload.email : "";
        const token = typeof rawPayload.token === "string" ? rawPayload.token : "";
        const purpose = rawPayload.purpose === "INVITE" ? "INVITE" : "RESET";
        const name = typeof rawPayload.name === "string" ? rawPayload.name : undefined;
        const expiresAt = typeof rawPayload.expiresAt === "string" ? new Date(rawPayload.expiresAt) : new Date(Date.now() + 3600_000);

        primaryRecipient = email;
        subject = purpose === "INVITE" ? "Your Basilissa account invite" : "Set a new Basilissa password";

        const resetUrl = `${appUrl}/admin/reset-password?token=${encodeURIComponent(token)}`;
        htmlPreview =
          purpose === "INVITE"
            ? buildInviteEmailHtml(resetUrl, expiresAt, name)
            : buildResetEmailHtml(resetUrl, expiresAt);
        break;
      }

      case "aptitude.invitation_send": {
        const email = typeof rawPayload.email === "string" ? rawPayload.email : "";
        const testTitle = typeof rawPayload.testTitle === "string" ? rawPayload.testTitle : "Aptitude Assessment";
        const name = typeof rawPayload.inviteeName === "string" ? rawPayload.inviteeName : "Candidate";
        const token = typeof rawPayload.token === "string" ? rawPayload.token : "";
        const expiresAt = typeof rawPayload.expiresAt === "string" ? new Date(rawPayload.expiresAt) : new Date(Date.now() + 7 * 86400_000);

        primaryRecipient = email;
        subject = `Aptitude Test: ${testTitle} (${name})`;
        const url = `${appUrl}/aptitude/${token}`;
        htmlPreview = buildAptitudeInvitationEmailHtml(url, testTitle, expiresAt, name);
        break;
      }

      case "assessments.invitation_send": {
        const email = typeof rawPayload.email === "string" ? rawPayload.email : "";
        const assessmentTitle = typeof rawPayload.assessmentTitle === "string" ? rawPayload.assessmentTitle : "Assessment";
        const name = typeof rawPayload.inviteeName === "string" ? rawPayload.inviteeName : "Invitee";
        const token = typeof rawPayload.token === "string" ? rawPayload.token : "";
        const expiresAt = typeof rawPayload.expiresAt === "string" ? new Date(rawPayload.expiresAt) : new Date(Date.now() + 7 * 86400_000);

        primaryRecipient = email;
        subject = `Assessment: ${assessmentTitle} (${name})`;
        const url = `${appUrl}/assessment/${token}`;
        htmlPreview = buildAssessmentInvitationEmailHtml(url, assessmentTitle, expiresAt, name);
        break;
      }

      case "aptitude.notify_hr": {
        const attemptId = typeof rawPayload.attemptId === "string" ? rawPayload.attemptId : "";
        subject = `Aptitude Test Completed: ${attemptId}`;
        primaryRecipient = "Configured HR Recipients";

        if (attemptId) {
          const attempt = await prisma.aptitudeAttempt.findUnique({
            where: { id: attemptId },
            include: { invitation: { include: { test: true } } },
          });

          if (attempt) {
            const candidateName = attempt.declaredName || attempt.invitation.candidateName || "Candidate";
            const candidateEmail = attempt.declaredEmail || attempt.invitation.candidateEmail;
            const testTitle = attempt.invitation.test.title;
            const scoredPoints = attempt.scoredPoints ?? 0;
            const maxPoints = attempt.maxPoints ?? 0;
            const percent = maxPoints > 0 ? Math.round((scoredPoints / maxPoints) * 100) : 0;
            const url = `${appUrl}/admin/aptitude-tests/${attempt.invitation.test.id}/attempts/${attempt.id}`;

            subject = `Aptitude Test Completed: ${testTitle} (${candidateName})`;
            htmlPreview = buildAptitudeCompletedEmailHtml({
              url,
              testTitle,
              candidateName,
              candidateEmail,
              submittedAt: attempt.submittedAt ?? new Date(),
              autoSubmitted: attempt.autoSubmitted,
              scoredPoints,
              maxPoints,
              percent,
              passMarkPercent: attempt.invitation.test.passMarkPercent,
            });
          }
        }
        break;
      }

      case "assessments.notify_hr": {
        const responseId = typeof rawPayload.responseId === "string" ? rawPayload.responseId : "";
        subject = `Assessment Response: ${responseId}`;
        primaryRecipient = "Configured HR Recipients";

        if (responseId) {
          const resp = await prisma.assessmentResponse.findUnique({
            where: { id: responseId },
            include: { invitation: { include: { assessment: true } } },
          });

          if (resp) {
            const respondentName = resp.declaredName || resp.invitation?.inviteeName || "Respondent";
            const respondentEmail = resp.declaredEmail || resp.invitation?.inviteeEmail || null;
            const assessmentTitle = resp.invitation?.assessment.title ?? "Assessment";
            const scoredPoints = resp.scoredPoints ?? 0;
            const maxPoints = resp.maxPoints ?? 0;
            const percent = maxPoints > 0 ? Math.round((scoredPoints / maxPoints) * 100) : 0;
            const url = `${appUrl}/admin/assessments/${resp.invitation?.assessment.id}/responses/${resp.id}`;

            subject = `Assessment Completed: ${assessmentTitle} (${respondentName})`;
            htmlPreview = buildAssessmentCompletedEmailHtml({
              url,
              assessmentTitle,
              candidateName: respondentName,
              candidateEmail: respondentEmail,
              submittedAt: resp.submittedAt ?? new Date(),
              scoredPoints,
              maxPoints,
              percent,
              passMarkPercent: resp.invitation?.assessment.passMarkPercent ?? null,
            });
          }
        }
        break;
      }

      case "feedback.notify": {
        const submissionId = typeof rawPayload.submissionId === "string" ? rawPayload.submissionId : "";
        primaryRecipient = "Configured Branch Notification Recipients";
        subject = `New Feedback Submission (${submissionId})`;

        if (submissionId) {
          const submission = await prisma.feedbackSubmission.findUnique({
            where: { id: submissionId },
            include: {
              branch: true,
              answers: {
                include: { question: true },
              },
            },
          });

          if (submission) {
            subject = `New customer feedback for ${submission.branch.name}`;
            htmlPreview = buildFeedbackNotificationEmail(
              {
                submissionId: submission.id,
                branchId: submission.branchId,
                branchName: submission.branch.name,
                submittedAt: submission.submittedAt,
                overallScore: submission.overallScore,
                answers: [...submission.answers]
                  .sort((a, b) => a.question.order - b.question.order)
                  .map((a) => ({
                    questionText: a.question.text,
                    score: a.score,
                    label: a.question.ratingLabels[a.score - 1] ?? "",
                  })),
              },
              `${appUrl}/admin/feedback/${submission.id}`,
            );
          }
        }
        break;
      }

      case "announcements.fanout": {
        const announcementId = typeof rawPayload.announcementId === "string" ? rawPayload.announcementId : "";
        primaryRecipient = "Staff Recipients";
        subject = `Announcement Notification`;

        if (announcementId) {
          const ann = await prisma.announcement.findUnique({ where: { id: announcementId } });
          if (ann) {
            subject = ann.title;
            htmlPreview = buildAnnouncementEmailHtml({
              title: ann.title,
              body: ann.body,
              senderName: "Basilissa Management",
            });
          }
        }
        break;
      }

      default: {
        htmlPreview = `
          <div style="font-family:sans-serif;padding:24px;color:#333;">
            <p><strong>Job Type:</strong> ${job.type}</p>
            <p><strong>Job ID:</strong> ${job.id}</p>
            <p>No dedicated visual email template registered for this job type.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    htmlPreview = `
      <div style="font-family:sans-serif;padding:20px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
        <h3 style="margin-top:0;">Preview generation error</h3>
        <p>${err instanceof Error ? err.message : String(err)}</p>
      </div>
    `;
  }

  if (!htmlPreview) {
    htmlPreview = `
      <div style="font-family:sans-serif;padding:24px;color:#666;text-align:center;">
        <p>No email content preview available for this job.</p>
      </div>
    `;
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    recipient: primaryRecipient,
    subject,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lastError: job.lastError,
    runAt: job.runAt,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    htmlPreview,
    deliveries: deliveries.map((d) => ({
      recipient: d.recipient,
      sentAt: d.sentAt,
      status: "DELIVERED" as const,
    })),
    payload: rawPayload,
  };
}
