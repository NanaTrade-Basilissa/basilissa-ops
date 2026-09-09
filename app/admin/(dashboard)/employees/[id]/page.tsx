import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/platform/prisma";
import { can, currentBranchScope, requirePermission } from "@/lib/modules/identity/server";
import { getEmployee, listShiftAssignments, listShifts } from "@/lib/modules/employees/server";
import { EmployeeDetailContent } from "@/components/admin/employee-detail-content";
import { isFeatureEnabled } from "@/lib/platform/features";

export const metadata: Metadata = { title: "Employee" };
export const dynamic = "force-dynamic";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("employee:read");
  const scope = await currentBranchScope("employee:read");
  const attendanceEnabled = isFeatureEnabled("attendance");

  // Scoped lookup, not a fetch-then-check. A manager must not be able to reach
  // another branch's employee by guessing the id.
  const employee = await getEmployee(id, scope);
  if (!employee) notFound();

  const [branches, shifts, shiftAssignments] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listShifts(),
    listShiftAssignments(employee.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <EmployeeDetailContent
        employee={employee}
        branches={branches}
        shifts={shifts}
        shiftAssignments={shiftAssignments}
        canWrite={can(actor, "employee:write")}
        canSchedule={can(actor, "schedule:write")}
        attendanceEnabled={attendanceEnabled}
      />
    </div>
  );
}
