import type { Metadata } from "next";
import { AlertTriangle, CalendarCheck, Clock } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { resolveStorageUrl } from "@/lib/platform/r2";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { StatCard } from "@/components/admin/stat-card";
import { LeaveRequestsTable, type SerializedLeaveRequest } from "@/components/admin/leave-requests-table";
import { AnnualLeaveAdminPanel } from "@/components/admin/annual-leave-admin-panel";
import { getOrCreateCurrentLeaveCycle } from "@/lib/modules/attendance/server";

export const metadata: Metadata = { title: "Leave" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function LeavePage({ searchParams }: { searchParams: SearchParams }) {
  const { actor, scope } = await requireAnyBranchPermission("attendance:read");
  const raw = await searchParams;
  const branchId = first(raw.branchId);
  const search = first(raw.search);
  const canWrite = can(actor, "attendance:write");

  // A branchId outside the actor's scope must not widen access, so it only
  // ever narrows within the branches they hold.
  const allowedBranchIds = scope.kind === "branches" ? scope.branchIds : null;
  const branchFilter = branchId
    ? allowedBranchIds && !allowedBranchIds.includes(branchId)
      ? { branchId: { in: [] as string[] } }
      : { branchId }
    : allowedBranchIds
      ? { branchId: { in: allowedBranchIds } }
      : {};

  // Fetch Requests
  const requests = await prisma.leaveRequest.findMany({
    where: {
      ...branchFilter,
      ...(search
        ? {
            employee: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { employeeCode: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true } },
      branch: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
    },
  });

  const serialized: SerializedLeaveRequest[] = await Promise.all(
    requests.map(async (r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
      employeeCode: r.employee.employeeCode,
      jobTitle: r.employee.jobTitle,
      branchId: r.branchId,
      branchName: r.branch?.name ?? null,
      type: r.type,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      isoWeek: r.isoWeek,
      attachmentUrl: r.attachmentUrl
        ? await resolveStorageUrl(r.attachmentUrl, r.attachmentKey)
        : null,
      daysCount: Math.max(1, Math.round((r.endDate.getTime() - r.startDate.getTime()) / DAY_MS) + 1),
      reason: r.reason,
      status: r.status,
      reviewedBy: r.reviewer?.name ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      managerNotes: r.managerNotes,
      createdAt: r.createdAt.toISOString(),
    }))
  );

  const count = (status: SerializedLeaveRequest["status"]) => requests.filter((r) => r.status === status).length;

  // Load or initialize LeaveCycle
  const cycle = await getOrCreateCurrentLeaveCycle();
  const [allocations, autoScheduledCount] = await Promise.all([
    prisma.leaveAllocation.findMany({
      where: { cycleId: cycle.id },
      select: { isEligible: true, scheduledDays: true },
    }),
    prisma.leaveRequest.count({
      where: { cycleId: cycle.id, isAutoScheduled: true },
    }),
  ]);

  const totalEligible = allocations.filter((a) => a.isEligible).length;
  const fullyScheduledCount = allocations.filter((a) => a.isEligible && a.scheduledDays >= 15).length;
  const partiallyScheduledCount = allocations.filter((a) => a.isEligible && a.scheduledDays > 0 && a.scheduledDays < 15).length;
  const unscheduledCount = allocations.filter((a) => a.isEligible && a.scheduledDays === 0).length;

  const currentCycleData = {
    id: cycle.id,
    year: cycle.year,
    title: cycle.title,
    status: cycle.status,
    windowStartStr: cycle.windowStart.toISOString().slice(0, 10),
    windowEndStr: cycle.windowEnd.toISOString().slice(0, 10),
    blackoutWeeks: cycle.blackoutWeeks,
    autoScheduledAt: cycle.autoScheduledAt?.toISOString() ?? null,
    autoScheduledCount,
    totalEligible,
    fullyScheduledCount,
    partiallyScheduledCount,
    unscheduledCount,
  };

  // Load all branches, their quotas, and the active job titles present at each branch
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      leaveQuotas: {
        select: { jobCategory: true, maxConcurrent: true },
      },
      employees: {
        where: {
          validTo: null,
          employee: { status: "ACTIVE" },
        },
        select: {
          employee: { select: { id: true, jobTitle: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const branchQuotaData = branches.map((b) => {
    const quotaMap: Record<string, number> = {};
    for (const q of b.leaveQuotas) {
      quotaMap[q.jobCategory.trim().toLowerCase()] = q.maxConcurrent;
    }

    // Count active staff per distinct job title at this branch
    const jobTitleCounts = new Map<string, { name: string; staffCount: number }>();
    const seenEmployees = new Set<string>();
    for (const a of b.employees) {
      if (seenEmployees.has(a.employee.id)) continue;
      seenEmployees.add(a.employee.id);
      const rawTitle = (a.employee.jobTitle ?? "").trim().replace(/\s+/g, " ");
      if (!rawTitle) continue;
      const key = rawTitle.toLowerCase();
      const existing = jobTitleCounts.get(key);
      if (existing) {
        existing.staffCount += 1;
      } else {
        jobTitleCounts.set(key, { name: rawTitle, staffCount: 1 });
      }
    }

    const jobTitles = Array.from(jobTitleCounts.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      id: b.id,
      name: b.name,
      quotas: quotaMap,
      jobTitles,
    };
  });

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending Requests" value={String(count("PENDING"))} icon={Clock} />
        <StatCard label="Approved Leave" value={String(count("APPROVED"))} icon={CalendarCheck} />
        <StatCard label="Declined" value={String(count("REJECTED"))} icon={AlertTriangle} />
      </div>

      <AnnualLeaveAdminPanel
        currentCycle={currentCycleData}
        branches={branchQuotaData}
        canManage={canWrite}
      />

      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">All Staff Leave Records</h3>
        <LeaveRequestsTable requests={serialized} canReview={canWrite} />
      </div>
    </div>
  );
}
