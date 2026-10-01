import type { Metadata } from "next";
import { AlertTriangle, CalendarCheck, Clock } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { StatCard } from "@/components/admin/stat-card";
import { LeaveRequestsTable, type SerializedLeaveRequest } from "@/components/admin/leave-requests-table";

export const metadata: Metadata = { title: "Leave" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Leave requests, moved out of the attendance tabs onto their own page. Same
 * permission as before; reviewing re-checks `attendance:write` for the
 * request's branch inside the Server Action.
 */
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

  const serialized: SerializedLeaveRequest[] = requests.map((r) => ({
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
    daysCount: Math.max(1, Math.round((r.endDate.getTime() - r.startDate.getTime()) / DAY_MS) + 1),
    reason: r.reason,
    status: r.status,
    reviewedBy: r.reviewer?.name ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    managerNotes: r.managerNotes,
    createdAt: r.createdAt.toISOString(),
  }));

  const count = (status: SerializedLeaveRequest["status"]) => requests.filter((r) => r.status === status).length;

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending Requests" value={String(count("PENDING"))} icon={Clock} />
        <StatCard label="Approved Leave" value={String(count("APPROVED"))} icon={CalendarCheck} />
        <StatCard label="Declined" value={String(count("REJECTED"))} icon={AlertTriangle} />
      </div>
      <LeaveRequestsTable requests={serialized} canReview={canWrite} />
    </div>
  );
}
