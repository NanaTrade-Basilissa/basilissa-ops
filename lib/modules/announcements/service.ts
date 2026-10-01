import "server-only";
import { Prisma, ProviderType } from "@prisma/client";
import { SYSTEM_ACTOR } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { enqueue } from "@/lib/platform/jobs";
import { createInboxNotifications } from "@/lib/platform/inbox";
import { scoped } from "@/lib/platform/logger";
import type { BranchScope } from "@/lib/modules/identity/authorization";
import {
  checkAudienceAllowed,
  resolveRecipients,
  type AudiencePreview,
  type AudienceRefusal,
  type AudienceSpec,
  type DirectoryEntry,
} from "./audience";
import type { AnnouncementInput, AudienceInput } from "./validation";
import { ANNOUNCEMENT_FANOUT } from "./jobs";

const log = scoped("announcements");

export function audienceSpecFrom(input: AudienceInput): AudienceSpec {
  switch (input.audienceKind) {
    case "ALL":
      return { kind: "ALL" };
    case "BRANCHES":
      return { kind: "BRANCHES", branchIds: [...new Set(input.branchIds)] };
    case "PEOPLE":
      return { kind: "PEOPLE", employeeIds: [...new Set(input.employeeIds)] };
  }
}

/** A branch assignment that is in effect right now. */
function currentAssignment(now: Date): Prisma.EmployeeBranchAssignmentWhereInput {
  return { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] };
}

/**
 * Loads just the employees the audience could touch, with the branches they are
 * assigned to today. Everyone for ALL, the branches' staff for BRANCHES, the
 * named people for PEOPLE.
 */
async function loadDirectory(spec: AudienceSpec, now: Date): Promise<DirectoryEntry[]> {
  const where: Prisma.EmployeeWhereInput =
    spec.kind === "ALL"
      ? {}
      : spec.kind === "BRANCHES"
        ? { branchAssignments: { some: { ...currentAssignment(now), branchId: { in: spec.branchIds } } } }
        : { id: { in: spec.employeeIds } };

  const rows = await prisma.employee.findMany({
    where,
    select: {
      id: true,
      status: true,
      branchAssignments: { where: currentAssignment(now), select: { branchId: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    active: row.status === "ACTIVE",
    branchIds: row.branchAssignments.map((assignment) => assignment.branchId),
  }));
}

/** How many people a send would reach, and how many of them have the app. */
export async function previewAudience(
  input: AudienceInput,
  scope: BranchScope,
  now = new Date(),
): Promise<AudiencePreview> {
  const spec = audienceSpecFrom(input);
  const directory = await loadDirectory(spec, now);

  const allowed = checkAudienceAllowed(spec, scope, directory);
  if (!allowed.ok) return { ok: false, error: allowed.reason };

  const recipients = resolveRecipients(spec, directory);
  if (recipients.length === 0) return { ok: false, error: "NO_RECIPIENTS" };

  const withApp = await countWithApp(recipients);
  return { ok: true, recipients: recipients.length, withApp, withoutApp: recipients.length - withApp };
}

/**
 * Employees with an active mobile app binding. Someone without one can still
 * be a recipient, but only the app inbox and push reach a phone, so the sender
 * should see the gap before sending.
 */
async function countWithApp(employeeIds: string[]): Promise<number> {
  const rows = await prisma.employeeDeviceIdentity.findMany({
    where: { employeeId: { in: employeeIds }, providerType: ProviderType.MOBILE_APP, revokedAt: null },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  return rows.length;
}

export type Sender = { audit: AuditActor; name: string };

export type SendResult =
  | { ok: true; announcementId: string; recipients: number }
  | { ok: false; error: AudienceRefusal | "NO_RECIPIENTS" | "URGENT_NEEDS_GLOBAL" | "URGENT_CONFLICT" };

/**
 * Sends an announcement.
 *
 * ONE TRANSACTION: the announcement, its recipients, their inbox rows, the
 * fan-out job and the audit entry commit together or not at all. A recipient
 * list without an announcement, or a push job for a message that rolled back, is
 * what separate writes would allow. The scope check is repeated here, not only in
 * the action, because the audience is resolved from the database at this moment.
 */
export async function sendAnnouncement(
  input: AnnouncementInput,
  sender: Sender,
  scope: BranchScope,
  now = new Date(),
): Promise<SendResult> {
  // The banner is company-wide and there is only one, so only someone with a
  // company-wide grant may take it: otherwise a branch manager's urgent message
  // would silently replace an administrator's.
  if (input.isUrgent && scope.kind !== "all") return { ok: false, error: "URGENT_NEEDS_GLOBAL" };

  const spec = audienceSpecFrom(input);
  const directory = await loadDirectory(spec, now);

  const allowed = checkAudienceAllowed(spec, scope, directory);
  if (!allowed.ok) return { ok: false, error: allowed.reason };

  const recipientIds = resolveRecipients(spec, directory);
  if (recipientIds.length === 0) return { ok: false, error: "NO_RECIPIENTS" };

  let announcementId: string;
  try {
  announcementId = await prisma.$transaction(
    async (tx) => {
      if (input.isUrgent) {
        // Free the one banner slot: an expired banner the sweep has not reached
        // yet, then whatever is still showing.
        await tx.announcement.updateMany({
          where: { isUrgent: true, bannerClearedAt: null, bannerExpiresAt: { lte: now } },
          data: { bannerClearedAt: now, bannerClearReason: "EXPIRED" },
        });
        await tx.announcement.updateMany({
          where: { isUrgent: true, bannerClearedAt: null },
          data: { bannerClearedAt: now, bannerClearedBy: sender.audit.userId, bannerClearReason: "SUPERSEDED" },
        });
      }

      const announcement = await tx.announcement.create({
        data: {
          title: input.title,
          body: input.body,
          audienceKind: input.audienceKind,
          audienceSpec: spec as unknown as Prisma.InputJsonValue,
          sendPush: input.sendPush,
          isUrgent: input.isUrgent,
          bannerExpiresAt: input.isUrgent ? new Date(now.getTime() + input.bannerHours * 3_600_000) : null,
          requiresAck: input.requiresAck,
          createdBy: sender.audit.userId,
          createdByName: sender.name,
          createdAt: now,
        },
        select: { id: true },
      });

      await tx.announcementRecipient.createMany({
        data: recipientIds.map((employeeId) => ({
          announcementId: announcement.id,
          employeeId,
          pushStatus: input.sendPush ? "PENDING" : "NOT_REQUESTED",
        })),
      });

      await createInboxNotifications(
        recipientIds.map((employeeId) => ({
          employeeId,
          kind: "ANNOUNCEMENT",
          title: input.title,
          body: input.body,
          data: { type: "announcement", announcementId: announcement.id },
          announcementId: announcement.id,
        })),
        tx,
      );

      if (input.sendPush) {
        await enqueue(ANNOUNCEMENT_FANOUT, { announcementId: announcement.id }, {}, tx);
      }

      await recordAudit(
        {
          actor: sender.audit,
          action: "announcement.sent",
          entityType: "Announcement",
          entityId: announcement.id,
          after: {
            title: input.title,
            audienceKind: input.audienceKind,
            recipients: recipientIds.length,
            channels: { push: input.sendPush },
            urgent: input.isUrgent,
            requiresAck: input.requiresAck,
          },
        },
        tx,
      );

      return announcement.id;
    },
    { timeout: 20_000 },
  );
  } catch (error) {
    // Two administrators sending urgent at the same instant: the database index
    // lets one through and refuses the other.
    if (input.isUrgent && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "URGENT_CONFLICT" };
    }
    throw error;
  }

  log.info("announcement sent", {
    announcementId,
    audienceKind: input.audienceKind,
    recipients: recipientIds.length,
    push: input.sendPush,
  });

  return { ok: true, announcementId, recipients: recipientIds.length };
}

// ---------------------------------------------------------------------------
// Urgent banner and acknowledgement, from the staff member's side
// ---------------------------------------------------------------------------

export type UrgentBanner = {
  id: string;
  title: string;
  body: string;
  requiresAck: boolean;
  acknowledged: boolean;
  expiresAt: Date | null;
  createdAt: Date;
};

/**
 * The banner this employee should see, or null. Active means not cleared and not
 * past its expiry (so a late sweep never shows a stale banner), and the person was
 * one of its recipients.
 */
export async function getActiveUrgentBanner(employeeId: string, now = new Date()): Promise<UrgentBanner | null> {
  const row = await prisma.announcement.findFirst({
    where: {
      isUrgent: true,
      bannerClearedAt: null,
      OR: [{ bannerExpiresAt: null }, { bannerExpiresAt: { gt: now } }],
      recipients: { some: { employeeId } },
    },
    select: {
      id: true,
      title: true,
      body: true,
      requiresAck: true,
      bannerExpiresAt: true,
      createdAt: true,
      recipients: { where: { employeeId }, select: { acknowledgedAt: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    requiresAck: row.requiresAck,
    acknowledged: row.recipients[0]?.acknowledgedAt != null,
    expiresAt: row.bannerExpiresAt,
    createdAt: row.createdAt,
  };
}

export type AnnouncementFlags = { requiresAck: boolean; acknowledged: boolean; urgent: boolean };

/** Acknowledgement state for inbox items that are announcements, keyed by announcement id. */
export async function loadAnnouncementFlags(
  employeeId: string,
  announcementIds: string[],
): Promise<Map<string, AnnouncementFlags>> {
  if (announcementIds.length === 0) return new Map();
  const rows = await prisma.announcementRecipient.findMany({
    where: { employeeId, announcementId: { in: announcementIds } },
    select: { announcementId: true, acknowledgedAt: true, announcement: { select: { requiresAck: true, isUrgent: true } } },
  });
  return new Map(
    rows.map((row) => [
      row.announcementId,
      { requiresAck: row.announcement.requiresAck, acknowledged: row.acknowledgedAt !== null, urgent: row.announcement.isUrgent },
    ]),
  );
}

export type AckResult = "OK" | "ALREADY" | "NOT_FOUND" | "NOT_REQUIRED";

/**
 * "I've read this". Evidence, so: set once, with the server's clock, in the same
 * transaction as its audit entry, and never changed or cleared afterwards. Only a
 * recipient of an announcement that asked for it can acknowledge; anyone else gets
 * NOT_FOUND so ids cannot be probed. Acknowledging also marks the inbox row read.
 */
export async function acknowledgeAnnouncement(
  employeeId: string,
  announcementId: string,
  now = new Date(),
): Promise<AckResult> {
  const recipient = await prisma.announcementRecipient.findUnique({
    where: { announcementId_employeeId: { announcementId, employeeId } },
    select: { acknowledgedAt: true, announcement: { select: { requiresAck: true } } },
  });
  if (!recipient) return "NOT_FOUND";
  if (!recipient.announcement.requiresAck) return "NOT_REQUIRED";
  if (recipient.acknowledgedAt) return "ALREADY";

  return prisma.$transaction(async (tx) => {
    const updated = await tx.announcementRecipient.updateMany({
      where: { announcementId, employeeId, acknowledgedAt: null },
      data: { acknowledgedAt: now },
    });
    await tx.notification.updateMany({ where: { employeeId, announcementId, readAt: null }, data: { readAt: now } });
    if (updated.count === 0) return "ALREADY" as const;
    await recordAudit(
      {
        actor: { ...SYSTEM_ACTOR, role: "EMPLOYEE" },
        action: "announcement.acknowledged",
        entityType: "Announcement",
        entityId: announcementId,
        metadata: { employeeId },
      },
      tx,
    );
    return "OK" as const;
  });
}

/** Takes the banner down by hand. The announcement itself stays in history. */
export async function clearUrgentBanner(announcementId: string, sender: Sender, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const cleared = await tx.announcement.updateMany({
      where: { id: announcementId, isUrgent: true, bannerClearedAt: null },
      data: { bannerClearedAt: now, bannerClearedBy: sender.audit.userId, bannerClearReason: "MANUAL" },
    });
    if (cleared.count === 0) return false;
    await recordAudit(
      { actor: sender.audit, action: "announcement.banner_cleared", entityType: "Announcement", entityId: announcementId },
      tx,
    );
    return true;
  });
}
