import { escapeHtml } from "@/lib/platform/email";
import { APP_NAME } from "@/lib/platform/constants";
import { renderProtocolEmail } from "./layout";

export function buildInviteEmailHtml(url: string, expiresAt: Date, name?: string): string {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
  const greeting = name ? `Hello ${escapeHtml(name.split(" ")[0]!)},` : "Hello,";

  const contentHtml = `
    <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 16px 0;">
      ${greeting} an account has been created for you on ${escapeHtml(APP_NAME)}. Choose a password using the link below to get set up.
    </p>
    <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 16px 0;">
      It works once and expires in about ${minutes} minutes.
    </p>
  `;

  return renderProtocolEmail({
    previewText: `Your ${APP_NAME} account invitation`,
    heading: name ? `HELLO, ${name.split(" ")[0]!.toUpperCase()}` : "YOUR ACCOUNT",
    contentHtml,
    buttonText: "Choose a password",
    buttonUrl: url,
    footerNote: `If the button does not work, visit: ${url}`,
  });
}

export function buildResetEmailHtml(resetUrl: string, expiresAt: Date): string {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));

  const contentHtml = `
    <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 16px 0;">
      Someone asked to reset the password for your ${escapeHtml(APP_NAME)} account. The link below works once and expires in about ${minutes} minutes.
    </p>
    <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 16px 0;">
      If you did not ask for this, you can ignore this email. Your password has not changed.
    </p>
  `;

  return renderProtocolEmail({
    previewText: `Reset your ${APP_NAME} password`,
    heading: "SET A NEW PASSWORD",
    contentHtml,
    buttonText: "Set a new password",
    buttonUrl: resetUrl,
    footerNote: `If the button does not work, visit: ${resetUrl}`,
  });
}
