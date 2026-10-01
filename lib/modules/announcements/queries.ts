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
  recipients: number;
  read: number;
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

  return {
    rows: announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      createdAt: announcement.createdAt,
      createdByName: announcement.createdByName,
      audienceKind: announcement.audienceKind,
      sendPush: announcement.sendPush,
      recipients: announcement._count.recipients,
      read: readByAnnouncement.get(announcement.id) ?? 0,
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
};

export type AnnouncementDetail = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  createdByName: string;
  audienceKind: AudienceKind;
  sendPush: boolean;
  recipients: RecipientRow[];
  counts: { recipients: number; read: number; pushSent: number; pushFailed: number; pushUnreachable: number };
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
      recipients: {
        orderBy: { employee: { firstName: "asc" } },
        select: {
          employeeId: true,
          pushStatus: true,
          pushError: true,
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
    recipients,
    counts: {
      recipients: recipients.length,
      read: recipients.filter((row) => row.read).length,
      pushSent: countStatus("SENT"),
      pushFailed: countStatus("FAILED"),
      pushUnreachable: countStatus("UNREACHABLE"),
    },
  };
}

export type ComposeOptions = {
  branches: { id: string; name: string }[];
  employees: { id: string; name: string; employeeCode: string; branchNames: string[] }[];
  /** True when the sender may choose Everyone. */
  canSendToAll: boolean;
};

/**
 * What the compose screen may offer: only branches and people inside the
 * sender's scope. The form is a convenience; `sendAnnouncement` checks again.
 */
export async function loadComposeOptions(scope: BranchScope, now = new Date()): Promise<ComposeOptions> {
  if (scope.kind === "none") return { branches: [], employees: [], canSendToAll: false };

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
  };
}
