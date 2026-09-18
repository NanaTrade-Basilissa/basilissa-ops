import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  Users,
  Store,
  Clock,
  ArrowUpRight,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission, branchScope } from "@/lib/modules/identity/server";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { GeneralQrButton } from "@/components/admin/general-qr-button";
import { getEnv } from "@/lib/platform/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Operations Dashboard" };
export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  const actor = await requirePermission("admin:access");
  const attScope = branchScope(actor, "attendance:read");

  const now = new Date();
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

  const branchWhere =
    attScope.kind === "branches"
      ? { id: { in: attScope.branchIds } }
      : attScope.kind === "none"
        ? { id: { in: [] } }
        : undefined;

  // Parallel data fetching across core operations domains
  const [
    branches,
    activeEmployeeCount,
    todayAttendanceDays,
  ] = await Promise.all([
    prisma.branch.findMany({
      where: branchWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        latitude: true,
        longitude: true,
        geofenceEnabled: true,
        geofenceRadiusMeters: true,
        _count: { select: { employees: true } },
      },
    }),
    prisma.employee.count({
      where: {
        status: "ACTIVE",
        ...(attScope.kind === "branches"
          ? { branchAssignments: { some: { branchId: { in: attScope.branchIds } } } }
          : attScope.kind === "none"
            ? { id: { in: [] } }
            : {}),
      },
    }),
    prisma.attendanceDay.findMany({
      where: {
        workDate: todayDate,
        ...(attScope.kind === "branches"
          ? { branchId: { in: attScope.branchIds } }
          : attScope.kind === "none"
            ? { branchId: { in: [] } }
            : {}),
      },
      select: {
        id: true,
        employeeId: true,
        branchId: true,
        status: true,
        settledAt: true,
        actualIn: true,
        actualOut: true,
        scheduledStart: true,
        scheduledEnd: true,
        scheduledMinutes: true,
        netWorkedMinutes: true,
        shiftIdSnapshot: true,
        flags: true,
      },
      orderBy: { scheduledStart: "asc" },
    }),
  ]);

  // Load employee details for today active roster
  const employeeIds = Array.from(new Set(todayAttendanceDays.map((d) => d.employeeId)));
  const rosterEmployees = employeeIds.length > 0
    ? await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
        },
      })
    : [];

  const employeeMap = new Map(
    rosterEmployees.map((e) => [
      e.id,
      {
        name: `${e.firstName} ${e.lastName}`,
        code: e.employeeCode,
      },
    ]),
  );
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));

  // Attendance metrics breakdown
  const scheduledCount = todayAttendanceDays.length;
  const onDutyCount = todayAttendanceDays.filter((d) => d.actualIn != null && d.actualOut == null).length;
  const completedCount = todayAttendanceDays.filter((d) => d.actualOut != null).length;
  const exceptionCount = todayAttendanceDays.filter((d) => !d.settledAt && d.flags.length > 0).length;

  const activeBranches = branches.filter((b) => b.isActive);
  const geofencedBranches = branches.filter((b) => b.geofenceEnabled);

  return (
    <div className="space-y-8">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              Operations Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {todayKey} (Accra)
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {attScope.kind === "branches" && branches.length === 1
              ? `Live operations for ${branches[0]?.name}.`
              : "Live operations and branch activity."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <GeneralQrButton feedbackUrl={`${getEnv().NEXT_PUBLIC_APP_URL}/feedback`} />
        </div>
      </div>

      {/* Top 4 Equal-Height Executive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        <StatCard
          label="On Duty Now"
          value={String(onDutyCount)}
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              {scheduledCount > 0 ? `${Math.round((onDutyCount / scheduledCount) * 100)}% on duty` : "No shifts"}
            </span>
          }
          subtext={
            scheduledCount > 0
              ? `${completedCount} completed · ${scheduledCount} scheduled`
              : "No shifts scheduled"
          }
          icon={ClipboardList}
          tone="good"
        />

        <StatCard
          label="Scheduled Shifts"
          value={String(scheduledCount)}
          badge={
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              exceptionCount > 0
                ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
            )}>
              {exceptionCount > 0 ? `${exceptionCount} exceptions` : "Nominal"}
            </span>
          }
          subtext={
            exceptionCount > 0
              ? `${exceptionCount} flagged for review`
              : "Tracking normally"
          }
          icon={CalendarClock}
          tone={exceptionCount > 0 ? "critical" : "info"}
        />

        <StatCard
          label="Active Workforce"
          value={String(activeEmployeeCount)}
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              All branches
            </span>
          }
          subtext={`Across ${branches.length} ${branches.length === 1 ? "branch" : "branches"}`}
          icon={Users}
          tone="info"
        />

        <StatCard
          label="Branch Network"
          value={String(activeBranches.length)}
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
              {geofencedBranches.length} geofenced
            </span>
          }
          subtext={`${branches.length} locations`}
          icon={Store}
          tone="default"
        />
      </div>

      {/* Main Floor Operations Hub */}
      <Card className="flex flex-col">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Clock className="size-4 text-primary" />
              Today&apos;s Attendance & Floor Status
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Live roster and shift activity for today.
            </CardDescription>
          </div>
          <CardAction>
            <Link
              href="/admin/attendance?view=live"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-xs")}
            >
              Live Floor <ArrowUpRight className="size-3.5" />
            </Link>
          </CardAction>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col justify-between pt-1 pb-4">
          {/* Floor Status Category Pods */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1 mb-4">
            <div className="rounded-xl bg-slate-50/90 p-3">
              <div className="text-[11px] text-muted-foreground font-medium">On Duty</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{onDutyCount}</div>
            </div>
            <div className="rounded-xl bg-slate-50/90 p-3">
              <div className="text-[11px] text-muted-foreground font-medium">Completed</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{completedCount}</div>
            </div>
            <div className="rounded-xl bg-slate-50/90 p-3">
              <div className="text-[11px] text-muted-foreground font-medium">Exceptions</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{exceptionCount}</div>
            </div>
            <div className="rounded-xl bg-slate-50/90 p-3">
              <div className="text-[11px] text-muted-foreground font-medium">Scheduled</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{scheduledCount}</div>
            </div>
          </div>

          {/* Empty State or Staff Roster List */}
          {todayAttendanceDays.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center rounded-xl bg-slate-50/50 border border-dashed border-border/60 py-12 px-4 text-center">
              <div className="flex size-10 items-center justify-center rounded-xl bg-background border border-border/50 text-primary mb-3">
                <CalendarClock className="size-5" />
              </div>
              <p className="text-sm font-semibold text-foreground">No staff clocked in today</p>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Punches will appear in real time as staff clock in.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
                <Link
                  href="/admin/attendance"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs h-8 bg-card")}
                >
                  Attendance Hub
                </Link>
                <Link
                  href="/admin/shifts"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs h-8 text-muted-foreground hover:text-foreground")}
                >
                  Shift Rota &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40 my-2">
              {todayAttendanceDays.map((day) => {
                const emp = employeeMap.get(day.employeeId);
                const empName = emp?.name || "Staff Member";
                const empCode = emp?.code;
                const branchName = branchMap.get(day.branchId) || "Branch";
                const isOnDuty = day.actualIn != null && day.actualOut == null;
                const isCompleted = day.actualOut != null;

                const actualInTime = day.actualIn
                  ? new Intl.DateTimeFormat("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: DISPLAY_TIMEZONE,
                    }).format(new Date(day.actualIn))
                  : null;

                const actualOutTime = day.actualOut
                  ? new Intl.DateTimeFormat("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: DISPLAY_TIMEZONE,
                    }).format(new Date(day.actualOut))
                  : null;

                return (
                  <div
                    key={day.id}
                    className="flex items-center justify-between py-3 px-2 hover:bg-muted/30 rounded-md transition-colors text-xs"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{empName}</p>
                        {empCode && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                            {empCode}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {branchName}
                        {actualInTime && ` · In: ${actualInTime}`}
                        {actualOutTime && ` · Out: ${actualOutTime}`}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isOnDuty ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px]">
                          On duty
                        </Badge>
                      ) : isCompleted ? (
                        <Badge variant="outline" className="border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[11px]">
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px]">
                          {day.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Clean Footer Link */}
          <div className="pt-4 border-t border-border/40 text-xs mt-3 flex items-center justify-between">
            <Link
              href="/admin/attendance"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Attendance Hub <ArrowRight className="size-3" />
            </Link>
            <Link
              href="/admin/shifts"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              Shift Rota &rarr;
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
