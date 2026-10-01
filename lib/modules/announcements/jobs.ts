import "server-only";
import { z } from "zod";
import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { PermanentJobError } from "@/lib/platform/jobs";
import { parseDeviceMetadata, sendEmployeePushNotification, sendPushNotification } from "@/lib/platform/push";
import { sendEmail } from "@/lib/platform/email";
import { sendSms } from "@/lib/platform/sms";
import { buildAnnouncementEmailHtml } from "@/lib/email-templates/announcements";
import { PUSH_BODY_PREVIEW_MAX, ackReminderDue, isUsablePhone, smsText } from "./constants";

/**
 * Background work owned by the announcements module. Registered with the worker
 * in `worker/registry.ts`, which imports THIS file and never `server.ts`.
 */

export const ANNOUNCEMENT_FANOUT = "announcements.fanout";

export const announcementFanoutPayload = z.object({ announcementId: z.string().min(1) });

/** Tokens per provider call, and recipients per database round trip. */
const CHUNK_SIZE = 100;

export function pushBodyPreview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= PUSH_BODY_PREVIEW_MAX ? flat : `${flat.slice(0, PUSH_BODY_PREVIEW_MAX - 1).trimEnd()}…`;
}

export type FanoutSummary = { sent: number; failed: number; unreachable: number };

/**
 * Sends an announcement's push notifications.
 *
 * SAFE TO RUN TWICE. It only touches recipients still `PENDING`, and records
 * each chunk's outcome before moving on, so a retry after a crash resumes where
 * it stopped. The one window is a crash between the provider accepting a chunk
 * and the outcome being written, which can re-send that single chunk; that is the
 * at-least-once behaviour every queue has, and a duplicate push is harmless
 * because the inbox row underneath is unique.
 *
 * The push carries the announcement id and a short preview, never the full text:
 * a lock screen is not private. The full message is in the inbox.
 */
export async function fanoutAnnouncementPush(payload: unknown): Promise<FanoutSummary> {
  const { announcementId } = announcementFanoutPayload.parse(payload);
  const log = scoped("announcements.fanout");

  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { id: true, title: true, body: true, sendPush: true },
  });
  // No number of retries brings it back.
  if (!announcement) throw new PermanentJobError(`announcement ${announcementId} no longer exists`);
  if (!announcement.sendPush) return { sent: 0, failed: 0, unreachable: 0 };

  const summary: FanoutSummary = { sent: 0, failed: 0, unreachable: 0 };

  for (;;) {
    const pending = await prisma.announcementRecipient.findMany({
      where: { announcementId, pushStatus: "PENDING" },
      orderBy: { employeeId: "asc" },
      take: CHUNK_SIZE,
      select: { id: true, employeeId: true },
    });
    if (pending.length === 0) break;

    const identities = await prisma.employeeDeviceIdentity.findMany({
      where: {
        employeeId: { in: pending.map((row) => row.employeeId) },
        providerType: ProviderType.MOBILE_APP,
        revokedAt: null,
      },
      select: { employeeId: true, label: true },
    });

    const tokensByEmployee = new Map<string, string[]>();
    for (const identity of identities) {
      const token = parseDeviceMetadata(identity.label).pushToken;
      if (!token) continue;
      tokensByEmployee.set(identity.employeeId, [...(tokensByEmployee.get(identity.employeeId) ?? []), token]);
    }

    const allTokens = [...new Set([...tokensByEmployee.values()].flat())];
    const receipts = allTokens.length
      ? await sendPushNotification(allTokens, {
          title: announcement.title,
          body: pushBodyPreview(announcement.body),
          data: { type: "ANNOUNCEMENT", announcementId },
        })
      : [];
    const receiptByToken = new Map(receipts.map((receipt) => [receipt.token, receipt]));

    const now = new Date();
    const unreachableIds: string[] = [];
    const sentIds: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const row of pending) {
      const tokens = tokensByEmployee.get(row.employeeId) ?? [];
      if (tokens.length === 0) {
        unreachableIds.push(row.id);
        continue;
      }
      const results = tokens.map((token) => receiptByToken.get(token));
      // Any one device accepting it counts: the person was reached.
      if (results.some((result) => result?.ok)) sentIds.push(row.id);
      else failed.push({ id: row.id, error: results.find((result) => result?.error)?.error ?? "Not accepted by the push provider" });
    }

    if (unreachableIds.length) {
      await prisma.announcementRecipient.updateMany({
        where: { id: { in: unreachableIds } },
        data: { pushStatus: "UNREACHABLE" },
      });
    }
    if (sentIds.length) {
      await prisma.announcementRecipient.updateMany({
        where: { id: { in: sentIds } },
        data: { pushStatus: "SENT", pushSentAt: now, pushError: null },
      });
    }
    for (const failure of failed) {
      await prisma.announcementRecipient.update({
        where: { id: failure.id },
        data: { pushStatus: "FAILED", pushError: failure.error.slice(0, 300) },
      });
    }

    summary.sent += sentIds.length;
    summary.failed += failed.length;
    summary.unreachable += unreachableIds.length;
  }

  log.info("announcement push fan-out finished", { announcementId, ...summary });
  return summary;
}

const SIMPLE_CHUNK = 50;

export type ChannelSummary = { sent: number; failed: number; unreachable: number };

/**
 * Texts an announcement. Same shape as the push fan-out: only recipients still
 * `PENDING`, each outcome recorded before moving on, so a retry resumes. A person
 * with no usable number is `UNREACHABLE`, not failed. SMS costs money, which is why
 * sending refuses an audience over the limit (see `MAX_SMS_RECIPIENTS`) and why
 * this never sends to a recipient it has already recorded as sent.
 */
export async function fanoutAnnouncementSms(payload: unknown): Promise<ChannelSummary> {
  const { announcementId } = announcementFanoutPayload.parse(payload);
  const summary: ChannelSummary = { sent: 0, failed: 0, unreachable: 0 };
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { title: true, body: true, sendSms: true },
  });
  if (!announcement) throw new PermanentJobError(`announcement ${announcementId} no longer exists`);
  if (!announcement.sendSms) return summary;
  const message = smsText(announcement.title, announcement.body);

  for (;;) {
    const pending = await prisma.announcementRecipient.findMany({
      where: { announcementId, smsStatus: "PENDING" },
      orderBy: { employeeId: "asc" },
      take: SIMPLE_CHUNK,
      select: { id: true, employee: { select: { phone: true, firstName: true } } },
    });
    if (pending.length === 0) break;

    for (const row of pending) {
      if (!isUsablePhone(row.employee.phone)) {
        await prisma.announcementRecipient.update({ where: { id: row.id }, data: { smsStatus: "UNREACHABLE" } });
        summary.unreachable++;
        continue;
      }
      let outcome: { ok: boolean; error?: string };
      try {
        outcome = await sendSms({
          recipient: row.employee.phone!,
          message,
          name: row.employee.firstName,
          subject: announcement.title,
        });
      } catch (error) {
        outcome = { ok: false, error: error instanceof Error ? error.message : "SMS_ERROR" };
      }
      await prisma.announcementRecipient.update({
        where: { id: row.id },
        data: outcome.ok
          ? { smsStatus: "SENT", smsSentAt: new Date(), smsError: null }
          : { smsStatus: "FAILED", smsError: (outcome.error ?? "Not accepted by the SMS gateway").slice(0, 300) },
      });
      if (outcome.ok) summary.sent++;
      else summary.failed++;
    }
  }
  return summary;
}

/** Emails an announcement, one message each, with an idempotency key so a retry never double-sends. */
export async function fanoutAnnouncementEmail(payload: unknown): Promise<ChannelSummary> {
  const { announcementId } = announcementFanoutPayload.parse(payload);
  const summary: ChannelSummary = { sent: 0, failed: 0, unreachable: 0 };
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { title: true, body: true, sendEmail: true, createdByName: true },
  });
  if (!announcement) throw new PermanentJobError(`announcement ${announcementId} no longer exists`);
  if (!announcement.sendEmail) return summary;

  for (;;) {
    const pending = await prisma.announcementRecipient.findMany({
      where: { announcementId, emailStatus: "PENDING" },
      orderBy: { employeeId: "asc" },
      take: SIMPLE_CHUNK,
      select: { id: true, employeeId: true, employee: { select: { email: true, firstName: true } } },
    });
    if (pending.length === 0) break;

    for (const row of pending) {
      const email = row.employee.email?.trim();
      if (!email || !email.includes("@")) {
        await prisma.announcementRecipient.update({ where: { id: row.id }, data: { emailStatus: "UNREACHABLE" } });
        summary.unreachable++;
        continue;
      }
      const result = await sendEmail({
        to: [email],
        from: "Basilissa",
        subject: announcement.title,
        html: buildAnnouncementEmailHtml({
          title: announcement.title,
          body: announcement.body,
          recipientName: row.employee.firstName,
          senderName: announcement.createdByName,
        }),
        idempotencyKey: `announcement:${announcementId}:${row.employeeId}`,
        context: { announcementId, employeeId: row.employeeId },
      });
      const ok = result.status === "sent";
      await prisma.announcementRecipient.update({
        where: { id: row.id },
        data: ok
          ? { emailStatus: "SENT", emailSentAt: new Date(), emailError: null }
          : {
              emailStatus: "FAILED",
              emailError:
                result.status === "skipped"
                  ? "Email is not configured"
                  : String((result as { error?: unknown }).error ?? "Not accepted by the email gateway").slice(0, 300),
            },
      });
      if (ok) summary.sent++;
      else summary.failed++;
    }
  }
  return summary;
}

/**
 * The job: every channel the sender chose, in turn. One channel failing does not
 * stop the others (each records its own outcome per person), but a thrown error
 * still fails the job so it is retried and, if it keeps failing, reported to Slack.
 */
export async function handleAnnouncementFanout(payload: unknown): Promise<void> {
  const errors: unknown[] = [];
  for (const run of [fanoutAnnouncementPush, fanoutAnnouncementSms, fanoutAnnouncementEmail]) {
    try {
      await run(payload);
    } catch (error) {
      if (error instanceof PermanentJobError) throw error;
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
}

export type ReminderSummary = { examined: number; reminded: number };

/**
 * Reminds people who have not confirmed an announcement that asked for it.
 * Automatic: first after a few hours (one for an urgent announcement), then daily,
 * at most three, none after a week (`ackReminderDue` holds the schedule).
 *
 * The record is written BEFORE the push, so a failed push is not retried every
 * sweep: a reminder is a nudge, and being late once is better than being repeated.
 * It goes by push whether or not the sender chose push for the original, because
 * confirming is the point. Someone with no registered phone simply is not nudged;
 * the banner and the inbox still ask.
 */
export async function remindUnacknowledged(now: Date = new Date()): Promise<ReminderSummary> {
  const candidates = await prisma.announcementRecipient.findMany({
    where: {
      acknowledgedAt: null,
      ackReminderCount: { lt: 3 },
      announcement: { requiresAck: true, createdAt: { gt: new Date(now.getTime() - 7 * 86_400_000) } },
      employee: { status: "ACTIVE" },
    },
    take: 500,
    orderBy: { announcement: { createdAt: "asc" } },
    select: {
      id: true,
      employeeId: true,
      announcementId: true,
      acknowledgedAt: true,
      ackReminderCount: true,
      ackRemindedAt: true,
      announcement: { select: { title: true, requiresAck: true, isUrgent: true, createdAt: true } },
    },
  });

  let reminded = 0;
  for (const row of candidates) {
    if (!ackReminderDue(row, row.announcement, now)) continue;
    await prisma.announcementRecipient.update({
      where: { id: row.id },
      data: { ackReminderCount: { increment: 1 }, ackRemindedAt: now },
    });
    try {
      await sendEmployeePushNotification(row.employeeId, {
        title: "Please confirm you have read this",
        body: row.announcement.title,
        data: { type: "ANNOUNCEMENT", announcementId: row.announcementId, reminder: true },
      });
      reminded++;
    } catch (error) {
      scoped("announcements.reminders").warn("could not send a confirmation reminder", { employeeId: row.employeeId, error });
    }
  }
  return { examined: candidates.length, reminded };
}

/**
 * Takes down banners whose time is up. Reads already treat an expired banner as
 * inactive, so this only tidies the state (and frees the one-banner slot); a late
 * run never shows a stale banner. Safe to repeat. A banner that asked for
 * confirmation keeps showing to people who have not given it (see
 * `getActiveUrgentBanner`), whatever this has recorded.
 */
export async function expireUrgentBanners(now: Date = new Date()): Promise<number> {
  const result = await prisma.announcement.updateMany({
    where: { isUrgent: true, bannerClearedAt: null, bannerExpiresAt: { lte: now } },
    data: { bannerClearedAt: now, bannerClearReason: "EXPIRED" },
  });
  return result.count;
}
