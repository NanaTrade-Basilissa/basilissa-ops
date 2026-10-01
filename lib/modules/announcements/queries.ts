import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";
import type { AudienceKind } from "./constants";

/**
 * Admin reads for the announcements screens.
 *
 * VISIBILITY. Someone with a company-wide grant sees every announcement. Someone
 * scoped to branches sees only what they sent themselves: they must not read a
 * message an administrator sent to another branch, and "what was sent to people
 * at my branch" is a different question that nothing needs yet. A `none` scope
 * sees nothing and does not query.
 */

/** A banner is showing while it is urgent, not cleared, and not past its expiry. */
export function isBannerActive(
  a: { isUrgent: boolean; bannerClearedAt: Date | null; bannerExpiresAt: Date | null },
  now: Date,
): boolean {
  return a.isUrgent && a.bannerClearedAt === null && (a.bannerExpiresAt === null || a.bannerExpiresAt > now);
}

export type Viewer = { userId: string; scope: BranchScope };

function visibleTo(viewer: Viewer): Prisma.AnnouncementWhereInput | null {
  switch (viewer.scope.kind) {
    case "all":
      return {};
    case "branches":
      return { createdBy: viewer.userId };
    case "none":
      return null;
  }
}

export type AnnouncementListRow = {
  id: string;
  title: string;
  createdAt: Date;
  createdByName: string;
  audienceKind: AudienceKind;
  sendPush: boolean;
  isUrgent: boolean;
  bannerActive: boolean;
  requiresAck: boolean;
  recipients: number;
  read: number;
  acknowledged: number;
};

export const ANNOUNCEMENTS_PAGE_SIZE = 25;

export async function listAnnouncements(
  viewer: Viewer,
  page = 1,
): Promise<{ rows: AnnouncementListRow[]; total: number; pageCount: number; page: number }> {
  const where = visibleTo(viewer);
  if (!where) return { rows: [], total: 0, pageCount: 1, page: 1 };

  const total = await prisma.announcement.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ANNOUNCEMENTS_PAGE_SIZE));
  const current = Math.min(Math.max(Math.trunc(page) || 1, 1), pageCount);

  const announcements = await prisma.announcement.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (current - 1) * ANNOUNCEMENTS_PAGE_SIZE,
    take: ANNOUNCEMENTS_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      createdAt: true,
      createdByName: true,
      audienceKind: true,
      sendPush: true,
      isUrgent: true,
      bannerClearedAt: true,
      bannerExpiresAt: true,
      requiresAck: true,
      _count: { select: { recipients: true } },
    },
  });

  const ids = announcements.map((announcement) => announcement.id);
  const reads = ids.length
    ? await prisma.notification.groupBy({
        by: ["announcementId"],
        where: { announcementId: { in: ids }, readAt: { not: null } },
        _count: { _all: true },
      })
    : [];
  const readByAnnouncement = new Map(reads.map((row) => [row.announcementId, row._count._all]));
  const acks = ids.length
    ? await prisma.announcementRecipient.groupBy({
        by: ["announcementId"],
        where: { announcementId: { in: ids }, acknowledgedAt: { not: null } },
        _count: { _all: true },
      })
    : [];
  const ackByAnnouncement = new Map(acks.map((row) => [row.announcementId, row._count._all]));
  const now = new Date();

  return {
    rows: announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      createdAt: announcement.createdAt,
      createdByName: announcement.createdByName,
      audienceKind: announcement.audienceKind,
      sendPush: announcement.sendPush,
      isUrgent: announcement.isUrgent,
      bannerActive: isBannerActive(announcement, now),
      requiresAck: announcement.requiresAck,
      recipients: announcement._count.recipients,
      read: readByAnnouncement.get(announcement.id) ?? 0,
      acknowledged: ackByAnnouncement.get(announcement.id) ?? 0,
    })),
    total,
    pageCount,
    page: current,
  };
}

export type RecipientRow = {
  employeeId: string;
  name: string;
  employeeCode: string;
  read: boolean;
  readAt: Date | null;
  pushStatus: string;
  pushError: string | null;
  acknowledgedAt: Date | null;
};

export type AnnouncementDetail = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  createdByName: string;
  audienceKind: AudienceKind;
  sendPush: boolean;
  isUrgent: boolean;
  bannerActive: boolean;
  bannerExpiresAt: Date | null;
  requiresAck: boolean;
  recipients: RecipientRow[];
  counts: { recipients: number; read: number; acknowledged: number; pushSent: number; pushFailed: number; pushUnreachable: number };
};

/** The announcement and who it went to, or null when it does not exist or is not the viewer's to see. */
export async function getAnnouncementDetail(id: string, viewer: Viewer): Promise<AnnouncementDetail | null> {
  const visibility = visibleTo(viewer);
  if (!visibility) return null;

  const announcement = await prisma.announcement.findFirst({
    where: { id, ...visibility },
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      createdByName: true,
      audienceKind: true,
      sendPush: true,
      isUrgent: true,
      bannerClearedAt: true,
      bannerExpiresAt: true,
      requiresAck: true,
      recipients: {
        orderBy: { employee: { firstName: "asc" } },
        select: {
          employeeId: true,
          pushStatus: true,
          pushError: true,
          acknowledgedAt: true,
          employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        },
      },
    },
  });
  if (!announcement) return null;

  const reads = await prisma.notification.findMany({
    where: { announcementId: id, readAt: { not: null } },
    select: { employeeId: true, readAt: true },
  });
  const readAtByEmployee = new Map(reads.map((row) => [row.employeeId, row.readAt]));

  const recipients: RecipientRow[] = announcement.recipients.map((row) => {
    const readAt = readAtByEmployee.get(row.employeeId) ?? null;
    return {
      employeeId: row.employeeId,
      name: `${row.employee.firstName} ${row.employee.lastName}`,
      employeeCode: row.employee.employeeCode,
      read: readAt !== null,
      readAt,
      pushStatus: row.pushStatus,
      pushError: row.pushError,
      acknowledgedAt: row.acknowledgedAt,
    };
  });

  const countStatus = (status: string) => recipients.filter((row) => row.pushStatus === status).length;

  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    createdAt: announcement.createdAt,
    createdByName: announcement.createdByName,
    audienceKind: announcement.audienceKind,
    sendPush: announcement.sendPush,
    isUrgent: announcement.isUrgent,
    bannerActive: isBannerActive(announcement, new Date()),
    bannerExpiresAt: announcement.bannerExpiresAt,
    requiresAck: announcement.requiresAck,
    recipients,
    counts: {
      recipients: recipients.length,
      read: recipients.filter((row) => row.read).length,
      acknowledged: recipients.filter((row) => row.acknowledgedAt !== null).length,
      pushSent: countStatus("SENT"),
      pushFailed: countStatus("FAILED"),
      pushUnreachable: countStatus("UNREACHABLE"),
    },
  };
}

export type ComposeOptions = {
  branches: { id: string; name: string }[];
  employees: { id: string; name: string; employeeCode: string; branchNames: string[] }[];
  /** True when the sender may choose Everyone, and send urgent. */
  canSendToAll: boolean;
  /** The urgent banner currently up, which a new urgent announcement would replace. */
  activeUrgent: { id: string; title: string } | null;
};

/**
 * What the compose screen may offer: only branches and people inside the
 * sender's scope. The form is a convenience; `sendAnnouncement` checks again.
 */
export async function loadComposeOptions(scope: BranchScope, now = new Date()): Promise<ComposeOptions> {
  if (scope.kind === "none") return { branches: [], employees: [], canSendToAll: false, activeUrgent: null };

  const branchFilter: Prisma.BranchWhereInput =
    scope.kind === "branches" ? { id: { in: scope.branchIds } } : {};
  const branches = await prisma.branch.findMany({
    where: { isActive: true, ...branchFilter },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const inEffect: Prisma.EmployeeBranchAssignmentWhereInput = {
    validFrom: { lte: now },
    OR: [{ validTo: null }, { validTo: { gt: now } }],
  };
  const employees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      ...(scope.kind === "branches"
        ? { branchAssignments: { some: { ...inEffect, branchId: { in: scope.branchIds } } } }
        : {}),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      branchAssignments: { where: inEffect, select: { branch: { select: { name: true } } } },
    },
  });

  return {
    branches,
    employees: employees.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      employeeCode: employee.employeeCode,
      branchNames: employee.branchAssignments.map((assignment) => assignment.branch.name),
    })),
    canSendToAll: scope.kind === "all",
    activeUrgent:
      scope.kind === "all"
        ? await prisma.announcement.findFirst({
            where: { isUrgent: true, bannerClearedAt: null, OR: [{ bannerExpiresAt: null }, { bannerExpiresAt: { gt: now } }] },
            select: { id: true, title: true },
          })
        : null,
  };
}
