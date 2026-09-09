import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Clock, TriangleAlert, Users } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import {
  employeeLookup,
  listAttendanceDays,
  summariseDay,
  getTimesheetSummary,
  getLiveFloorStatus,
} from "@/lib/modules/attendance/server";
import { listEmployees } from "@/lib/modules/employees/server";
import { prisma } from "@/lib/platform/prisma";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { StatCard } from "@/components/admin/stat-card";
import { AttendanceTabs, type AttendanceView } from "@/components/admin/attendance-tabs";
import { AttendanceFilters } from "@/components/admin/attendance-filters";
import { AttendanceTable } from "@/components/admin/attendance-table";
import { LiveFloorBoard } from "@/components/admin/live-floor-board";
import { TimesheetFilters } from "@/components/admin/timesheet-filters";
import { TimesheetsTable } from "@/components/admin/timesheets-table";
import { ManualPunchDialog, type EmployeeOption } from "@/components/admin/manual-punch-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

  const { actor, scope } = await requireAnyBranchPermission("attendance:read");
  const raw = await searchParams;

  const view = (first(raw.view) as AttendanceView) || "daily";
  const now = new Date();
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
  const date = first(raw.date) ?? todayKey;
  const branchId = first(raw.branchId);
  const exceptionsOnly = first(raw.exceptions) === "1";
  const search = first(raw.search);

  // Default timesheet range: Monday of this week to today
  const dayOfWeek = now.getDay();
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  const defaultStartDate = dateKeyInZone(monday, DISPLAY_TIMEZONE);
  const defaultEndDate = todayKey;

  const startDate = first(raw.startDate) ?? defaultStartDate;
  const endDate = first(raw.endDate) ?? defaultEndDate;

  const canManualEntry =
    can(actor, "attendance:manual_entry") ||
    (scope.kind === "branches" &&
      scope.branchIds.some((id) => can(actor, "attendance:manual_entry", { branchId: id })));

  const branches = await prisma.branch.findMany({
    where: scope.kind === "branches" ? { id: { in: scope.branchIds } } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const activeEmployees = canManualEntry
    ? await listEmployees(scope, { status: "ACTIVE" })
    : [];

  const employeeOptions: EmployeeOption[] = activeEmployees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`.trim(),
    employeeCode: e.employeeCode,
    branchAssignments: e.branchAssignments.map((ba) => ({
      branchId: ba.branch.id,
      branchName: ba.branch.name,
      isPrimary: ba.isPrimary,
    })),
  }));

  // Resolve active branch for single-branch views (like Live Floor)
  const defaultBranchId = branchId || (branches.length > 0 ? branches[0].id : undefined);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Attendance Hub</h1>
          <p className="text-sm text-muted-foreground">
            {scope.kind === "branches" ? "Your branches." : "Every branch."} Daily logs, live
            roster, and payroll timesheets.
          </p>
        </div>
        {canManualEntry && (
          <ManualPunchDialog
            employees={employeeOptions}
            branches={branches}
            defaultDate={date}
            defaultBranchId={defaultBranchId}
          />
        )}
      </div>

      {/* Tabs */}
      <AttendanceTabs activeView={view} branchId={branchId} date={date} />

      {/* View 1: Daily Roster */}
      {view === "daily" && (
        <DailyRosterView
          scope={scope}
          date={date}
          branchId={branchId}
          exceptionsOnly={exceptionsOnly}
          branches={branches}
        />
      )}

      {/* View 2: Live Floor Board */}
      {view === "live" && (
        <LiveFloorView
          scope={scope}
          branches={branches}
          branchId={defaultBranchId}
        />
      )}

      {/* View 3: Timesheets & Payroll */}
      {view === "timesheets" && (
        <TimesheetsView
          scope={scope}
          branches={branches}
          startDate={startDate}
          endDate={endDate}
          branchId={branchId}
          search={search}
        />
      )}
    </div>
  );
}

async function DailyRosterView({
  scope,
  date,
  branchId,
  exceptionsOnly,
  branches,
}: {
  scope: Parameters<typeof listAttendanceDays>[0];
  date: string;
  branchId?: string;
  exceptionsOnly: boolean;
  branches: { id: string; name: string }[];
}) {
  const [days, summary] = await Promise.all([
    listAttendanceDays(scope, { date, branchId, exceptionsOnly }),
    summariseDay(scope, { date, branchId }),
  ]);

  const employees = await employeeLookup(days.map((day) => day.employeeId));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      {summary.needingReview > 0 && !exceptionsOnly && (
        <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="font-semibold">Review needed</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {summary.needingReview}{" "}
              {summary.needingReview === 1 ? "day requires" : "days require"} manager review
              (missing clock-outs, late arrivals, or anomalies).
            </span>
            <Link
              href={`/admin/attendance?view=daily&date=${date}${branchId ? `&branchId=${branchId}` : ""}&exceptions=1`}
              className="font-medium underline underline-offset-4 hover:text-foreground"
            >
              Filter to days needing attention &rarr;
            </Link>
          </AlertDescription>
        </Alert>
      )}

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
          date={date}
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

async function LiveFloorView({
  scope,
  branches,
  branchId,
}: {
  scope: Parameters<typeof getLiveFloorStatus>[0];
  branches: { id: string; name: string }[];
  branchId?: string;
}) {
  if (!branchId) {
    return (
      <Empty className="border">
        <EmptyDescription>No branches available for live floor monitoring.</EmptyDescription>
      </Empty>
    );
  }

  const liveData = await getLiveFloorStatus(scope, branchId);
  if (!liveData) {
    return (
      <Empty className="border">
        <EmptyDescription>Branch not accessible or not found.</EmptyDescription>
      </Empty>
    );
  }

  return <LiveFloorBoard data={liveData} branches={branches} />;
}

async function TimesheetsView({
  scope,
  branches,
  startDate,
  endDate,
  branchId,
  search,
}: {
  scope: Parameters<typeof getTimesheetSummary>[0];
  branches: { id: string; name: string }[];
  startDate: string;
  endDate: string;
  branchId?: string;
  search?: string;
}) {
  const timesheetData = await getTimesheetSummary(scope, {
    startDate,
    endDate,
    branchId,
    search,
  });

  return (
    <div className="space-y-6">
      <TimesheetFilters
        branches={branches}
        startDate={startDate}
        endDate={endDate}
        branchId={branchId}
        search={search}
      />
      <TimesheetsTable data={timesheetData} />
    </div>
  );
}
