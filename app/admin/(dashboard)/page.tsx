import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  Clock,
  ArrowUpRight,
  CalendarClock,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Store,
  Smartphone,
  Fingerprint,
  BarChart3,
  Timer,
} from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission, branchScope } from "@/lib/modules/identity/server";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { GeneralQrButton } from "@/components/admin/general-qr-button";
import { getEnv } from "@/lib/platform/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Operations Dashboard",
  description:
    "Operations dashboard for Basilissa Ghana — monitor real-time attendance, punctuality trends, branch coverage, and pending actions.",
};
export const dynamic = "force-dynamic";

const MAX_FLOOR_PREVIEW = 8;

function formatTimeAccra(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIMEZONE,
  }).format(d);
}

function formatShortDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

function formatDayShort(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  }).format(d);
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default async function OperationsDashboardPage() {
  const actor = await requirePermission("admin:access");
  const attScope = branchScope(actor, "attendance:read");

  const now = new Date();
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

  // Build 7-day window ending today (inclusive)
  const sevenDayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayDate.getTime() - i * 86_400_000);
    sevenDayKeys.push(d.toISOString().slice(0, 10));
  }
  const sevenDaysAgoDate = new Date(`${sevenDayKeys[0]}T00:00:00.000Z`);

  const branchWhere =
    attScope.kind === "branches"
      ? { id: { in: attScope.branchIds } }
      : attScope.kind === "none"
        ? { id: { in: [] } }
        : undefined;

  const branchIdFilter =
    attScope.kind === "branches"
      ? { branchId: { in: attScope.branchIds } }
      : attScope.kind === "none"
        ? { branchId: { in: [] } }
        : {};

  const employeeScopeFilter =
    attScope.kind === "branches"
      ? { branchAssignments: { some: { branchId: { in: attScope.branchIds }, validTo: null } } }
      : attScope.kind === "none"
        ? { id: { in: [] } }
        : {};

  // Parallel data fetching across core operations domains
  const [
    branches,
    activeEmployeeCount,
    branchActiveCounts,
    todayAttendanceDays,
    recentSevenDays,
    totalPendingReviews,
    pendingLeaveRequests,
    pendingLeaveCount,
    todayPunchSources,
    failedOdooSyncCount,
  ] = await Promise.all([
    prisma.branch.findMany({
      where: branchWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        geofenceEnabled: true,
      },
    }),
    prisma.employee.count({
      where: {
        status: "ACTIVE",
        ...employeeScopeFilter,
      },
    }),
    prisma.employeeBranchAssignment.groupBy({
      by: ["branchId"],
      where: {
        isPrimary: true,
        validTo: null,
        employee: { status: "ACTIVE" },
        ...branchIdFilter,
      },
      _count: { employeeId: true },
    }),
    prisma.attendanceDay.findMany({
      where: {
        workDate: todayDate,
        ...branchIdFilter,
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
        lateMinutes: true,
        flags: true,
      },
    }),
    prisma.attendanceDay.findMany({
      where: {
        workDate: { gte: sevenDaysAgoDate, lte: todayDate },
        actualIn: { not: null },
        ...branchIdFilter,
      },
      select: {
        workDate: true,
        lateMinutes: true,
        netWorkedMinutes: true,
        status: true,
      },
    }),
    prisma.attendanceDay.count({
      where: {
        status: "NEEDS_REVIEW",
        ...branchIdFilter,
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        ...(attScope.kind === "branches"
          ? { branchId: { in: attScope.branchIds } }
          : attScope.kind === "none"
            ? { id: { in: [] } }
            : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        employee: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
      },
    }),
    prisma.leaveRequest.count({
      where: {
        status: "PENDING",
        ...(attScope.kind === "branches"
          ? { branchId: { in: attScope.branchIds } }
          : attScope.kind === "none"
            ? { id: { in: [] } }
            : {}),
      },
    }),
    prisma.attendanceEvent.findMany({
      where: {
        direction: "IN",
        occurredAt: {
          gte: todayDate,
          lt: new Date(todayDate.getTime() + 86_400_000),
        },
        ...branchIdFilter,
      },
      select: {
        employeeId: true,
        providerType: true,
      },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.attendanceDay.count({
      where: {
        odooSyncStatus: "FAILED",
        ...branchIdFilter,
      },
    }),
  ]);

  // Sort today's attendance by latest punch activity (most recent first)
  const punchedToday = todayAttendanceDays
    .filter((d) => d.actualIn != null)
    .sort((a, b) => {
      const aTime = (a.actualOut ?? a.actualIn)?.getTime() ?? 0;
      const bTime = (b.actualOut ?? b.actualIn)?.getTime() ?? 0;
      return bTime - aTime;
    });

  const floorPreview = punchedToday.slice(0, MAX_FLOOR_PREVIEW);

  // Top 5 today attention items (late or flagged)
  const attentionItems = todayAttendanceDays
    .filter((d) => d.status === "NEEDS_REVIEW" || d.lateMinutes > 0)
    .sort((a, b) => {
      const aScore = (a.status === "NEEDS_REVIEW" ? 1000 : 0) + a.lateMinutes;
      const bScore = (b.status === "NEEDS_REVIEW" ? 1000 : 0) + b.lateMinutes;
      return bScore - aScore;
    })
    .slice(0, 5);

  // Load employee names only for the preview + attention rows (fast & bounded)
  const neededEmployeeIds = Array.from(
    new Set([
      ...floorPreview.map((d) => d.employeeId),
      ...attentionItems.map((d) => d.employeeId),
    ]),
  );

  const rosterEmployees =
    neededEmployeeIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: neededEmployeeIds } },
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
        name: `${e.firstName} ${e.lastName}`.trim(),
        code: e.employeeCode,
      },
    ]),
  );
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const headcountByBranch = new Map(
    branchActiveCounts.map((b) => [b.branchId, b._count.employeeId]),
  );

  // First IN punch source per employee today
  const sourceByEmp = new Map<string, string>();
  for (const ev of todayPunchSources) {
    if (!sourceByEmp.has(ev.employeeId)) {
      sourceByEmp.set(ev.employeeId, ev.providerType);
    }
  }

  // Core KPIs
  const clockedInTodayCount = punchedToday.length;
  const onDutyCount = punchedToday.filter((d) => d.actualOut == null).length;
  const completedCount = punchedToday.filter((d) => d.actualOut != null).length;
  const todayReviewCount = todayAttendanceDays.filter((d) => d.status === "NEEDS_REVIEW").length;
  const lateToday = punchedToday.filter((d) => d.lateMinutes > 0);
  const lateCount = lateToday.length;
  const avgLateMinutes =
    lateCount > 0
      ? Math.round(lateToday.reduce((sum, d) => sum + d.lateMinutes, 0) / lateCount)
      : 0;
  const onTimeRate =
    clockedInTodayCount > 0
      ? Math.round(((clockedInTodayCount - lateCount) / clockedInTodayCount) * 100)
      : 100;

  // Per-branch live breakdown
  const branchStats = branches
    .filter((b) => b.isActive)
    .map((b) => {
      const bDays = todayAttendanceDays.filter((d) => d.branchId === b.id);
      const bPunched = bDays.filter((d) => d.actualIn != null);
      const bOnDuty = bPunched.filter((d) => d.actualOut == null).length;
      const bCompleted = bPunched.filter((d) => d.actualOut != null).length;
      const bLate = bPunched.filter((d) => d.lateMinutes > 0).length;
      const bReview = bDays.filter((d) => d.status === "NEEDS_REVIEW").length;
      const headcount = headcountByBranch.get(b.id) ?? 0;
      const coveragePct =
        headcount > 0 ? Math.min(100, Math.round((bPunched.length / headcount) * 100)) : 0;

      return {
        id: b.id,
        name: b.name,
        headcount,
        clockedIn: bPunched.length,
        onDuty: bOnDuty,
        completed: bCompleted,
        late: bLate,
        review: bReview,
        coveragePct,
      };
    })
    .sort((a, b) => b.clockedIn - a.clockedIn || b.headcount - a.headcount);

  // 7-day trend aggregation
  const trendMap = new Map(
    sevenDayKeys.map((k) => [k, { key: k, total: 0, late: 0, workedMinutes: 0 }]),
  );
  for (const row of recentSevenDays) {
    const k = row.workDate.toISOString().slice(0, 10);
    const bucket = trendMap.get(k);
    if (!bucket) continue;
    bucket.total += 1;
    if (row.lateMinutes > 0) bucket.late += 1;
    bucket.workedMinutes += row.netWorkedMinutes;
  }
  const trendData = sevenDayKeys.map((k) => trendMap.get(k)!);
  const maxTrendTotal = Math.max(1, ...trendData.map((t) => t.total));
  const sevenDayTotalWorked = trendData.reduce((s, t) => s + t.workedMinutes, 0);
  const sevenDayAvgAttendance = Math.round(
    trendData.reduce((s, t) => s + t.total, 0) / trendData.length,
  );

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
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
              ? `Live operations, attendance coverage, and pending actions for ${branches[0]?.name}.`
              : `Live operations across ${branches.filter((b) => b.isActive).length} active branches and ${activeEmployeeCount} staff.`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/attendance?view=live"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs")}
          >
            <Clock className="size-3.5" />
            Live Floor
          </Link>
          <GeneralQrButton feedbackUrl={`${getEnv().NEXT_PUBLIC_APP_URL}/feedback`} />
        </div>
      </div>

      {/* Top 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        <Link href="/admin/attendance?view=live" className="block group">
          <StatCard
            className="transition-colors group-hover:border-primary/40"
            label="On Duty Now"
            value={String(onDutyCount)}
            badge={
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {clockedInTodayCount} clocked in
              </span>
            }
            subtext={`${completedCount} completed · ${activeEmployeeCount} active staff`}
            icon={ClipboardList}
            tone="good"
          />
        </Link>

        <Link href="/admin/attendance" className="block group">
          <StatCard
            className="transition-colors group-hover:border-primary/40"
            label="Punctuality Today"
            value={clockedInTodayCount > 0 ? `${onTimeRate}%` : "—"}
            badge={
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  lateCount > 0
                    ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                )}
              >
                {lateCount > 0 ? `${lateCount} late` : "All on time"}
              </span>
            }
            subtext={
              lateCount > 0
                ? `Avg ${avgLateMinutes}m late across ${lateCount} staff`
                : "No late arrivals today"
            }
            icon={Timer}
            tone={lateCount > 0 ? "brand" : "good"}
          />
        </Link>

        <Link href="/admin/attendance?tab=review" className="block group">
          <StatCard
            className="transition-colors group-hover:border-primary/40"
            label="Review Queue"
            value={String(totalPendingReviews)}
            badge={
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  totalPendingReviews > 0
                    ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                )}
              >
                {todayReviewCount} today
              </span>
            }
            subtext={
              totalPendingReviews > 0
                ? "Click to resolve flagged attendance"
                : "Queue is clear"
            }
            icon={AlertTriangle}
            tone={totalPendingReviews > 0 ? "critical" : "good"}
          />
        </Link>

        <Link href="/admin/leave" className="block group">
          <StatCard
            className="transition-colors group-hover:border-primary/40"
            label="Pending Leave"
            value={String(pendingLeaveCount)}
            badge={
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                {pendingLeaveCount === 0 ? "Up to date" : "Awaiting review"}
              </span>
            }
            subtext={
              failedOdooSyncCount > 0
                ? `${failedOdooSyncCount} failed Odoo syncs`
                : `${branches.filter((b) => b.isActive).length} active branches online`
            }
            icon={CalendarDays}
            tone="info"
          />
        </Link>
      </div>

      {/* Middle Row: Branch Attendance Snapshot + 7-Day Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Branch Coverage Table */}
        <Card className="lg:col-span-7 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Store className="size-4 text-primary" />
                Branch Coverage Today
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Clock-ins, active floor presence, and lateness by location.
              </CardDescription>
            </div>
            <CardAction>
              <Link
                href="/admin/attendance"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-xs")}
              >
                Full Report <ArrowUpRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 pt-0 pb-4">
            {branchStats.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                No active branches in scope.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {branchStats.map((b) => (
                  <Link
                    key={b.id}
                    href={`/admin/attendance?branchId=${b.id}`}
                    className="flex flex-col gap-1.5 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-foreground truncate">{b.name}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {b.clockedIn}/{b.headcount}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] tabular-nums shrink-0">
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {b.onDuty} on duty
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{b.completed} done</span>
                        {b.late > 0 && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              {b.late} late
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${b.coveragePct}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 7-Day Attendance & Punctuality Trend */}
        <Card className="lg:col-span-5 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <BarChart3 className="size-4 text-primary" />
              7-Day Attendance Trend
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Daily staff check-ins and late arrivals over the last week.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between pt-1 pb-4 gap-4">
            {/* Pure CSS Vertical Bar Chart */}
            <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4">
              {trendData.map((day) => {
                const totalHeightPct = Math.max(
                  day.total > 0 ? 12 : 4,
                  Math.round((day.total / maxTrendTotal) * 100),
                );
                const latePctOfBar =
                  day.total > 0 ? Math.round((day.late / day.total) * 100) : 0;
                const isToday = day.key === todayKey;

                return (
                  <Link
                    key={day.key}
                    href={`/admin/attendance?date=${day.key}`}
                    className="flex flex-col items-center gap-1.5 h-full justify-end group"
                    title={`${day.key}: ${day.total} clocked in, ${day.late} late`}
                  >
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground group-hover:text-foreground">
                      {day.total}
                    </span>
                    <div className="w-full max-w-8 flex-1 flex items-end">
                      <div
                        className={cn(
                          "w-full rounded-t-md overflow-hidden flex flex-col justify-end transition-all",
                          day.total === 0
                            ? "bg-muted/60"
                            : isToday
                              ? "bg-primary"
                              : "bg-primary/70 group-hover:bg-primary",
                        )}
                        style={{ height: `${totalHeightPct}%` }}
                      >
                        {day.late > 0 && (
                          <div
                            className="w-full bg-amber-500/90"
                            style={{ height: `${latePctOfBar}%` }}
                          />
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        isToday ? "text-foreground font-semibold" : "text-muted-foreground",
                      )}
                    >
                      {formatDayShort(day.key)}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Legend & 7-Day Summary */}
            <div className="space-y-3 pt-3 border-t border-border/40">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-primary" />
                    On time
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-amber-500" />
                    Late
                  </span>
                </div>
                <span className="tabular-nums font-medium text-foreground">
                  Avg {sevenDayAvgAttendance}/day
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">7-Day Net Hours</p>
                  <p className="text-sm font-bold tabular-nums text-foreground mt-0.5">
                    {formatHours(sevenDayTotalWorked)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Odoo Sync</p>
                  <p className="text-sm font-bold text-foreground mt-0.5 flex items-center gap-1.5">
                    {failedOdooSyncCount > 0 ? (
                      <span className="text-destructive">{failedOdooSyncCount} failed</span>
                    ) : (
                      <>
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        <span>Healthy</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Compact Recent Floor Activity (max 8) + Action Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Compact Recent Floor Activity */}
        <Card className="lg:col-span-7 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Clock className="size-4 text-primary" />
                Recent Floor Activity
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {clockedInTodayCount > 0
                  ? `Showing latest ${floorPreview.length} of ${clockedInTodayCount} staff clocked in today.`
                  : "Latest clock-ins and clock-outs for today."}
              </CardDescription>
            </div>
            <CardAction>
              <Link
                href="/admin/attendance?view=live"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-xs")}
              >
                View Live Floor <ArrowUpRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between pt-0 pb-4">
            {floorPreview.length === 0 ? (
              <div className="my-auto flex flex-col items-center justify-center rounded-xl bg-muted/30 border border-dashed border-border/60 py-10 px-4 text-center">
                <CalendarClock className="size-5 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold text-foreground">No staff clocked in yet</p>
                <p className="text-xs text-muted-foreground max-w-xs mt-1">
                  Punches will appear here as staff clock in.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {floorPreview.map((day) => {
                  const emp = employeeMap.get(day.employeeId);
                  const empName = emp?.name || "Staff Member";
                  const empCode = emp?.code;
                  const branchName = branchMap.get(day.branchId) || "Branch";
                  const isOnDuty = day.actualIn != null && day.actualOut == null;
                  const actualInTime = formatTimeAccra(day.actualIn);
                  const actualOutTime = formatTimeAccra(day.actualOut);
                  const source = sourceByEmp.get(day.employeeId);
                  const isTerminal = source === "FINGERPRINT";

                  return (
                    <Link
                      key={day.id}
                      href={`/admin/attendance/${day.employeeId}/${todayKey}`}
                      className="flex items-center justify-between py-2.5 px-2 -mx-2 hover:bg-muted/40 rounded-md transition-colors text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground truncate">{empName}</p>
                          {empCode && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">
                              {empCode}
                            </span>
                          )}
                          {source && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0"
                              title={isTerminal ? "Fingerprint terminal" : "Mobile app"}
                            >
                              {isTerminal ? (
                                <Fingerprint className="size-3" />
                              ) : (
                                <Smartphone className="size-3" />
                              )}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5 tabular-nums">
                          {branchName}
                          {actualInTime && ` · In ${actualInTime}`}
                          {actualOutTime && ` · Out ${actualOutTime}`}
                          {day.lateMinutes > 0 && ` · ${day.lateMinutes}m late`}
                        </p>
                      </div>

                      <div className="shrink-0">
                        {isOnDuty ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px]"
                          >
                            On duty
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[11px]"
                          >
                            Completed
                          </Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-border/40 text-xs mt-3 flex items-center justify-between">
              <Link
                href="/admin/attendance?view=live"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                View all {clockedInTodayCount} on Live Floor <ArrowRight className="size-3" />
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

        {/* Action Center: Needs Attention + Pending Leave */}
        <Card className="lg:col-span-5 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="size-4 text-amber-600" />
              Needs Attention
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Flagged attendance today and pending leave approvals.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between pt-0 pb-4 gap-5">
            {/* Top 5 Flagged / Late Today */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Attendance Exceptions Today
                </span>
                <Link
                  href="/admin/attendance?tab=review"
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Review Queue ({totalPendingReviews})
                </Link>
              </div>
              {attentionItems.length === 0 ? (
                <div className="rounded-lg bg-muted/30 py-4 px-3 text-xs text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span>No attendance exceptions or late arrivals today.</span>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {attentionItems.map((day) => {
                    const emp = employeeMap.get(day.employeeId);
                    const bName = branchMap.get(day.branchId) || "Branch";
                    return (
                      <Link
                        key={day.id}
                        href={`/admin/attendance/${day.employeeId}/${todayKey}`}
                        className="flex items-center justify-between py-2 px-2 -mx-2 rounded-md hover:bg-muted/40 transition-colors text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-foreground truncate">
                            {emp?.name || "Staff Member"}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{bName}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {day.lateMinutes > 0 && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-[10px]"
                            >
                              {day.lateMinutes}m late
                            </Badge>
                          )}
                          {day.status === "NEEDS_REVIEW" && (
                            <Badge
                              variant="outline"
                              className="border-destructive/30 bg-destructive/10 text-destructive text-[10px]"
                            >
                              Review
                            </Badge>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pending Leave Requests */}
            <div className="pt-3 border-t border-border/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pending Leave Requests
                </span>
                <Link
                  href="/admin/leave"
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  View all ({pendingLeaveCount})
                </Link>
              </div>
              {pendingLeaveRequests.length === 0 ? (
                <div className="rounded-lg bg-muted/30 py-3.5 px-3 text-xs text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span>No pending leave requests.</span>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {pendingLeaveRequests.map((req) => (
                    <Link
                      key={req.id}
                      href="/admin/leave"
                      className="flex items-center justify-between py-2 px-2 -mx-2 rounded-md hover:bg-muted/40 transition-colors text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-medium text-foreground truncate">
                          {req.employee.firstName} {req.employee.lastName}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {req.branch?.name ?? "Branch"} · {formatShortDate(req.startDate)} –{" "}
                          {formatShortDate(req.endDate)}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                        {req.type.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
