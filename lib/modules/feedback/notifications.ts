import "server-only";
import { getEnv, getNotificationEmails } from "@/lib/platform/env";
import { escapeHtml, sendEmail, type SendEmailResult } from "@/lib/platform/email";
import { formatAccraDateTime } from "@/lib/platform/date";

export type NotificationAnswer = { questionText: string; score: number; label: string };

export type FeedbackNotificationPayload = {
  submissionId: string;
  branchId: string;
  branchName: string;
  submittedAt: Date;
  overallScore: number;
  answers: NotificationAnswer[];
};

function buildEmailHtml(payload: FeedbackNotificationPayload, dashboardUrl: string): string {
  const rows = payload.answers
    .map(
      (a) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#3f3226;font-size:14px;">${escapeHtml(a.questionText)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#8a4b1f;font-weight:600;font-size:14px;white-space:nowrap;">${a.score}/5 &middot; ${escapeHtml(a.label)}</td>
        </tr>`,
    )
    .join("");

  return `
  <div style="background:#f7f1e8;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eee0cc;">
      <tr>
        <td style="background:#7a2e1d;padding:24px 28px;">
          <span style="color:#f7e6c9;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Basilissa Ghana</span>
          <h1 style="color:#ffffff;font-size:20px;margin:6px 0 0;">New customer feedback</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px 8px;">
          <table role="presentation" width="100%">
            <tr>
              <td style="color:#8a7a63;font-size:13px;padding-bottom:4px;">Branch</td>
              <td style="color:#8a7a63;font-size:13px;padding-bottom:4px;text-align:right;">Submitted</td>
            </tr>
            <tr>
              <td style="color:#3f3226;font-size:16px;font-weight:700;">${escapeHtml(payload.branchName)}</td>
              <td style="color:#3f3226;font-size:14px;text-align:right;">${escapeHtml(formatAccraDateTime(payload.submittedAt))}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;">
          <div style="background:#fbeedd;border-radius:10px;padding:16px 20px;display:flex;align-items:baseline;justify-content:space-between;">
            <span style="color:#7a2e1d;font-size:14px;font-weight:600;">Overall score</span>
            <span style="color:#7a2e1d;font-size:26px;font-weight:800;">${payload.overallScore.toFixed(1)}<span style="font-size:14px;font-weight:600;">/5</span></span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 8px;">
          <table role="presentation" width="100%" style="border-collapse:collapse;">
            ${rows}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px 28px;">
          <a href="${dashboardUrl}" style="display:inline-block;background:#7a2e1d;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">View in admin dashboard</a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <p style="color:#a8987f;font-size:12px;line-height:1.5;margin:0;">This is an automated notification from the Basilissa customer feedback system. Submission ID: ${escapeHtml(payload.submissionId)}.</p>
        </td>
      </tr>
    </table>
  </div>`;
}

/**
 * Sends the feedback notification to every configured recipient.
 *
 * Never throws, and returns what happened. The submission is already saved by
 * the time this runs, so a failure is not the customer's problem — but it is
 * somebody's, and the job that called this needs to know whether another
 * attempt is worth making.
 */
export async function sendFeedbackNotification(
  payload: FeedbackNotificationPayload,
): Promise<SendEmailResult> {
  const dashboardUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/admin/branches/${payload.branchId}#submission-${payload.submissionId}`;

  return sendEmail({
    to: getNotificationEmails(),
    subject: `New feedback: ${payload.branchName} (${payload.overallScore.toFixed(1)}/5)`,
    html: buildEmailHtml(payload, dashboardUrl),
    context: { submissionId: payload.submissionId },
  });
}
