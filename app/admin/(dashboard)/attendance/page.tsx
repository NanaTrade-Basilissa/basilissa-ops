import type { Metadata } from "next";
import { AlertTriangle, Clock, TriangleAlert, Users } from "lucide-react";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import {
  employeeLookup,
  listAttendanceDays,
  summariseDay,
} from "@/lib/modules/attendance/server";
import { prisma } from "@/lib/platform/prisma";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { StatCard } from "@/components/admin/stat-card";
import { AttendanceFilters } from "@/components/admin/attendance-filters";
import { AttendanceTable } from "@/components/admin/attendance-table";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { requireFeature } from "@/lib/platform/features-guard";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function time(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: DISPLAY_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
      }).format(value)
    : "-";
}

function hours(minutes: number): string {
  if (minutes === 0) return "-";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default async function AttendancePage({ searchParams }: { searchParams: SearchParams }) {
  requireFeature("attendance");

  const { scope } = await requireAnyBranchPermission("attendance:read");
  const raw = await searchParams;

  const date = first(raw.date) ?? dateKeyInZone(new Date(), DISPLAY_TIMEZONE);
  const branchId = first(raw.branchId);
  const exceptionsOnly = first(raw.exceptions) === "1";

  const [days, summary, branches] = await Promise.all([
    listAttendanceDays(scope, { date, branchId, exceptionsOnly }),
    summariseDay(scope, { date, branchId }),
    prisma.branch.findMany({
      where: scope.kind === "branches" ? { id: { in: scope.branchIds } } : {},
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const employees = await employeeLookup(days.map((day) => day.employeeId));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          {scope.kind === "branches" ? "Your branches." : "Every branch."} Days needing a
          person are listed first.
        </p>
      </div>

      <AttendanceFilters
        branches={branches}
        date={date}
        branchId={branchId}
        exceptionsOnly={exceptionsOnly}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="On record" value={String(summary.total)} icon={Users} />
        <StatCard label="Still clocked in" value={String(summary.stillIn)} icon={Clock} />
        <StatCard label="Late" value={String(summary.late)} icon={AlertTriangle} />
        <StatCard
          label="Needs review"
          value={String(summary.needingReview)}
          icon={TriangleAlert}
        />
      </div>

      {days.length === 0 ? (
        <Empty className="border">
          <EmptyDescription>
            {exceptionsOnly ? "Nothing needs attention on this date." : "No attendance recorded for this date."}
          </EmptyDescription>
        </Empty>
      ) : (
        <AttendanceTable
          days={days.map((day) => {
            const employee = employees.get(day.employeeId);
            return {
              id: day.id,
              employeeId: day.employeeId,
              date,
              employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
              employeeCode: employee?.employeeCode ?? null,
              branchName: branchName.get(day.branchId) ?? "-",
              actualInLabel: time(day.actualIn),
              actualOutLabel: time(day.actualOut),
              workedLabel: hours(day.netWorkedMinutes),
              overtimeLabel: hours(day.overtimeMinutes),
              lateMinutes: day.lateMinutes,
              status: day.status,
              flags: day.flags,
            };
          })}
        />
      )}
    </div>
  );
}
