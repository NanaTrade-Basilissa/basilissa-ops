import { escapeHtml } from "@/lib/platform/email";
import { APP_NAME } from "@/lib/platform/constants";
import { renderProtocolEmail } from "./layout";

export function buildAptitudeInvitationEmailHtml(
  url: string,
  testTitle: string,
  expiresAt: Date,
  name: string,
): string {
  const first = name.split(" ")[0]!;
  const deadline = expiresAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  const contentHtml = `
    <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 16px 0;">
      Hello ${escapeHtml(first)}, you have been invited to take this aptitude test for ${escapeHtml(APP_NAME)}. The link below is yours alone and works once.
    </p>
    <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 16px 0;">
      It expires on ${escapeHtml(deadline)}.
    </p>
  `;

  return renderProtocolEmail({
    previewText: `You've been invited to take "${testTitle}"`,
    heading: `HELLO, ${first.toUpperCase()}`,
    contentHtml,
    buttonText: "Start the test",
    buttonUrl: url,
    footerNote: `If the button does not work, visit: ${url}`,
  });
}

export type AptitudeCompletedEmailParams = {
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
};

export function buildAptitudeCompletedEmailHtml(params: AptitudeCompletedEmailParams): string {
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

  const contentHtml = `
    <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 24px 0;">
      A candidate has completed an aptitude test on ${escapeHtml(APP_NAME)}.
    </p>

    <div style="margin: 24px 0 32px 0; padding: 18px 20px; background-color: #FAFAFA; border: 1px solid #E4E4E7; border-left: 4px solid #FFC107;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:'Inter',Arial,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#71717A;font-weight:600;">Score</td>
          <td align="right" style="font-family:'IBM Plex Sans Condensed','Arial Narrow',Arial,sans-serif;font-size:32px;font-weight:500;color:#131313;line-height:1;">
            ${params.scoredPoints} / ${params.maxPoints} (${params.percent}%)
          </td>
        </tr>
      </table>
    </div>

    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;font-size:14px;color:#131313;">
      <tr style="border-bottom:1px solid #E4E4E7;">
        <td style="padding:10px 0;color:#71717A;width:140px;">Candidate</td>
        <td style="padding:10px 0;font-weight:600;">
          ${escapeHtml(params.candidateName)}
          ${params.candidateEmail ? `<span style="font-weight:normal;color:#71717A;">(${escapeHtml(params.candidateEmail)})</span>` : ""}
        </td>
      </tr>
      <tr style="border-bottom:1px solid #E4E4E7;">
        <td style="padding:10px 0;color:#71717A;">Submitted at</td>
        <td style="padding:10px 0;">${escapeHtml(formattedDate)}</td>
      </tr>
      <tr style="border-bottom:1px solid #E4E4E7;">
        <td style="padding:10px 0;color:#71717A;">Submission status</td>
        <td style="padding:10px 0;">${escapeHtml(submissionModeLabel)}</td>
      </tr>
      ${
        passStatus
          ? `
      <tr style="border-bottom:1px solid #E4E4E7;">
        <td style="padding:10px 0;color:#71717A;">Outcome</td>
        <td style="padding:10px 0;">${passStatus}</td>
      </tr>`
          : ""
      }
    </table>
  `;

  return renderProtocolEmail({
    previewText: `${params.candidateName} completed ${params.testTitle}: ${params.percent}%`,
    heading: params.testTitle,
    contentHtml,
    buttonText: "Review attempt in Admin",
    buttonUrl: params.url,
  });
}
