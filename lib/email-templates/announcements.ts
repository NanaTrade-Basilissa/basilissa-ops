import { escapeHtml } from "@/lib/platform/email";
import { renderProtocolEmail } from "./layout";

/** An announcement sent by email. The body keeps its line breaks. */
export function buildAnnouncementEmailHtml(input: { title: string; body: string; recipientName?: string; senderName: string }): string {
  const greeting = input.recipientName ? `Hello ${escapeHtml(input.recipientName)},` : "Hello,";
  const paragraphs = escapeHtml(input.body)
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 16px 0;">${block.replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  return renderProtocolEmail({
    previewText: input.title,
    heading: input.title.toUpperCase().slice(0, 80),
    headingSmall: true,
    contentHtml: `<p style="font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3F3F46;margin:0 0 16px 0;">${greeting}</p>${paragraphs}`,
    footerNote: `Sent by ${escapeHtml(input.senderName)}. You can also read this in the Basilissa Staff app.`,
  });
}
