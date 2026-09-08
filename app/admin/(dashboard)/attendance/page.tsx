import type { Metadata } from "next";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {exceptionsOnly
            ? "Nothing needs attention on this date."
            : "No attendance recorded for this date."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>Worked</TableHead>
              <TableHead>Overtime</TableHead>
              <TableHead>Needs attention</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => {
              const employee = employees.get(day.employeeId);
              return (
                <TableRow key={day.id}>
                  <TableCell>
                    <Link
                      href={`/admin/attendance/${day.employeeId}/${date}`}
                      className="font-medium underline"
                    >
                      {employee ? `${employee.firstName} ${employee.lastName}` : day.employeeId}
                    </Link>
                    {employee && (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {employee.employeeCode}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {branchName.get(day.branchId) ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {time(day.actualIn)}
                    {day.lateMinutes > 0 && (
                      <Badge variant="outline" className="ml-2">
                        {day.lateMinutes}m late
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{time(day.actualOut)}</TableCell>
                  <TableCell className="text-sm">{hours(day.netWorkedMinutes)}</TableCell>
                  <TableCell className="text-sm">{hours(day.overtimeMinutes)}</TableCell>
                  <TableCell>
                    {day.status === "NEEDS_REVIEW" ? (
                      <div className="flex flex-wrap gap-1">
                        {day.flags.map((flag) => (
                          <Badge key={flag} variant="outline" className="text-xs">
                            {flag.toLowerCase().replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
