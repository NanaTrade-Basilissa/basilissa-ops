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
  CalendarClock,
  ShieldCheck,
  ArrowRight,
  BookA,
} from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission, branchScope, isSuperAdmin, getEmailQueueStats, listEmailJobs } from "@/lib/modules/identity/server";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { MobileClockInDialog } from "@/components/admin/mobile-clock-in-dialog";
import { GeneralQrButton } from "@/components/admin/general-qr-button";
import { DashboardJobsCard } from "@/components/admin/dashboard-jobs-card";
import { getEnv } from "@/lib/platform/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Operations Dashboard" };
export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  const actor = await requirePermission("admin:access");
  const isSuperAdminUser = isSuperAdmin(actor);
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
    jobStats,
    recentJobs,
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
      take: 3,
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
    isSuperAdminUser ? getEmailQueueStats() : Promise.resolve(null),
    isSuperAdminUser ? listEmailJobs({ pageSize: 6 }) : Promise.resolve(null),
  ]);

  // Lookup maps for fast join resolution
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
            {isSuperAdminUser && jobStats && jobStats.dead > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                <span className="size-1.5 rounded-full bg-rose-500 animate-ping" />
                {jobStats.dead} Failed Job{jobStats.dead > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {attScope.kind === "branches" && branches.length === 1
              ? `Operational overview and live status for ${branches[0]?.name}.`
              : "Consolidated operational oversight across all branch facilities."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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

      {/* Top 4 Equal-Height Executive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        <StatCard
          label="Today's Attendance"
          value={scheduledCount > 0 ? String(onDutyCount) : "0"}
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              {scheduledCount > 0 ? `${Math.round((onDutyCount / scheduledCount) * 100)}% on duty` : "No shifts"}
            </span>
          }
          subtext={
            scheduledCount > 0
              ? `${completedCount} completed · ${scheduledCount} scheduled`
              : "No scheduled shifts today"
          }
          icon={ClipboardList}
          tone="good"
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
          label="Customer Rating (30d)"
          value={avgScore != null ? `${avgScore}` : "—"}
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              ★ CSAT
            </span>
          }
          subtext={`${feedbackStats._count.id} submissions recorded`}
          icon={Star}
          tone="brand"
        />

        <StatCard
          label="Branch Network"
          value={String(activeBranches.length)}
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
              {geofencedBranches.length} geofenced
            </span>
          }
          subtext={`${branches.length} total operational locations`}
          icon={Store}
          tone="default"
        />
      </div>

      {/* Row 1: Live Attendance Floor & Customer Feedback (Strictly Equal Heights) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Card 1: Today's Shift & Live Floor */}
        <Card className="flex flex-col justify-between h-full">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Clock className="size-4 text-primary" />
                Today&apos;s Attendance & Floor Status
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time staff clock-ins and shift tracking for {todayKey}.
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
            <div className="grid grid-cols-3 gap-2.5 py-1">
              <div className="rounded-xl bg-slate-50/90 p-2.5 border-b border-emerald-900">
                <div className="text-[11px] text-muted-foreground font-medium">On Duty</div>
                <div className="text-base font-bold text-foreground mt-0.5">{onDutyCount}</div>
              </div>
              <div className="rounded-xl bg-slate-50/90 p-2.5 border-b border-blue-900">
                <div className="text-[11px] text-muted-foreground font-medium">Completed</div>
                <div className="text-base font-bold text-foreground mt-0.5">{completedCount}</div>
              </div>
              <div className="rounded-xl bg-slate-50/90 p-2.5 border-b border-amber-900">
                <div className="text-[11px] text-muted-foreground font-medium">Exceptions</div>
                <div className="text-base font-bold text-foreground mt-0.5">{exceptionCount}</div>
              </div>
            </div>

            {/* Empty State or Clean Roster List */}
            {todayAttendanceDays.length === 0 ? (
              <div className="my-auto flex flex-col items-center justify-center rounded-xl bg-slate-50/50 border border-dashed border-border/60 py-8 px-4 text-center">
                <div className="flex size-10 items-center justify-center rounded-xl bg-background border border-border/50 text-primary mb-3">
                  <CalendarClock className="size-5" />
                </div>
                <p className="text-sm font-semibold text-foreground">No staff clocked in yet today</p>
                <p className="text-xs text-muted-foreground max-w-xs mt-1 leading-relaxed">
                  Attendance punches will appear here in real time as staff clock in at branch terminals or via mobile.
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
                    View Shift Rota &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/40 my-auto">
                {todayAttendanceDays.slice(0, 4).map((day) => {
                  const empName = employeeMap.get(day.employeeId) || "Staff Member";
                  const branchName = branchMap.get(day.branchId) || "Branch";
                  const isOnDuty = day.actualIn != null && day.actualOut == null;
                  const isCompleted = day.actualOut != null;

                  return (
                    <div
                      key={day.id}
                      className="flex items-center justify-between py-2.5 px-1 hover:bg-muted/30 rounded-md transition-colors text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-medium text-foreground truncate">{empName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{branchName}</p>
                      </div>

                      <div className="shrink-0">
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
              </div>
            )}

            {/* Clean Footer Link */}
            <div className="pt-3 border-t border-border/40 text-xs">
              <Link
                href="/admin/attendance"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Go to Attendance Hub <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Customer Experience (CSAT) */}
        <Card className="flex flex-col justify-between h-full">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <MessageSquareText className="size-4 text-primary" />
                Customer Experience (CSAT)
              </CardTitle>
              <CardDescription className="text-xs">
                Customer satisfaction and survey feedback across branches (last 30 days).
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between pt-1 pb-4">
            {/* Score Highlight Pod */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50/90 p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                  <Star className="size-5 fill-amber-500 text-amber-500" />
                </div>
                <div>
                  <div className="text-xl font-bold tracking-tight text-foreground leading-none">
                    {avgScore != null ? `${avgScore} / 5.0` : "No ratings"}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Average Satisfaction Score</p>
                </div>
              </div>

              <Link
                href="/admin/feedback/all"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs h-8 bg-card")}
              >
                All Submissions ({feedbackStats._count.id})
              </Link>
            </div>

            {/* Recent feedback comments list (clean dividers, no boxes) */}
            <div className="my-auto">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                Recent Submissions
              </p>
              {recentFeedbacks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No feedback recorded yet.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {recentFeedbacks.map((f) => (
                    <div key={f.id} className="flex items-center justify-between py-2 px-1 text-xs">
                      <span className="font-medium text-foreground truncate max-w-[240px]">
                        {f.branch.name}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-500 shrink-0">
                        <Star className="size-3 fill-amber-500" /> {f.overallScore}/5
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clean Footer Link */}
            <div className="pt-3 border-t border-border/40 text-xs">
              <Link
                href="/admin/feedback"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                View detailed feedback analytics <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Branch Network Summary & Talent Pipeline (Strictly Equal Heights) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Card 3: Branch Operational Network (Summary of top branches, NOT all 12) */}
        <Card className="flex flex-col justify-between h-full">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Store className="size-4 text-primary" />
                Branch Operational Network
              </CardTitle>
              <CardDescription className="text-xs">
                Active locations and geofence enforcement status.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between pt-1 pb-4">
            {/* Network KPI Pills */}
            <div className="flex items-center gap-4 py-2 border-b border-border/40 text-xs">
              <span className="font-medium text-foreground">
                <strong className="text-foreground font-semibold">{activeBranches.length}</strong> Operating Hubs
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-muted-foreground">
                <strong className="text-foreground font-semibold">{geofencedBranches.length}</strong> Geofence Protected
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-muted-foreground">
                <strong className="text-foreground font-semibold">{branches.length}</strong> Total
              </span>
            </div>

            {/* Top 3-4 Key Branches Preview (Clean rows with dividers, NOT 12 boxes) */}
            <div className="divide-y divide-border/40 my-auto">
              {branches.slice(0, 4).map((branch) => (
                <div
                  key={branch.id}
                  className="flex items-center justify-between py-2.5 px-1 text-xs hover:bg-muted/30 rounded-md transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground truncate">{branch.name}</span>
                      {branch.isActive && (
                        <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" title="Active" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {branch._count.employees} staff assigned
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {branch.geofenceEnabled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="size-3.5" /> {branch.geofenceRadiusMeters}m fence
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No fence</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Clean Footer Link */}
            <div className="pt-3 border-t border-border/40 text-xs">
              <Link
                href="/admin/branches"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                View all {branches.length} branches <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Workforce & Talent Pipeline */}
        <Card className="flex flex-col justify-between h-full">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Brain className="size-4 text-primary" />
                Workforce & Talent Pipeline
              </CardTitle>
              <CardDescription className="text-xs">
                Internal employee development and pre-hire screening evaluations.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between pt-1 pb-4">
            {/* Two Balanced Talent Pods */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-auto">
              {/* Staff Assessments Pod */}
              <div className="rounded-xl bg-slate-50/90 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <BookA className="size-3.5 text-primary" /> Staff Assessments
                  </div>
                  <div className="text-2xl font-bold text-foreground mt-2 tracking-tight">
                    {assessmentsCount}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Active published templates</p>
                </div>
                <div className="pt-3">
                  <Link
                    href="/admin/assessments"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View assessments <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>

              {/* Aptitude Testing Pod */}
              <div className="rounded-xl bg-slate-50/90 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Brain className="size-3.5 text-primary" /> Aptitude Tests
                  </div>
                  <div className="text-2xl font-bold text-foreground mt-2 tracking-tight">
                    {aptitudeTestsCount}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {aptitudeAttemptsCount} candidate attempts
                  </p>
                </div>
                <div className="pt-3">
                  <Link
                    href="/admin/aptitude-tests"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View candidate pipeline <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Clean Footer Link */}
            <div className="pt-3 border-t border-border/40 text-xs">
              <Link
                href="/admin/employees"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Manage employee directory ({activeEmployeeCount} active) <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Super Admin Section: Background and System Jobs */}
      {isSuperAdminUser && jobStats && recentJobs && (
        <DashboardJobsCard stats={jobStats} jobs={recentJobs.jobs} />
      )}
    </div>
  );
}
