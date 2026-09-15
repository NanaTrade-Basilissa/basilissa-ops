import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { can, hasAnyPermission, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { createShift } from "@/lib/modules/employees/actions";
import { getWeeklyBranchSchedule, listShifts } from "@/lib/modules/employees/server";
import { minutesToTime } from "@/lib/modules/employees/validation";
import { prisma } from "@/lib/platform/prisma";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ShiftDialog } from "@/components/admin/shift-dialog";
import { ShiftsTable } from "@/components/admin/shifts-table";
import { WeeklyScheduleGrid } from "@/components/admin/weekly-schedule-grid";
import { ScheduleBranchSelect } from "@/components/admin/schedule-branch-select";
import { ScheduleCopyWeekDialog } from "@/components/admin/schedule-copy-week-dialog";
import { ScheduleBulkAssignDialog } from "@/components/admin/schedule-bulk-assign-dialog";
import { accraDateKey, getAccraWeekStart, shiftDateKey } from "@/lib/platform/date";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Shifts & Schedule" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tab?: string; branchId?: string; week?: string }>;

export default async function ShiftsPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor, scope } = await requireAnyBranchPermission("schedule:read");
  const canWriteAny = hasAnyPermission(actor, "schedule:write");
  const allowGlobal = can(actor, "schedule:write");

  const raw = await searchParams;
  const activeTab = raw.tab === "templates" ? "templates" : "schedule";

  const branchFilter =
    scope.kind === "branches"
      ? { id: { in: scope.branchIds } }
      : scope.kind === "none"
        ? { id: { in: [] } }
        : undefined;

  const [shifts, branches, allBranchesForNames] = await Promise.all([
    listShifts(scope),
    prisma.branch.findMany({
      where: branchFilter,
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({ select: { id: true, name: true } }),
  ]);
  const branchName = new Map(allBranchesForNames.map((b) => [b.id, b.name]));
  const assignableBranches = branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }));
  const canCreate = canWriteAny && (allowGlobal || assignableBranches.length > 0);

  // Week resolution
  const currentWeekStart = accraDateKey(getAccraWeekStart(new Date()));
  const weekStartKey = raw.week && /^\d{4}-\d{2}-\d{2}$/.test(raw.week) ? raw.week : currentWeekStart;
  const prevWeekKey = shiftDateKey(weekStartKey, -7);
  const nextWeekKey = shiftDateKey(weekStartKey, 7);

  // Formatted week header (e.g. "7 Sep – 13 Sep 2026")
  const weekEndKey = shiftDateKey(weekStartKey, 6);
  const [sY, sM, sD] = weekStartKey.split("-").map(Number);
  const [eY, eM, eD] = weekEndKey.split("-").map(Number);
  const sDate = new Date(Date.UTC(sY!, sM! - 1, sD!));
  const eDate = new Date(Date.UTC(eY!, eM! - 1, eD!));
  const formattedWeek = `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(sDate)} – ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(eDate)}`;

  // Selected branch for weekly schedule
  const selectedBranchId = raw.branchId || (branches[0]?.id ?? "");

  // Load weekly schedule if on schedule tab
  const weeklyData =
    activeTab === "schedule" && selectedBranchId
      ? await getWeeklyBranchSchedule(scope, selectedBranchId, weekStartKey)
      : null;

  const canManageBranch =
    canWriteAny &&
    (allowGlobal || (selectedBranchId ? can(actor, "schedule:write", { branchId: selectedBranchId }) : false));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {activeTab === "schedule" ? "Weekly Schedule" : "Shift Templates"}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {activeTab === "schedule"
              ? "Plan and manage weekly rotas, shift coverage, and day-to-day staff overrides."
              : "Reusable templates, resolved against each branch's timezone."}
          </p>
        </div>
        {activeTab === "templates" && canCreate && (
          <ShiftDialog
            action={createShift}
            branches={assignableBranches}
            allowGlobal={allowGlobal}
            submitLabel="Create shift"
            title="New shift"
            description="Reusable templates, resolved against each branch's timezone."
            trigger={
              <Button>
                <Plus className="size-4" />
                New shift
              </Button>
            }
          />
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <Link
          href={`/admin/shifts?tab=schedule${selectedBranchId ? `&branchId=${selectedBranchId}` : ""}&week=${weekStartKey}`}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "schedule"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Weekly Rota
        </Link>
        <Link
          href="/admin/shifts?tab=templates"
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "templates"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Shift Templates
        </Link>
      </div>

      {activeTab === "schedule" ? (
        <div className="space-y-4">
          {/* Schedule controls bar */}
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
            {branches.length > 1 ? (
              <ScheduleBranchSelect
                branches={branches}
                selectedBranchId={selectedBranchId}
                week={weekStartKey}
              />
            ) : branches.length === 1 ? (
              <div className="space-y-1.5 min-w-44">
                <span className="text-xs font-medium text-muted-foreground">Branch</span>
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium text-foreground">
                  {branches[0].name}
                </div>
              </div>
            ) : null}

            {/* Week navigation */}
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/shifts?tab=schedule&branchId=${selectedBranchId}&week=${prevWeekKey}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                title="Previous week"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <div className="text-center min-w-44 px-1">
                <div className="text-sm font-bold text-foreground">
                  {formattedWeek}
                </div>
                {weekStartKey === currentWeekStart && (
                  <span className="inline-block text-[11px] font-medium text-primary">
                    Current week
                  </span>
                )}
              </div>
              <Link
                href={`/admin/shifts?tab=schedule&branchId=${selectedBranchId}&week=${nextWeekKey}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                title="Next week"
              >
                <ChevronRight className="size-4" />
              </Link>
              {weekStartKey !== currentWeekStart && (
                <Link
                  href={`/admin/shifts?tab=schedule&branchId=${selectedBranchId}&week=${currentWeekStart}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  This week
                </Link>
              )}
            </div>

            {/* Quick schedule management actions */}
            {canManageBranch && weeklyData && (
              <div className="flex flex-wrap items-center gap-2">
                <ScheduleCopyWeekDialog
                  branchId={selectedBranchId}
                  branchName={weeklyData.branchName}
                  activeWeekStart={weekStartKey}
                />
                <ScheduleBulkAssignDialog
                  branchId={selectedBranchId}
                  branchName={weeklyData.branchName}
                  employees={weeklyData.employees.map((e) => ({
                    id: e.employeeId,
                    name: e.name,
                    employeeCode: e.employeeCode,
                  }))}
                  shifts={weeklyData.shifts}
                  activeWeekStart={weekStartKey}
                />
              </div>
            )}
          </div>

          {weeklyData ? (
            <WeeklyScheduleGrid data={weeklyData} canManage={canManageBranch} />
          ) : (
            <Empty className="border py-12">
              <EmptyMedia variant="icon">
                <CalendarClock className="size-4" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No branch selected</EmptyTitle>
                <EmptyDescription>
                  Select a branch above to view and manage its weekly shift schedule.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      ) : shifts.length === 0 ? (
        <Empty className="border py-12">
          <EmptyMedia variant="icon">
            <CalendarClock className="size-4" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No shifts defined yet</EmptyTitle>
            <EmptyDescription>
              Without a shift template, attendance is recorded but flagged unscheduled with nothing to measure lateness or overtime against.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ShiftsTable
          branches={assignableBranches}
          allowGlobal={allowGlobal}
          shifts={shifts.map((shift) => ({
            id: shift.id,
            name: shift.name,
            isActive: shift.isActive,
            hoursLabel: `${minutesToTime(shift.startMinute)}–${minutesToTime(shift.endMinute)}`,
            overnight: shift.endMinute <= shift.startMinute,
            breakLabel: shift.unpaidBreakMinutes === 0 ? "-" : `${shift.unpaidBreakMinutes}m`,
            branchLabel: shift.branchId ? (branchName.get(shift.branchId) ?? "Unknown") : "All branches",
            assignmentCount: shift._count.assignments,
            canEdit:
              canWriteAny &&
              (shift.branchId === null
                ? allowGlobal
                : can(actor, "schedule:write", { branchId: shift.branchId })),
            branchId: shift.branchId ?? "",
            startTime: minutesToTime(shift.startMinute),
            endTime: minutesToTime(shift.endMinute),
            unpaidBreakMinutes: shift.unpaidBreakMinutes,
          }))}
        />
      )}
    </div>
  );
}
