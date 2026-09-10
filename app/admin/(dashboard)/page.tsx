import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  Users,
  Store,
  Star,
  MessageSquareText,
  Clock,
  ArrowUpRight,
  Brain,
  CalendarCheck,
  ShieldCheck,
  Sparkles,
  Book,
} from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission, branchScope } from "@/lib/modules/identity/server";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { MobileClockInDialog } from "@/components/admin/mobile-clock-in-dialog";
import { GeneralQrButton } from "@/components/admin/general-qr-button";
import { getEnv } from "@/lib/platform/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Operations Dashboard" };
export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  const actor = await requirePermission("admin:access");
  const attScope = branchScope(actor, "attendance:read");
  const feedScope = branchScope(actor, "feedback:read");

  const now = new Date();
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const branchWhere =
    attScope.kind === "branches"
      ? { id: { in: attScope.branchIds } }
      : attScope.kind === "none"
        ? { id: { in: [] } }
        : undefined;

  const feedbackWhere = {
    submittedAt: { gte: thirtyDaysAgo },
    ...(feedScope.kind === "branches"
      ? { branchId: { in: feedScope.branchIds } }
      : feedScope.kind === "none"
        ? { branchId: { in: [] } }
        : {}),
  };

  // Parallel data fetching across all operations domains
  const [
    branches,
    activeEmployeeCount,
    todayAttendanceDays,
    feedbackStats,
    recentFeedbacks,
    assessmentsCount,
    aptitudeTestsCount,
    aptitudeAttemptsCount,
    employeesForDialog,
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
    prisma.feedbackSubmission.aggregate({
      where: feedbackWhere,
      _avg: { overallScore: true },
      _count: { id: true },
    }),
    prisma.feedbackSubmission.findMany({
      where: feedbackWhere,
      orderBy: { submittedAt: "desc" },
      take: 4,
      select: {
        id: true,
        overallScore: true,
        submittedAt: true,
        branch: { select: { name: true } },
      },
    }),
    prisma.assessment.count({ where: { status: "PUBLISHED" } }).catch(() => 0),
    prisma.aptitudeTest.count({ where: { status: "PUBLISHED" } }).catch(() => 0),
    prisma.aptitudeAttempt.count({ where: { submittedAt: { not: null } } }).catch(() => 0),
    prisma.employee.findMany({
      where: {
        status: "ACTIVE",
        ...(attScope.kind === "branches"
          ? { branchAssignments: { some: { branchId: { in: attScope.branchIds } } } }
          : attScope.kind === "none"
            ? { id: { in: [] } }
            : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        branchAssignments: { select: { branchId: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 50,
    }),
  ]);

  // Lookup maps for fast, type-safe join resolution
  const employeeMap = new Map(
    employeesForDialog.map((e) => [e.id, `${e.firstName} ${e.lastName}`]),
  );
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));

  // Attendance metrics breakdown
  const scheduledCount = todayAttendanceDays.length;
  const onDutyCount = todayAttendanceDays.filter((d) => d.actualIn != null && d.actualOut == null).length;
  const completedCount = todayAttendanceDays.filter((d) => d.actualOut != null).length;
  const exceptionCount = todayAttendanceDays.filter((d) => !d.settledAt && d.flags.length > 0).length;

  const avgScore = feedbackStats._avg.overallScore
    ? Math.round(feedbackStats._avg.overallScore * 10) / 10
    : null;

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Operations Dashboard</h1>
            <Badge variant="outline" className="hidden sm:inline-flex text-[11px]">
              {todayKey} (Accra)
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {attScope.kind === "branches" && branches.length === 1
              ? `Real-time branch operations for ${branches[0]?.name}.`
              : "Consolidated operational oversight across all branch facilities."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MobileClockInDialog
            branches={branches.map((b) => ({
              id: b.id,
              name: b.name,
              latitude: b.latitude,
              longitude: b.longitude,
              geofenceRadiusMeters: b.geofenceRadiusMeters,
              geofenceEnabled: b.geofenceEnabled,
            }))}
            employees={employeesForDialog.map((e) => ({
              id: e.id,
              name: `${e.firstName} ${e.lastName}`,
              employeeCode: e.employeeCode,
              branchIds: e.branchAssignments.map((a) => a.branchId),
            }))}
          />
          <GeneralQrButton feedbackUrl={`${getEnv().NEXT_PUBLIC_APP_URL}/feedback`} />
        </div>
      </div>

      {/* Top 4 Executive KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today's Attendance"
          value={scheduledCount > 0 ? `${onDutyCount} On Duty` : "No Shifts"}
          subtext={
            scheduledCount > 0
              ? `${completedCount} completed · ${scheduledCount} scheduled`
              : "No scheduled shifts today"
          }
          icon={ClipboardList}
          tone={onDutyCount > 0 ? "good" : "default"}
        />

        <StatCard
          label="Active Workforce"
          value={`${activeEmployeeCount} Employees`}
          subtext={`Across ${branches.length} ${branches.length === 1 ? "branch" : "branches"}`}
          icon={Users}
        />

        <StatCard
          label="Customer Rating (30d)"
          value={avgScore != null ? `${avgScore} / 5` : "No feedback"}
          subtext={`${feedbackStats._count.id} submissions recorded`}
          icon={Star}
          tone={avgScore && avgScore >= 4 ? "good" : "default"}
        />

        <StatCard
          label="Branch Network"
          value={`${branches.filter((b) => b.isActive).length} Active`}
          subtext={`${branches.filter((b) => b.geofenceEnabled).length} with GPS geofencing`}
          icon={Store}
        />
      </div>

      {/* Main Operations Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Live Attendance Floor & Branch Network */}
        <div className="space-y-6">
          {/* Today's Shift & Live Floor Glance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Clock className="size-4 text-primary" />
                  Today&apos;s Attendance & Floor Status
                </CardTitle>
                <CardDescription className="text-xs">
                  Real-time clock-ins and scheduled shift tracking for {todayKey}.
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
            <CardContent className="space-y-4">
              {/* Floor Status Summary Badges */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span>{onDutyCount} On Duty</span>
                </div>
                <span className="text-muted-foreground/40">•</span>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-blue-500" />
                  <span>{completedCount} Completed</span>
                </div>
                <span className="text-muted-foreground/40">•</span>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-amber-500" />
                  <span>{exceptionCount} Exceptions</span>
                </div>
              </div>

              {/* Roster list preview */}
              {todayAttendanceDays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <CalendarCheck className="size-8 stroke-[1.5] text-muted-foreground/50 mb-2" />
                  <p className="text-xs font-medium">No shifts recorded yet today.</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                    Punches will populate automatically when staff clock in.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayAttendanceDays.slice(0, 5).map((day) => {
                    const empName = employeeMap.get(day.employeeId) || "Staff Member";
                    const branchName = branchMap.get(day.branchId) || "Branch";
                    const isOnDuty = day.actualIn != null && day.actualOut == null;
                    const isCompleted = day.actualOut != null;

                    return (
                      <div
                        key={day.id}
                        className="flex items-center justify-between rounded-md border border-border/50 p-2.5 text-xs hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground truncate">
                            {empName}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {branchName}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isOnDuty ? (
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px]">
                              On duty
                            </Badge>
                          ) : isCompleted ? (
                            <Badge variant="outline" className="border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[10px]">
                              Completed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {day.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {todayAttendanceDays.length > 5 && (
                    <div className="text-center pt-1">
                      <Link href="/admin/attendance" className="text-[11px] font-medium text-primary hover:underline">
                        + {todayAttendanceDays.length - 5} more staff records in Attendance Hub →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Branch Network Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Store className="size-4 text-primary" />
                  Branch Network
                </CardTitle>
                <CardDescription className="text-xs">
                  Active operating locations and GPS geofence configuration.
                </CardDescription>
              </div>
              <CardAction>
                <Link
                  href="/admin/branches"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-xs")}
                >
                  Manage <ArrowUpRight className="size-3.5" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="flex items-center justify-between rounded-md border border-border/50 p-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground flex items-center gap-1.5 truncate">
                        <span>{branch.name}</span>
                        {branch.isActive && (
                          <span className="inline-block size-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {branch._count.employees} staff assigned
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-right">
                      {branch.geofenceEnabled ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <ShieldCheck className="size-3.5" /> {branch.geofenceRadiusMeters}m fence
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">No geofence</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Customer Feedback & HR Assessments */}
        <div className="space-y-6">
          {/* Customer Feedback Highlights */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <MessageSquareText className="size-4 text-primary" />
                  Customer Experience (CSAT)
                </CardTitle>
                <CardDescription className="text-xs">
                  Latest customer sentiment across branches over the last 30 days.
                </CardDescription>
              </div>
              <CardAction>
                <Link
                  href="/admin/feedback"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-xs")}
                >
                  Feedback Hub <ArrowUpRight className="size-3.5" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Rating Snapshot Banner */}
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Star className="size-5 fill-amber-500 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-foreground leading-none">
                      {avgScore != null ? `${avgScore} / 5.0` : "No ratings"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Average Satisfaction Score</div>
                  </div>
                </div>

                <Link
                  href="/admin/feedback/all"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs h-8")}
                >
                  All Submissions ({feedbackStats._count.id})
                </Link>
              </div>

              {/* Recent customer submissions */}
              {recentFeedbacks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No recent feedback recorded.</p>
              ) : (
                <div className="space-y-2">
                  {recentFeedbacks.map((f) => (
                    <div key={f.id} className="rounded-md border border-border/50 p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-foreground truncate">{f.branch.name}</div>
                        <div className="flex items-center gap-1 text-amber-500 font-semibold text-xs">
                          <Star className="size-3 fill-amber-500" /> {f.overallScore}/5
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* HR, Talent & Assessments Overview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Brain className="size-4 text-primary" />
                  HR & Talent Evaluation
                </CardTitle>
                <CardDescription className="text-xs">
                  Active staff performance assessments and candidate testing pipelines.
                </CardDescription>
              </div>
              <CardAction>
                <Link
                  href="/admin/aptitude-tests"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-xs")}
                >
                  Aptitude <ArrowUpRight className="size-3.5" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border/60 p-3 space-y-1">
                  <div className="text-muted-foreground font-medium flex items-center gap-1.5 text-[11px]">
                    <Book className="size-3.5 text-primary" /> Staff Assessments
                  </div>
                  <div className="text-xl font-bold text-foreground">{assessmentsCount}</div>
                  <div className="text-[11px] text-muted-foreground">Active templates configured</div>
                  <div className="pt-2">
                    <Link
                      href="/admin/assessments"
                      className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      View assessments &rarr;
                    </Link>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 p-3 space-y-1">
                  <div className="text-muted-foreground font-medium flex items-center gap-1.5 text-[11px]">
                    <Brain className="size-3.5 text-primary" /> Aptitude Tests
                  </div>
                  <div className="text-xl font-bold text-foreground">{aptitudeTestsCount}</div>
                  <div className="text-[11px] text-muted-foreground">{aptitudeAttemptsCount} completed attempts</div>
                  <div className="pt-2">
                    <Link
                      href="/admin/aptitude-tests"
                      className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      View candidates &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
