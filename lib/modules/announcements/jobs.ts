import "server-only";
import { z } from "zod";
import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { PermanentJobError } from "@/lib/platform/jobs";
import { parseDeviceMetadata, sendPushNotification } from "@/lib/platform/push";
import { PUSH_BODY_PREVIEW_MAX } from "./constants";

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

/** The registered handler. The summary is for tests and logs; the queue needs none. */
export async function handleAnnouncementFanout(payload: unknown): Promise<void> {
  await fanoutAnnouncementPush(payload);
}

/**
 * Takes down banners whose time is up. Reads already treat an expired banner as
 * inactive, so this only tidies the state (and frees the one-banner slot); a late
 * run never shows a stale banner. Safe to repeat.
 */
export async function expireUrgentBanners(now: Date = new Date()): Promise<number> {
  const result = await prisma.announcement.updateMany({
    where: { isUrgent: true, bannerClearedAt: null, bannerExpiresAt: { lte: now } },
    data: { bannerClearedAt: now, bannerClearReason: "EXPIRED" },
  });
  return result.count;
}
