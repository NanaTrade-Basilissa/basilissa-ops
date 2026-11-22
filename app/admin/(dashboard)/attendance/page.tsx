import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Clock, TriangleAlert, Users } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import {
  employeeLookup,
  listAttendanceDays,
  listPendingExceptions,
} from "@/lib/modules/attendance/server";
import { listEmployees } from "@/lib/modules/employees/server";
import { prisma } from "@/lib/platform/prisma";
import { dateKeyInZone, shiftDateKey } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { StatCard } from "@/components/admin/stat-card";
import { AttendanceTabs, type AttendanceView } from "@/components/admin/attendance-tabs";
import { AttendanceTopActions } from "@/components/admin/attendance-top-actions";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import type { EmployeeOption } from "@/components/admin/manual-punch-dialog";
import { AttendanceTable } from "@/components/admin/attendance-table";
import { ExceptionsFilters } from "@/components/admin/exceptions-filters";
import { ExceptionsTable } from "@/components/admin/exceptions-table";
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

  // Leave and timesheets moved to their own pages. Keep old bookmarks working.
  if (first(raw.view) === "leave") {
    const params = new URLSearchParams();
    for (const key of ["branchId", "search"]) {
      const value = first(raw[key]);
      if (value) params.set(key, value);
    }
    redirect(`/admin/leave${params.size ? `?${params}` : ""}`);
  }
  if (first(raw.view) === "timesheets") {
    const params = new URLSearchParams();
    for (const key of ["startDate", "endDate", "branchId", "search"]) {
      const value = first(raw[key]);
      if (value) params.set(key, value);
    }
    redirect(`/admin/payroll${params.size ? `?${params}` : ""}`);
  }

  const rawView = first(raw.view);
  const view: AttendanceView = rawView === "exceptions" ? "exceptions" : "daily";
  const isLive = first(raw.live) === "1" || rawView === "live";
  const now = new Date();
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
  const date = isLive ? todayKey : (first(raw.date) ?? todayKey);
  const branchId = first(raw.branchId);
  const exceptionsOnly = first(raw.exceptions) === "1";
  const search = first(raw.search);
  const flag = first(raw.flag);
  const datePreset = first(raw.datePreset);
  const startDate = first(raw.startDate);
  const endDate = first(raw.endDate);

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
    <PageShell>
      <PageHeader
        title="Attendance"
        description="Track daily clock-ins, live branch floor presence, and exceptions needing manager review."
        actions={
          <AttendanceTopActions
            canManualEntry={canManualEntry}
            canWrite={canWrite}
            employees={employeeOptions}
            branches={branches}
            defaultBranchId={defaultBranchId}
            date={date}
          />
        }
        tabs={
          <AttendanceTabs
            activeView={view}
            branchId={branchId}
            date={date}
            exceptionsCount={exceptionsCount}
          />
        }
      />

      {/* Daily Attendance Roster (with Live Mode auto-refresh toggle) */}
      {view === "daily" && (
        <DailyRosterView
          scope={scope}
          date={date}
          todayKey={todayKey}
          isLive={isLive}
          branchId={branchId}
          exceptionsOnly={exceptionsOnly}
          branches={branches}
          canWrite={canWrite}
        />
      )}

      {/* View 3: Review Queue */}
      {view === "exceptions" && (
        <ExceptionsQueueView
          scope={scope}
          branches={branches}
          branchId={branchId}
          flag={flag}
          search={search}
          datePreset={datePreset}
          startDate={startDate}
          endDate={endDate}
          todayKey={todayKey}
          canWrite={canWrite}
        />
      )}
    </PageShell>
  );
}

async function DailyRosterView({
  scope,
  date,
  todayKey,
  isLive,
  branchId,
  exceptionsOnly,
  branches,
  canWrite = true,
}: {
  scope: Parameters<typeof listAttendanceDays>[0];
  date: string;
  todayKey: string;
  isLive: boolean;
  branchId?: string;
  exceptionsOnly: boolean;
  branches: { id: string; name: string }[];
  canWrite?: boolean;
}) {
  const days = await listAttendanceDays(scope, { date, branchId, exceptionsOnly });

  const empIds = days.map((day) => day.employeeId);
  const dayStartMs = new Date(`${date}T00:00:00.000Z`).getTime();
  const [employees, clockInEvents] = await Promise.all([
    employeeLookup(empIds),
    empIds.length > 0
      ? prisma.attendanceEvent.findMany({
          where: {
            employeeId: { in: empIds },
            direction: "IN",
            occurredAt: {
              gte: new Date(dayStartMs - 6 * 3600_000),
              lte: new Date(dayStartMs + 30 * 3600_000),
            },
          },
          orderBy: { occurredAt: "asc" },
          select: { employeeId: true, providerType: true, occurredAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Match each employee's clock-in providerType (preferring the event closest to actualIn)
  const clockInByEmp = new Map<string, "MOBILE_APP" | "FINGERPRINT" | "MANAGER_MANUAL">();
  const eventsByEmp = new Map<string, typeof clockInEvents>();
  for (const ev of clockInEvents) {
    const list = eventsByEmp.get(ev.employeeId) ?? [];
    list.push(ev);
    eventsByEmp.set(ev.employeeId, list);
  }
  for (const day of days) {
    if (!day.actualIn) continue;
    const empEvents = eventsByEmp.get(day.employeeId);
    if (!empEvents || empEvents.length === 0) continue;
    const targetMs = day.actualIn.getTime();
    let best = empEvents[0];
    let bestDiff = Math.abs(best.occurredAt.getTime() - targetMs);
    for (const ev of empEvents) {
      const diff = Math.abs(ev.occurredAt.getTime() - targetMs);
      if (diff < bestDiff) {
        best = ev;
        bestDiff = diff;
      }
    }
    if (
      best.providerType === "MOBILE_APP" ||
      best.providerType === "FINGERPRINT" ||
      best.providerType === "MANAGER_MANUAL"
    ) {
      clockInByEmp.set(day.employeeId, best.providerType);
    }
  }

  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <AttendanceTable
        date={date}
        todayKey={todayKey}
        branches={branches}
        branchId={branchId}
        exceptionsOnly={exceptionsOnly}
        isLive={isLive}
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
            clockInMethod: clockInByEmp.get(day.employeeId) ?? null,
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
    </div>
  );
}

async function ExceptionsQueueView({
  scope,
  branches,
  branchId,
  flag,
  search,
  datePreset,
  startDate,
  endDate,
  todayKey,
  canWrite,
}: {
  scope: Parameters<typeof listPendingExceptions>[0];
  branches: { id: string; name: string }[];
  branchId?: string;
  flag?: string;
  search?: string;
  datePreset?: string;
  startDate?: string;
  endDate?: string;
  todayKey: string;
  canWrite: boolean;
}) {
  let resolvedStart = startDate;
  let resolvedEnd = endDate;
  if (datePreset === "today") {
    resolvedStart = todayKey;
    resolvedEnd = todayKey;
  } else if (datePreset === "yesterday") {
    const yesterdayKey = shiftDateKey(todayKey, -1);
    resolvedStart = yesterdayKey;
    resolvedEnd = yesterdayKey;
  } else if (datePreset === "last7") {
    resolvedStart = shiftDateKey(todayKey, -6);
    resolvedEnd = todayKey;
  } else if (datePreset === "custom") {
    resolvedStart = startDate;
    resolvedEnd = endDate || startDate;
  }

  const exceptions = await listPendingExceptions(scope, {
    branchId,
    flag,
    search,
    startDate: resolvedStart,
    endDate: resolvedEnd,
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
        datePreset={datePreset}
        startDate={startDate}
        endDate={endDate}
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



