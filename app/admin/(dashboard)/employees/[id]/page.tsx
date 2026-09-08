import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { can, currentBranchScope, requirePermission } from "@/lib/modules/identity/server";
import { getEmployee, listShiftAssignments, listShifts } from "@/lib/modules/employees/server";
import {
  assignBranch,
  assignShift,
  endBranchAssignment,
  updateEmployee,
} from "@/lib/modules/employees/actions";
import { minutesToTime } from "@/lib/modules/employees/validation";
import { EmployeeForm } from "@/components/admin/employee-form";
import { BranchAssignmentForm, ShiftAssignmentForm } from "@/components/admin/assignment-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAccraDate } from "@/lib/platform/date";
import { isFeatureEnabled } from "@/lib/platform/features";

export const metadata: Metadata = { title: "Employee" };
export const dynamic = "force-dynamic";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const canWrite = can(actor, "employee:write");
  const canSchedule = can(actor, "schedule:write");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          {employee.firstName} {employee.lastName}
        </h1>
        <span className="font-mono text-sm text-muted-foreground">{employee.employeeCode}</span>
        <Badge variant={employee.status === "ACTIVE" ? "default" : "outline"}>
          {employee.status.toLowerCase()}
        </Badge>
        {employee.masterSource === "LOCAL" && (
          <Badge variant="outline" title="Owned here until Odoo exists and adopts this record">
            local record
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          {canWrite ? (
            <EmployeeForm
              action={updateEmployee.bind(null, employee.id)}
              submitLabel="Save changes"
              defaultValues={{
                employeeCode: employee.employeeCode,
                firstName: employee.firstName,
                lastName: employee.lastName,
                email: employee.email ?? "",
                phone: employee.phone ?? "",
                jobTitle: employee.jobTitle ?? "",
                status: employee.status,
                hireDate: employee.hireDate?.toISOString().slice(0, 10) ?? "",
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {employee.jobTitle ?? "No job title recorded"}. You can view this employee but
              not change their record.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4" />
            Branches
          </CardTitle>
          <CardDescription>
            Where this person may clock in. Several is normal: covering another branch is
            an ordinary Tuesday. Assignments are dated, so past attendance keeps resolving
            against the branch it actually happened at.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {employee.branchAssignments.length === 0 ? (
            <p className="text-sm text-destructive">
              Not assigned to any branch, so no attendance can be recorded for them.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {employee.branchAssignments.map((assignment) => (
                <li key={assignment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-medium">{assignment.branch.name}</span>
                  {assignment.isPrimary && <Badge>primary</Badge>}
                  <span className="text-muted-foreground">
                    from {formatAccraDate(assignment.validFrom)}
                    {assignment.validTo ? ` until ${formatAccraDate(assignment.validTo)}` : ""}
                  </span>
                  {canWrite && assignment.validTo === null && (
                    <form action={endBranchAssignment} className="ml-auto">
                      <input type="hidden" name="assignmentId" value={assignment.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        End
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && <BranchAssignmentForm action={assignBranch.bind(null, employee.id)} branches={branches} />}
        </CardContent>
      </Card>

      {/*
        The employee record stays visible in production; scheduling does not.
        Shifts cannot be created while attendance is gated, so an assignment
        form here would offer an empty list and a submit that 404s — a dead end
        is worse than an absence.
      */}
      {attendanceEnabled && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" />
            Shift
          </CardTitle>
          <CardDescription>
            Which shift they work and on which days. Without one, attendance is still
            recorded but flagged unscheduled: there is no start or end to measure lateness
            or overtime against.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {shiftAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shift assigned.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {shiftAssignments.map((assignment) => (
                <li key={assignment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-medium">{assignment.shift.name}</span>
                  <span className="text-muted-foreground">
                    {minutesToTime(assignment.shift.startMinute)}–
                    {minutesToTime(assignment.shift.endMinute)}
                  </span>
                  <span className="text-muted-foreground">
                    {[...assignment.daysOfWeek].sort().map((d) => DAY_NAMES[d - 1]).join(" ")}
                  </span>
                  <span className="text-muted-foreground">
                    from {formatAccraDate(assignment.validFrom)}
                    {assignment.validTo ? ` until ${formatAccraDate(assignment.validTo)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canSchedule &&
            (shifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No shifts defined yet. Create one first.
              </p>
            ) : (
              <ShiftAssignmentForm
                action={assignShift.bind(null, employee.id)}
                shifts={shifts
                  .filter((shift) => shift.isActive)
                  .map((shift) => ({
                    id: shift.id,
                    label: `${shift.name} (${minutesToTime(shift.startMinute)}–${minutesToTime(shift.endMinute)})`,
                  }))}
              />
            ))}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
