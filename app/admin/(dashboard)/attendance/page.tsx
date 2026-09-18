import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarCheck, Clock, TriangleAlert, Users } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import {
  employeeLookup,
  listAttendanceDays,
  summariseDay,
  getTimesheetSummary,
  getLiveFloorStatus,
  listPendingExceptions,
} from "@/lib/modules/attendance/server";
import { listEmployees } from "@/lib/modules/employees/server";
import { prisma } from "@/lib/platform/prisma";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { StatCard } from "@/components/admin/stat-card";
import { AttendanceTabs, type AttendanceView } from "@/components/admin/attendance-tabs";
import { AttendanceTopActions } from "@/components/admin/attendance-top-actions";
import type { EmployeeOption } from "@/components/admin/manual-punch-dialog";
import { AttendanceFilters } from "@/components/admin/attendance-filters";
import { AttendanceTable } from "@/components/admin/attendance-table";
import { LiveFloorBoard } from "@/components/admin/live-floor-board";
import { TimesheetFilters } from "@/components/admin/timesheet-filters";
import { TimesheetsTable } from "@/components/admin/timesheets-table";
import { ExceptionsFilters } from "@/components/admin/exceptions-filters";
import { ExceptionsTable } from "@/components/admin/exceptions-table";
import { LeaveRequestsTable, type SerializedLeaveRequest } from "@/components/admin/leave-requests-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";

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
  const { actor, scope } = await requireAnyBranchPermission("attendance:read");
  const raw = await searchParams;

  const view = (first(raw.view) as AttendanceView) || "daily";
  const now = new Date();
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
  const date = first(raw.date) ?? todayKey;
  const branchId = first(raw.branchId);
  const exceptionsOnly = first(raw.exceptions) === "1";
  const search = first(raw.search);
  const flag = first(raw.flag);

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
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      geofenceRadiusMeters: true,
      geofenceEnabled: true,
    },
  });

  const exceptionsCount =
    scope.kind === "none"
      ? 0
      : await prisma.attendanceDay.count({
          where: {
            status: "NEEDS_REVIEW",
            ...(scope.kind === "branches" ? { branchId: { in: scope.branchIds } } : {}),
          },
        });

  const pendingLeaveCount =
    scope.kind === "none"
      ? 0
      : await prisma.leaveRequest.count({
          where: {
            status: "PENDING",
            ...(scope.kind === "branches" ? { branchId: { in: scope.branchIds } } : {}),
          },
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
  const canWrite = can(actor, "attendance:write");

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Tabs & Top Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-border">
        <div className="min-w-0 flex-1">
          <AttendanceTabs
            activeView={view}
            branchId={branchId}
            date={date}
            exceptionsCount={exceptionsCount}
            leaveRequestsCount={pendingLeaveCount}
          />
        </div>
        <div className="shrink-0 pb-2">
          <AttendanceTopActions
            canManualEntry={canManualEntry}
            canWrite={canWrite}
            employees={employeeOptions}
            branches={branches}
            defaultBranchId={defaultBranchId}
            date={date}
          />
        </div>
      </div>

      {/* View 1: Daily Roster */}
      {view === "daily" && (
        <DailyRosterView
          scope={scope}
          date={date}
          branchId={branchId}
          exceptionsOnly={exceptionsOnly}
          branches={branches}
          canWrite={canWrite}
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

      {/* View 4: Review Queue */}
      {view === "exceptions" && (
        <ExceptionsQueueView
          scope={scope}
          branches={branches}
          branchId={branchId}
          flag={flag}
          search={search}
          canWrite={canWrite}
        />
      )}

      {/* View 5: Leave Requests */}
      {view === "leave" && (
        <LeaveRequestsView
          scope={scope}
          _branches={branches}
          branchId={branchId}
          search={search}
          canWrite={canWrite}
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
  canWrite = true,
}: {
  scope: Parameters<typeof listAttendanceDays>[0];
  date: string;
  branchId?: string;
  exceptionsOnly: boolean;
  branches: { id: string; name: string }[];
  canWrite?: boolean;
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
              {summary.needingReview === 1 ? "record requires" : "records require"} review.
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
              branchId: day.branchId,
              date,
              employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
              employeeCode: employee?.employeeCode ?? null,
              branchName: branchName.get(day.branchId) ?? "-",
              actualInLabel: time(day.actualIn),
              actualOutLabel: time(day.actualOut),
              workedLabel: hours(day.netWorkedMinutes),
              overtimeLabel: hours(day.overtimeMinutes),
              calculatedOvertimeMinutes: day.overtimeMinutes,
              payableOvertimeMinutes: day.payableOvertimeMinutes,
              lateMinutes: day.lateMinutes,
              status: day.status,
              flags: day.flags,
              canWrite,
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

async function ExceptionsQueueView({
  scope,
  branches,
  branchId,
  flag,
  search,
  canWrite,
}: {
  scope: Parameters<typeof listPendingExceptions>[0];
  branches: { id: string; name: string }[];
  branchId?: string;
  flag?: string;
  search?: string;
  canWrite: boolean;
}) {
  const exceptions = await listPendingExceptions(scope, {
    branchId,
    flag,
    search,
  });

  const missingPunchCount = exceptions.filter(
    (e) => e.flags.includes("MISSING_CLOCK_OUT") || e.flags.includes("MISSING_CLOCK_IN"),
  ).length;
  const overtimeCount = exceptions.filter((e) => e.overtimeMinutes > 0).length;
  const geofenceAnomalyCount = exceptions.filter((e) =>
    e.flags.includes("OUTSIDE_GEOFENCE"),
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending Review"
          value={String(exceptions.length)}
          icon={TriangleAlert}
        />
        <StatCard
          label="Missing Punches"
          value={String(missingPunchCount)}
          icon={Clock}
        />
        <StatCard
          label="Overtime Awaiting Auth"
          value={String(overtimeCount)}
          icon={AlertTriangle}
        />
        <StatCard
          label="Off-Site Punches"
          value={String(geofenceAnomalyCount)}
          icon={Users}
        />
      </div>

      <ExceptionsFilters
        branches={branches}
        branchId={branchId}
        flag={flag}
        search={search}
      />

      {exceptions.length === 0 ? (
        <Empty className="border">
          <EmptyDescription>
            No attendance exceptions pending review. Everything looks clear!
          </EmptyDescription>
        </Empty>
      ) : (
        <ExceptionsTable exceptions={exceptions} canWrite={canWrite} />
      )}
    </div>
  );
}

async function LeaveRequestsView({
  scope,
  _branches,
  branchId,
  search,
  canWrite,
}: {
  scope: Parameters<typeof listPendingExceptions>[0];
  _branches: { id: string; name: string }[];
  branchId?: string;
  search?: string;
  canWrite: boolean;
}) {
  const branchFilter =
    branchId
      ? { branchId }
      : scope.kind === "branches"
        ? { branchId: { in: scope.branchIds } }
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
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          jobTitle: true,
        },
      },
      branch: {
        select: { id: true, name: true },
      },
      reviewer: {
        select: { id: true, name: true },
      },
    },
  });

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;
  const rejectedCount = requests.filter((r) => r.status === "REJECTED").length;

  const serializedRequests: SerializedLeaveRequest[] = requests.map((r) => {
    const start = r.startDate.toISOString().slice(0, 10);
    const end = r.endDate.toISOString().slice(0, 10);
    const dayMs = 24 * 60 * 60 * 1000;
    const daysCount = Math.max(
      1,
      Math.round((r.endDate.getTime() - r.startDate.getTime()) / dayMs) + 1,
    );

    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
      employeeCode: r.employee.employeeCode,
      jobTitle: r.employee.jobTitle,
      branchId: r.branchId,
      branchName: r.branch?.name ?? null,
      type: r.type,
      startDate: start,
      endDate: end,
      daysCount,
      reason: r.reason,
      status: r.status,
      reviewedBy: r.reviewer?.name ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      managerNotes: r.managerNotes,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending Requests"
          value={String(pendingCount)}
          icon={Clock}
        />
        <StatCard
          label="Approved Leave"
          value={String(approvedCount)}
          icon={CalendarCheck}
        />
        <StatCard
          label="Declined"
          value={String(rejectedCount)}
          icon={AlertTriangle}
        />
      </div>

      <LeaveRequestsTable
        requests={serializedRequests}
        canReview={canWrite}
      />
    </div>
  );
}


