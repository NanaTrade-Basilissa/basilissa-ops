import { HOSTED_EMAIL_LOGO_URL, escapeHtml } from "@/lib/platform/email";

export type ProtocolEmailOptions = {
  previewText?: string;
  heading: string;
  headingSmall?: boolean;
  contentHtml: string;
  buttonText?: string;
  buttonUrl?: string;
  footerNote?: string;
};

export function renderProtocolEmail(options: ProtocolEmailOptions): string {
  const { previewText, heading, headingSmall, contentHtml, buttonText, buttonUrl, footerNote } = options;

  const buttonHtml =
    buttonText && buttonUrl
      ? `<div style="margin-top: 32px; margin-bottom: 8px;">
          <a href="${escapeHtml(buttonUrl)}"
             style="background-color:#FFC107;background-image:linear-gradient(#FFC107,#FFC107);color:#131313;display:inline-block;padding:14px 22px;text-align:center;font-family:'Inter',Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;">
            ${escapeHtml(buttonText)}
          </a>
        </div>`
      : "";

  const noteHtml = footerNote
    ? `<p style="font-family:'Inter',Arial,sans-serif;font-size:11px;color:#71717A;line-height:1.5;margin:12px 0 0 0;">${escapeHtml(footerNote)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="background-color:#F4F4F5;color:#131313;font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.5;margin:0;padding:0;">
  ${previewText ? `<div style="display:none;font-size:1px;color:#F4F4F5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(previewText)}</div>` : ""}
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#F4F4F5;width:100%;margin:0;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background-color:#FFFFFF;margin:0 auto;text-align:left;">
          <!-- Logo Header -->
          <tr>
            <td style="padding:24px 24px 0 24px;">
              <img src="${HOSTED_EMAIL_LOGO_URL}" alt="Basilissa" width="56" height="56" style="display:block;border:0;width:56px;height:56px;object-fit:contain;" />
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding:48px 24px 40px 24px;">
              <h1 style="font-family:'IBM Plex Sans Condensed','Arial Narrow',Arial,sans-serif;font-size:${headingSmall ? "32px" : "40px"};line-height:1;letter-spacing:-1.2px;font-weight:500;color:#131313;text-transform:uppercase;margin:0 0 24px 0;">
                ${escapeHtml(heading)}
              </h1>
              ${contentHtml}
              ${buttonHtml}
            </td>
          </tr>
          <!-- Divider & Footer -->
          <tr>
            <td style="border-top:1px solid #E4E4E7;padding:48px 24px 48px 24px;">
              <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#3F3F46;margin:0 0 12px 0;font-weight:400;">
                Basilissa Restaurant &middot; NanaTrade Group
              </p>
              <p style="font-family:'Inter',Arial,sans-serif;font-size:11px;color:#71717A;line-height:1.5;margin:0;font-weight:400;">
                This is an automated message. Replies to this address aren't monitored. Visit <a href="https://basilissagh.com" style="color:#3F3F46;text-decoration:underline;">basilissagh.com</a> to get in touch.
              </p>
              ${noteHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
