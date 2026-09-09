import { Building2, CalendarClock } from "lucide-react";
import {
  assignBranch,
  assignShift,
  endBranchAssignment,
  updateEmployee,
} from "@/lib/modules/employees/actions";
import { minutesToTime } from "@/lib/modules/employees/validation";
import type { getEmployee } from "@/lib/modules/employees/server";
import { EmployeeForm } from "@/components/admin/employee-form";
import {
  BranchAssignmentForm,
  EndAssignmentButton,
  ShiftAssignmentForm,
} from "@/components/admin/assignment-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAccraDate } from "@/lib/platform/date";
import type { EmployeeAttendanceHistoryData } from "@/lib/modules/attendance/queries";
import { EmployeeAttendanceTab } from "@/components/admin/employee-attendance-tab";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Employee = NonNullable<Awaited<ReturnType<typeof getEmployee>>>;

/**
 * The actual employee record view, shared by the full page
 * (`employees/[id]`, kept for a direct link) and the Sheet opened from the
 * employees list. `onMutated` re-fetches the Sheet's copy after a change;
 * the page doesn't need it since a Server Action re-render already refreshes
 * the page's own data.
 */
export function EmployeeDetailContent({
  employee,
  branches,
  shifts,
  shiftAssignments,
  canWrite,
  canSchedule,
  attendanceEnabled,
  attendanceHistory,
  onMutated,
}: {
  employee: Employee;
  branches: { id: string; name: string }[];
  shifts: { id: string; name: string; isActive: boolean; startMinute: number; endMinute: number }[];
  shiftAssignments: {
    id: string;
    daysOfWeek: number[];
    validFrom: Date;
    validTo: Date | null;
    shift: { name: string; startMinute: number; endMinute: number };
  }[];
  canWrite: boolean;
  canSchedule: boolean;
  attendanceEnabled: boolean;
  attendanceHistory?: EmployeeAttendanceHistoryData | null;
  onMutated?: () => void;
}) {
  const profileContent = (
    <div className="space-y-6">

      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-heading text-2xl font-bold text-foreground">
          {employee.firstName} {employee.lastName}
        </h2>
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
              onSuccess={onMutated}
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
              {employee.jobTitle ?? "No job title recorded"}. View only.
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
          <CardDescription>Where this person may clock in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {employee.branchAssignments.length === 0 ? (
            <p className="text-sm text-destructive">Not assigned to any branch.</p>
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
                    <EndAssignmentButton
                      action={endBranchAssignment}
                      assignmentId={assignment.id}
                      onSuccess={onMutated}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <BranchAssignmentForm
              action={assignBranch.bind(null, employee.id)}
              branches={branches}
              onSuccess={onMutated}
            />
          )}
        </CardContent>
      </Card>

      {attendanceEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              Shift
            </CardTitle>
            <CardDescription>Which shift they work, and on which days.</CardDescription>
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
                <p className="text-sm text-muted-foreground">No shifts defined yet.</p>
              ) : (
                <ShiftAssignmentForm
                  action={assignShift.bind(null, employee.id)}
                  onSuccess={onMutated}
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

  if (!attendanceEnabled) {
    return profileContent;
  }

  return (
    <Tabs defaultValue="profile" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="profile">Profile & Schedule</TabsTrigger>
        <TabsTrigger value="attendance" className="flex items-center gap-1.5">
          <span>Attendance & History</span>
          {attendanceHistory && attendanceHistory.summary.exceptionDaysCount > 0 && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px] leading-none">
              {attendanceHistory.summary.exceptionDaysCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile">{profileContent}</TabsContent>

      <TabsContent value="attendance" className="pt-2">
        <EmployeeAttendanceTab employeeId={employee.id} history={attendanceHistory} />
      </TabsContent>
    </Tabs>
  );
}

