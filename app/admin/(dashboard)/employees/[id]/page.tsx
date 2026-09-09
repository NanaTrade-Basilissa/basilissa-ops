import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/platform/prisma";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { getEmployee, listShiftAssignments, listShifts } from "@/lib/modules/employees/server";
import { getEmployeeAttendanceHistory } from "@/lib/modules/attendance/server";
import { EmployeeDetailContent } from "@/components/admin/employee-detail-content";
import { isFeatureEnabled } from "@/lib/platform/features";

export const metadata: Metadata = { title: "Employee" };
export const dynamic = "force-dynamic";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, scope } = await requireAnyBranchPermission("employee:read");
  const attendanceEnabled = isFeatureEnabled("attendance");

  // Scoped lookup, not a fetch-then-check. A manager must not be able to reach
  // another branch's employee by guessing the id.
  const employee = await getEmployee(id, scope);
  if (!employee) notFound();

  const branchWhere =
    scope.kind === "branches"
      ? { id: { in: scope.branchIds }, isActive: true }
      : { isActive: true };

  const employeeBranchIds = employee.branchAssignments.map((b) => b.branch.id);
  const canWrite =
    can(actor, "employee:write") ||
    employeeBranchIds.some((branchId) => can(actor, "employee:write", { branchId }));
  const canSchedule =
    can(actor, "schedule:write") ||
    employeeBranchIds.some((branchId) => can(actor, "schedule:write", { branchId }));
  const canReadAttendance =
    attendanceEnabled &&
    (can(actor, "attendance:read") ||
      employeeBranchIds.some((branchId) => can(actor, "attendance:read", { branchId })));

  const [branches, shifts, shiftAssignments, attendanceHistory] = await Promise.all([
    prisma.branch.findMany({ where: branchWhere, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listShifts(scope),
    listShiftAssignments(employee.id),
    canReadAttendance ? getEmployeeAttendanceHistory(scope, employee.id) : null,
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <EmployeeDetailContent
        employee={employee}
        branches={branches}
        shifts={shifts}
        shiftAssignments={shiftAssignments}
        canWrite={canWrite}
        canSchedule={canSchedule}
        attendanceEnabled={attendanceEnabled}
        attendanceHistory={attendanceHistory}
      />
    </div>
  );
}

