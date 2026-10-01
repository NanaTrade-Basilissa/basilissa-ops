import "server-only";
import { Prisma, ProviderType } from "@prisma/client";
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
  | { ok: false; error: AudienceRefusal | "NO_RECIPIENTS" };

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
  const spec = audienceSpecFrom(input);
  const directory = await loadDirectory(spec, now);

  const allowed = checkAudienceAllowed(spec, scope, directory);
  if (!allowed.ok) return { ok: false, error: allowed.reason };

  const recipientIds = resolveRecipients(spec, directory);
  if (recipientIds.length === 0) return { ok: false, error: "NO_RECIPIENTS" };

  const announcementId = await prisma.$transaction(
    async (tx) => {
      const announcement = await tx.announcement.create({
        data: {
          title: input.title,
          body: input.body,
          audienceKind: input.audienceKind,
          audienceSpec: spec as unknown as Prisma.InputJsonValue,
          sendPush: input.sendPush,
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
          },
        },
        tx,
      );

      return announcement.id;
    },
    { timeout: 20_000 },
  );

  log.info("announcement sent", {
    announcementId,
    audienceKind: input.audienceKind,
    recipients: recipientIds.length,
    push: input.sendPush,
  });

  return { ok: true, announcementId, recipients: recipientIds.length };
}
