import { escapeHtml } from "@/lib/platform/email";
import { formatAccraDateTime } from "@/lib/platform/date";
import { renderProtocolEmail } from "./layout";

export type NotificationAnswer = { questionText: string; score: number; label: string };

export type FeedbackNotificationPayload = {
  submissionId: string;
  branchId: string;
  branchName: string;
  submittedAt: Date;
  overallScore: number;
  answers: NotificationAnswer[];
};

export function buildFeedbackNotificationEmail(
  payload: FeedbackNotificationPayload,
  dashboardUrl: string,
): string {
  const rows = payload.answers
    .map(
      (a) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #E4E4E7;font-family:'Inter',Arial,sans-serif;font-size:14px;color:#131313;vertical-align:top;line-height:1.5;">
            ${escapeHtml(a.questionText)}
          </td>
          <td align="right" style="padding:14px 0 14px 16px;border-bottom:1px solid #E4E4E7;font-family:'Inter',Arial,sans-serif;font-size:14px;white-space:nowrap;vertical-align:top;line-height:1.5;">
            <span style="color:#71717A;margin-right:8px;font-size:13px;">${escapeHtml(a.label)}</span>
            <span style="font-weight:700;color:#131313;background:#F4F4F5;padding:3px 8px;border-radius:4px;font-size:13px;">${a.score}/5</span>
          </td>
        </tr>`,
    )
    .join("");

  const formattedDate = formatAccraDateTime(payload.submittedAt);

  const contentHtml = `
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#71717A;padding-bottom:4px;">Branch</td>
        <td align="right" style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#71717A;padding-bottom:4px;">Submitted</td>
      </tr>
      <tr>
        <td style="font-family:'Inter',Arial,sans-serif;font-size:16px;font-weight:600;color:#131313;">${escapeHtml(payload.branchName)}</td>
        <td align="right" style="font-family:'Inter',Arial,sans-serif;font-size:14px;color:#3F3F46;">${escapeHtml(formattedDate)}</td>
      </tr>
    </table>

    <div style="margin: 28px 0; padding: 18px 20px; background-color: #FAFAFA; border: 1px solid #E4E4E7; border-left: 4px solid #FFC107;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:'Inter',Arial,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#71717A;font-weight:600;">Overall score</td>
          <td align="right" style="font-family:'IBM Plex Sans Condensed','Arial Narrow',Arial,sans-serif;font-size:32px;font-weight:500;color:#131313;line-height:1;">
            ${payload.overallScore.toFixed(1)} <span style="font-family:'Inter',Arial,sans-serif;font-size:14px;color:#71717A;font-weight:400;">/ 5.0</span>
          </td>
        </tr>
      </table>
    </div>

    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
      ${rows}
    </table>
  `;

  return renderProtocolEmail({
    previewText: `New feedback for ${payload.branchName}: ${payload.overallScore.toFixed(1)}/5`,
    heading: "NEW CUSTOMER FEEDBACK",
    contentHtml,
    buttonText: "View in admin dashboard",
    buttonUrl: dashboardUrl,
    footerNote: `Submission ID: ${payload.submissionId}`,
  });
}
