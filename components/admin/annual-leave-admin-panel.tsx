"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarOff,
  CalendarRange,
  Check,
  Clock,
  Play,
  RotateCcw,
  ShieldAlert,
  Users,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  saveLeaveCycleAction,
  runAutoSchedulerAction,
  reverseAutoSchedulerAction,
  saveBranchQuotaAction,
} from "@/lib/modules/attendance/actions";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

interface CalendarWeekOption {
  isoWeek: string;
  weekNumber: number;
  label: string;
  monthIndex: number;
}

/**
 * Generates the 52 ISO weeks for a year, grouped by the month each week primarily belongs to.
 */
function buildYearWeeksByMonth(year: number): { monthIndex: number; monthName: string; shortName: string; weeks: CalendarWeekOption[] }[] {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);

  const byMonth: CalendarWeekOption[][] = Array.from({ length: 12 }, () => []);

  for (let w = 1; w <= 52; w++) {
    const start = new Date(week1Monday.getTime() + (w - 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);
    const thu = new Date(start.getTime() + 3 * 86400000);

    const monthIndex = thu.getUTCFullYear() === year ? thu.getUTCMonth() : start.getUTCMonth();
    const startLabel = `${SHORT_MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
    const endLabel =
      start.getUTCMonth() === end.getUTCMonth()
        ? `${end.getUTCDate()}`
        : `${SHORT_MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;

    byMonth[monthIndex].push({
      isoWeek: `${year}-W${String(w).padStart(2, "0")}`,
      weekNumber: w,
      label: `${startLabel}–${endLabel}`,
      monthIndex,
    });
  }

  return MONTH_NAMES.map((monthName, monthIndex) => ({
    monthIndex,
    monthName,
    shortName: SHORT_MONTHS[monthIndex],
    weeks: byMonth[monthIndex],
  }));
}

interface AnnualLeaveAdminPanelProps {
  currentCycle: {
    id: string;
    year: number;
    title: string | null;
    status: "UPCOMING" | "OPEN" | "AUTO_SCHEDULING" | "FINALIZED";
    windowStartStr: string;
    windowEndStr: string;
    blackoutWeeks: string[];
    autoScheduledAt: string | null;
    autoScheduledCount: number;
    totalEligible: number;
    fullyScheduledCount: number;
    partiallyScheduledCount: number;
    unscheduledCount: number;
  } | null;
  branches: {
    id: string;
    name: string;
    quotas: Record<string, number>;
    jobTitles: { name: string; staffCount: number }[];
  }[];
  canManage: boolean;
}

export function AnnualLeaveAdminPanel({
  currentCycle,
  branches,
  canManage,
}: AnnualLeaveAdminPanelProps) {
  const [isPending, startTransition] = useTransition();

  // Cycle form state
  const [cycleYear, setCycleYear] = useState(currentCycle?.year ?? new Date().getFullYear() + 1);
  const [cycleTitle, setCycleTitle] = useState(currentCycle?.title ?? "");
  const [windowStart, setWindowStart] = useState(currentCycle?.windowStartStr ?? "");
  const [windowEnd, setWindowEnd] = useState(currentCycle?.windowEndStr ?? "");
  const [cycleStatus, setCycleStatus] = useState(currentCycle?.status ?? "OPEN");
  const [blackoutWeeks, setBlackoutWeeks] = useState<string[]>(currentCycle?.blackoutWeeks ?? []);

  // Active month selected in the blackout calendar (defaults to December or first month with blackouts)
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(() => {
    const initialMonths = buildYearWeeksByMonth(currentCycle?.year ?? new Date().getFullYear() + 1);
    const set = new Set(currentCycle?.blackoutWeeks ?? []);
    const withBlackout = initialMonths.find((m) => m.weeks.some((w) => set.has(w.isoWeek)));
    return withBlackout ? withBlackout.monthIndex : 11;
  });

  // Active branch selected in the quotas card
  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id ?? "");

  const monthsWithWeeks = useMemo(() => buildYearWeeksByMonth(cycleYear), [cycleYear]);
  const blackoutSet = useMemo(() => new Set(blackoutWeeks), [blackoutWeeks]);
  const activeMonth = monthsWithWeeks[selectedMonthIndex] ?? monthsWithWeeks[0];
  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? branches[0] ?? null;

  // Local quota cache: branchId -> { normalizedJobTitleKey -> number }
  const [localQuotas, setLocalQuotas] = useState<Record<string, Record<string, number>>>(() => {
    const initial: Record<string, Record<string, number>> = {};
    for (const b of branches) {
      initial[b.id] = {};
      for (const jt of b.jobTitles) {
        const key = jt.name.trim().toLowerCase();
        initial[b.id][key] = b.quotas[key] ?? 1;
      }
    }
    return initial;
  });

  // Auto-Scheduler Confirmation & Undo Dialogs
  const [isAutoScheduleOpen, setIsAutoScheduleOpen] = useState(false);
  const [isReverseAutoScheduleOpen, setIsReverseAutoScheduleOpen] = useState(false);

  const remainingToSchedule = currentCycle
    ? currentCycle.partiallyScheduledCount + currentCycle.unscheduledCount
    : 0;

  function toggleWeek(isoWeek: string) {
    setBlackoutWeeks((prev) =>
      prev.includes(isoWeek) ? prev.filter((w) => w !== isoWeek) : [...prev, isoWeek].sort(),
    );
  }

  function toggleMonth(monthWeeks: CalendarWeekOption[]) {
    const monthIsoWeeks = monthWeeks.map((w) => w.isoWeek);
    const allBlocked = monthIsoWeeks.every((w) => blackoutSet.has(w));
    setBlackoutWeeks((prev) => {
      if (allBlocked) {
        const removeSet = new Set(monthIsoWeeks);
        return prev.filter((w) => !removeSet.has(w));
      }
      return Array.from(new Set([...prev, ...monthIsoWeeks])).sort();
    });
  }

  function handleSaveCycle() {
    if (!windowStart || !windowEnd) {
      toast.error("Please enter both window start and end dates.");
      return;
    }

    startTransition(async () => {
      const res = await saveLeaveCycleAction({
        id: currentCycle?.id,
        year: cycleYear,
        title: cycleTitle || undefined,
        windowStart,
        windowEnd,
        blackoutWeeks,
        status: cycleStatus,
      });

      if (res.ok) {
        toast.success("Annual leave cycle saved.");
      } else {
        toast.error(res.error || "Failed to save cycle.");
      }
    });
  }

  function handleRunAutoScheduler() {
    if (!currentCycle) return;
    startTransition(async () => {
      const res = await runAutoSchedulerAction(currentCycle.id);
      if (res.ok) {
        toast.success("Auto-scheduler completed. Remaining staff have been assigned.");
        setIsAutoScheduleOpen(false);
      } else {
        toast.error(res.error || "Auto-scheduler failed.");
      }
    });
  }

  function handleReverseAutoScheduler() {
    if (!currentCycle) return;
    startTransition(async () => {
      const res = await reverseAutoSchedulerAction(currentCycle.id);
      if (res.ok) {
        toast.success(
          `Reversed ${res.deletedRequestsCount ?? 0} auto-scheduled record(s) and re-opened the cycle.`,
        );
        setIsReverseAutoScheduleOpen(false);
      } else {
        toast.error(res.error || "Failed to undo auto-scheduled leave.");
      }
    });
  }

  function handleSaveBranchQuotas() {
    if (!selectedBranch) return;
    const branchQuotas = localQuotas[selectedBranch.id] ?? {};

    startTransition(async () => {
      const results = await Promise.all(
        selectedBranch.jobTitles.map((jt) => {
          const key = jt.name.trim().toLowerCase();
          const maxConcurrent = Math.max(1, branchQuotas[key] ?? 1);
          return saveBranchQuotaAction({
            branchId: selectedBranch.id,
            jobCategory: jt.name.trim(),
            maxConcurrent,
          });
        }),
      );

      const failed = results.find((r) => !r.ok);
      if (failed) {
        toast.error(failed.error || "Failed to save branch quotas.");
      } else {
        toast.success(`Saved staffing quotas for ${selectedBranch.name}.`);
      }
    });
  }

  const activeMonthBlockedCount = activeMonth
    ? activeMonth.weeks.filter((w) => blackoutSet.has(w.isoWeek)).length
    : 0;
  const activeMonthAllBlocked =
    activeMonth && activeMonth.weeks.length > 0 && activeMonthBlockedCount === activeMonth.weeks.length;

  return (
    <div className="space-y-6">
      {/* 1. Standardized KPI Strip */}
      {currentCycle && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Eligible Staff" value={String(currentCycle.totalEligible)} icon={Users} tone="default" />
          <StatCard
            label="Completed (15d)"
            value={String(currentCycle.fullyScheduledCount)}
            icon={CalendarCheck}
            tone="good"
          />
          <StatCard
            label="Partial"
            value={String(currentCycle.partiallyScheduledCount)}
            icon={Clock}
            tone="brand"
          />
          <StatCard
            label="Not Started"
            value={String(currentCycle.unscheduledCount)}
            icon={CalendarRange}
            tone={currentCycle.unscheduledCount > 0 ? "critical" : "default"}
          />
        </div>
      )}

      {/* 2. Cycle Settings & Booking Window */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
              <CalendarRange className="size-4 text-primary" />
              <span>{currentCycle ? `${currentCycle.year} Leave Cycle` : "Leave Cycle"}</span>
              {currentCycle && (
                <StatusBadge
                  tone={
                    currentCycle.status === "OPEN"
                      ? "good"
                      : currentCycle.status === "FINALIZED"
                        ? "info"
                        : "warning"
                  }
                >
                  {currentCycle.status.replace(/_/g, " ")}
                </StatusBadge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Set the cycle details and mobile booking dates.
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={handleSaveCycle} disabled={isPending} className="h-8 text-xs">
              {isPending ? "Saving..." : "Save Cycle"}
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          {/* Row 1: Title, Year, Status */}
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="title" className="text-xs text-muted-foreground">
                Cycle Title
              </Label>
              <Input
                id="title"
                value={cycleTitle}
                disabled={!canManage || isPending}
                onChange={(e) => setCycleTitle(e.target.value)}
                placeholder={`e.g. ${cycleYear} Annual Leave Selection`}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="year" className="text-xs text-muted-foreground">
                Year
              </Label>
              <Input
                id="year"
                type="number"
                value={cycleYear}
                disabled={!canManage || isPending}
                onChange={(e) => setCycleYear(parseInt(e.target.value, 10))}
                className="h-9 text-xs tabular-nums"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <NativeSelect
                id="status"
                value={cycleStatus}
                disabled={!canManage || isPending}
                onChange={(e) =>
                  setCycleStatus(
                    e.target.value as "UPCOMING" | "OPEN" | "AUTO_SCHEDULING" | "FINALIZED",
                  )
                }
                className="h-9 text-xs"
              >
                <option value="UPCOMING">Upcoming</option>
                <option value="OPEN">Open to staff</option>
                <option value="AUTO_SCHEDULING">Auto-scheduling</option>
                <option value="FINALIZED">Finalized</option>
              </NativeSelect>
            </div>
          </div>

          {/* Row 2: Booking Window */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wStart" className="text-xs text-muted-foreground">
                Booking Window Opens
              </Label>
              <Input
                id="wStart"
                type="date"
                value={windowStart}
                disabled={!canManage || isPending}
                onChange={(e) => setWindowStart(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wEnd" className="text-xs text-muted-foreground">
                Booking Window Closes
              </Label>
              <Input
                id="wEnd"
                type="date"
                value={windowEnd}
                disabled={!canManage || isPending}
                onChange={(e) => setWindowEnd(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Compact Auto-Scheduler Bar */}
          {canManage && currentCycle && (
            <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Zap className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Fair Auto-Scheduler</p>
                  <p className="text-xs text-muted-foreground">
                    {remainingToSchedule > 0
                      ? `${remainingToSchedule} staff still need leave assigned across open weeks.`
                      : "All eligible staff have completed their 15-day selection."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(currentCycle.autoScheduledCount > 0 || currentCycle.status === "FINALIZED") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsReverseAutoScheduleOpen(true)}
                    disabled={isPending}
                    className="h-8 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>
                      Undo
                      {currentCycle.autoScheduledCount > 0 ? ` (${currentCycle.autoScheduledCount})` : ""}
                    </span>
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsAutoScheduleOpen(true)}
                  disabled={isPending}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Play className="size-3.5" />
                  <span>Run Auto-Scheduler</span>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Busy Months & Blackout Weeks (Clean 12-Month Grid + Focused Week Strip) */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarOff className="size-4 text-destructive" />
              <span>Blackout Weeks</span>
              <StatusBadge tone={blackoutWeeks.length > 0 ? "warning" : "neutral"}>
                {blackoutWeeks.length} blocked
              </StatusBadge>
            </CardTitle>
            <CardDescription className="text-xs">
              Select a month to block busy trading weeks.
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={handleSaveCycle} disabled={isPending} className="h-8 text-xs">
              {isPending ? "Saving..." : "Save Blackouts"}
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          {/* Calm 4x3 Month Selector Grid */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {monthsWithWeeks.map((month) => {
              const blockedInMonth = month.weeks.filter((w) => blackoutSet.has(w.isoWeek)).length;
              const allBlocked = month.weeks.length > 0 && blockedInMonth === month.weeks.length;
              const isSelected = month.monthIndex === selectedMonthIndex;

              return (
                <button
                  key={month.monthIndex}
                  type="button"
                  onClick={() => setSelectedMonthIndex(month.monthIndex)}
                  className={cn(
                    "flex cursor-pointer flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : allBlocked
                        ? "border-destructive/40 bg-destructive/5 hover:border-destructive/60"
                        : blockedInMonth > 0
                          ? "border-amber-500/35 bg-amber-500/5 hover:border-amber-500/50"
                          : "border-border/80 bg-background hover:bg-muted/40",
                  )}
                >
                  <span className="text-xs font-semibold text-foreground">{month.shortName}</span>
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      allBlocked
                        ? "font-medium text-destructive"
                        : blockedInMonth > 0
                          ? "font-medium text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground",
                    )}
                  >
                    {allBlocked
                      ? "Full month"
                      : blockedInMonth > 0
                        ? `${blockedInMonth}/${month.weeks.length} blocked`
                        : "Open"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Focused Week Strip for the Selected Month */}
          {activeMonth && (
            <div className="rounded-lg border border-border/70 bg-muted/25 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {activeMonth.monthName} {cycleYear}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {activeMonthBlockedCount} of {activeMonth.weeks.length} weeks blocked
                  </span>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant={activeMonthAllBlocked ? "outline" : "destructive"}
                    size="sm"
                    onClick={() => toggleMonth(activeMonth.weeks)}
                    className="h-7 px-2.5 text-xs"
                  >
                    {activeMonthAllBlocked ? "Clear Month" : "Block Entire Month"}
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {activeMonth.weeks.map((week) => {
                  const isBlocked = blackoutSet.has(week.isoWeek);
                  return (
                    <button
                      key={week.isoWeek}
                      type="button"
                      disabled={!canManage}
                      onClick={() => toggleWeek(week.isoWeek)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default",
                        isBlocked
                          ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          : "border-border bg-background text-foreground hover:border-destructive/40 hover:bg-destructive/10",
                      )}
                    >
                      {isBlocked && <Check className="size-3" />}
                      <span className="tabular-nums">W{String(week.weekNumber).padStart(2, "0")}</span>
                      <span className={cn(isBlocked ? "opacity-90" : "text-muted-foreground")}>
                        {week.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Branch Staffing Quotas (One Branch at a Time via Dropdown) */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert className="size-4 text-primary" />
              <span>Branch Staffing Quotas</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Max staff per job title allowed off in the same week.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {branches.length > 0 && (
              <NativeSelect
                aria-label="Select branch"
                value={selectedBranch?.id ?? ""}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="h-9 text-xs"
                containerClassName="w-full sm:w-fit sm:min-w-[180px] sm:shrink-0"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.jobTitles.length})
                  </option>
                ))}
              </NativeSelect>
            )}
            {canManage && selectedBranch && selectedBranch.jobTitles.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveBranchQuotas}
                disabled={isPending}
                className="h-9 text-xs"
              >
                {isPending ? "Saving..." : "Save Quotas"}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          {!selectedBranch ? (
            <p className="text-xs text-muted-foreground">No active branches found.</p>
          ) : selectedBranch.jobTitles.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No active staff job titles assigned to {selectedBranch.name} yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {selectedBranch.jobTitles.map((jt) => {
                const key = jt.name.trim().toLowerCase();
                const currentVal = localQuotas[selectedBranch.id]?.[key] ?? 1;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground" title={jt.name}>
                        {jt.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {jt.staffCount} active staff
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      aria-label={`Max concurrent leave for ${jt.name} at ${selectedBranch.name}`}
                      value={currentVal}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        setLocalQuotas((prev) => ({
                          ...prev,
                          [selectedBranch.id]: {
                            ...(prev[selectedBranch.id] || {}),
                            [key]: val,
                          },
                        }));
                      }}
                      className="h-8 w-16 shrink-0 text-center text-xs tabular-nums"
                      disabled={!canManage || isPending}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-Scheduler Confirm Dialog */}
      <Dialog open={isAutoScheduleOpen} onOpenChange={setIsAutoScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run Fair Auto-Scheduler</DialogTitle>
            <DialogDescription className="text-xs">
              Assign leave weeks to eligible staff who have not booked their full 15 days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-xs text-muted-foreground">
            <p>&bull; Staff will be notified via push notifications with their assigned dates.</p>
            <p>&bull; Roster DAY_OFF exceptions will be generated automatically.</p>
            <p className="pt-1 font-semibold text-foreground">
              Run the auto-scheduler now?
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAutoScheduleOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRunAutoScheduler} disabled={isPending}>
              {isPending ? "Assigning..." : "Run Auto-Scheduler"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo Auto-Scheduler Confirm Dialog */}
      <Dialog open={isReverseAutoScheduleOpen} onOpenChange={setIsReverseAutoScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Undo Auto-Scheduled Leave</DialogTitle>
            <DialogDescription className="text-xs">
              Remove auto-scheduled leave for {currentCycle?.year} and re-open the cycle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-xs text-muted-foreground">
            <p>
              &bull; Removes <strong className="text-foreground">{currentCycle?.autoScheduledCount ?? 0}</strong>{" "}
              auto-scheduled record(s) and their generated roster exceptions.
            </p>
            <p>
              &bull; <strong className="text-emerald-700 dark:text-emerald-400">All manual staff bookings are preserved.</strong>
            </p>
            <p>&bull; Sets the {currentCycle?.year} cycle status back to <strong className="text-foreground">OPEN</strong>.</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsReverseAutoScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReverseAutoScheduler}
              disabled={isPending}
            >
              {isPending ? "Reversing..." : "Undo Auto-Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
