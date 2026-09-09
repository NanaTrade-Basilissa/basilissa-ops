import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission } from "./dal";
import type { AuditLogFilters, AuditLogSearchResult } from "./constants";

export type { AuditLogFilters, AuditLogItem, AuditLogSearchResult } from "./constants";

/**
 * Queries append-only audit trail logs with filtering and pagination.
 * Gated by user:read permission (Administrators and Super Admins).
 */
export async function listAuditLogs(filters: AuditLogFilters): Promise<AuditLogSearchResult> {
  await requirePermission("user:read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const whereConditions: Prisma.AuditLogWhereInput[] = [];

  if (filters.startDate) {
    whereConditions.push({
      occurredAt: { gte: new Date(`${filters.startDate}T00:00:00.000Z`) },
    });
  }

  if (filters.endDate) {
    whereConditions.push({
      occurredAt: { lte: new Date(`${filters.endDate}T23:59:59.999Z`) },
    });
  }

  if (filters.action && filters.action !== "all") {
    whereConditions.push({
      action: { startsWith: filters.action },
    });
  }

  if (filters.entityType && filters.entityType !== "all") {
    whereConditions.push({
      entityType: filters.entityType,
    });
  }

  if (filters.actorEmail) {
    whereConditions.push({
      actorEmail: { contains: filters.actorEmail, mode: "insensitive" },
    });
  }

  if (filters.search && filters.search.trim().length > 0) {
    const s = filters.search.trim();
    whereConditions.push({
      OR: [
        { action: { contains: s, mode: "insensitive" } },
        { entityType: { contains: s, mode: "insensitive" } },
        { entityId: { contains: s, mode: "insensitive" } },
        { actorEmail: { contains: s, mode: "insensitive" } },
      ],
    });
  }

  const where: Prisma.AuditLogWhereInput =
    whereConditions.length > 0 ? { AND: whereConditions } : {};

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        occurredAt: true,
        actorUserId: true,
        actorEmail: true,
        actorRole: true,
        action: true,
        entityType: true,
        entityId: true,
        before: true,
        after: true,
        metadata: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}
