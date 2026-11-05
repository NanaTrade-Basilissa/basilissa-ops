"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarRange,
  ShieldAlert,
  Play,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { saveLeaveCycleAction, runAutoSchedulerAction, saveBranchQuotaAction } from "@/lib/modules/attendance/actions";

const STAFFING_DEPARTMENTS = [
  { key: "KITCHEN", label: "Kitchen", fallback: "COOK" },
  { key: "SERVICE", label: "Service", fallback: "FRONT_OF_HOUSE" },
  { key: "SANITATION", label: "Sanitation", fallback: "CLEANER" },
  { key: "MANAGEMENT", label: "Management", fallback: "SUPERVISOR" },
] as const;

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
    totalEligible: number;
    fullyScheduledCount: number;
    partiallyScheduledCount: number;
    unscheduledCount: number;
  } | null;
  branches: {
    id: string;
    name: string;
    quotas: Record<string, number>;
  }[];
  canManage: boolean;
}

export function AnnualLeaveAdminPanel({
  currentCycle,
  branches,
  canManage,
}: AnnualLeaveAdminPanelProps) {
  const [isPending, startTransition] = useTransition();

  // Dialog & Tabs
  const [isCycleDialogOpen, setIsCycleDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<"window" | "quotas">("window");

  // Cycle form state
  const [cycleYear, setCycleYear] = useState(currentCycle?.year ?? new Date().getFullYear() + 1);
  const [cycleTitle, setCycleTitle] = useState(currentCycle?.title ?? "");
  const [windowStart, setWindowStart] = useState(currentCycle?.windowStartStr ?? "");
  const [windowEnd, setWindowEnd] = useState(currentCycle?.windowEndStr ?? "");
  const [cycleStatus, setCycleStatus] = useState(currentCycle?.status ?? "OPEN");

  // Local quota cache: branchId -> { deptKey -> number }
  const [localQuotas, setLocalQuotas] = useState<Record<string, Record<string, number>>>(() => {
    const initial: Record<string, Record<string, number>> = {};
    for (const b of branches) {
      initial[b.id] = {};
      for (const d of STAFFING_DEPARTMENTS) {
        initial[b.id][d.key] = b.quotas[d.key] ?? b.quotas[d.fallback] ?? 1;
      }
    }
    return initial;
  });

  // Auto-Scheduler Confirmation Dialog
  const [isAutoScheduleOpen, setIsAutoScheduleOpen] = useState(false);

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
        blackoutWeeks: currentCycle?.blackoutWeeks ?? [`${cycleYear}-W14`, `${cycleYear}-W51`, `${cycleYear}-W52`],
        status: cycleStatus,
      });

      if (res.ok) {
        toast.success("Annual leave cycle updated successfully.");
        setIsCycleDialogOpen(false);
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
        toast.success("Fair auto-scheduler completed! Unassigned staff have been scheduled.");
        setIsAutoScheduleOpen(false);
      } else {
        toast.error(res.error || "Auto-scheduler failed.");
      }
    });
  }

  function handleSaveQuota(branchId: string, departmentKey: string, maxConcurrent: number) {
    setLocalQuotas((prev) => ({
      ...prev,
      [branchId]: {
        ...(prev[branchId] || {}),
        [departmentKey]: maxConcurrent,
      },
    }));

    startTransition(async () => {
      const res = await saveBranchQuotaAction({ branchId, jobCategory: departmentKey, maxConcurrent });
      if (res.ok) {
        toast.success(`Updated ${departmentKey.toLowerCase()} quota to ${maxConcurrent}.`);
      } else {
        toast.error(res.error || "Failed to update quota.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Main Grid: Cycle Overview & Auto Scheduler */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Main Cycle Card */}
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarRange className="size-4 text-primary" />
                <span>{currentCycle ? `${currentCycle.year} Annual Leave Window` : "No Active Cycle"}</span>
                {currentCycle && (
                  <Badge
                    variant="outline"
                    className={
                      currentCycle.status === "OPEN"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : currentCycle.status === "FINALIZED"
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                    }
                  >
                    {currentCycle.status}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {currentCycle
                  ? `Selection Window: ${currentCycle.windowStartStr} to ${currentCycle.windowEndStr}`
                  : "Create an annual leave planning cycle for employees to schedule their 15 days."}
              </CardDescription>
            </div>

            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDialogTab("window");
                  setIsCycleDialogOpen(true);
                }}
                className="gap-1.5 text-xs"
              >
                <Settings2 className="size-3.5" />
                <span>Configure Window</span>
              </Button>
            )}
          </CardHeader>

          <CardContent className="space-y-4 pt-2">
            {currentCycle && (
              <>
                {/* Progress Stats */}
                <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/80 bg-muted/30 p-3 text-center">
                  <div>
                    <span className="block text-xl font-bold text-foreground">{currentCycle.totalEligible}</span>
                    <span className="text-[11px] text-muted-foreground">Eligible Staff</span>
                  </div>
                  <div>
                    <span className="block text-xl font-bold text-emerald-600">
                      {currentCycle.fullyScheduledCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Completed (15d)</span>
                  </div>
                  <div>
                    <span className="block text-xl font-bold text-amber-600">
                      {currentCycle.partiallyScheduledCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Partial</span>
                  </div>
                  <div>
                    <span className="block text-xl font-bold text-rose-600">
                      {currentCycle.unscheduledCount}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Not Started</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Eligible staff choose up to 3 weeks (15 days) of annual leave via the mobile app, adhering to branch department staffing limits and blackout periods.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Auto-Scheduler Action Card */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-purple-600" />
              <span>Fair Auto-Scheduler</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Automatically assigns remaining leave for staff who have not completed their selection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded border border-purple-200 bg-purple-50/70 p-2.5 text-xs text-purple-950 space-y-1">
              <p className="font-semibold text-purple-900">Balanced Allocation</p>
              <p className="text-purple-800/90 leading-relaxed">
                Evenly distributes leave blocks across quarters while strictly enforcing branch department limits and skipping peak company trading weeks.
              </p>
            </div>

            {canManage && (
              <Button
                onClick={() => setIsAutoScheduleOpen(true)}
                disabled={isPending || !currentCycle}
                className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs"
              >
                <Play className="size-3.5" />
                <span>Run Auto-Scheduler</span>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Configure Cycle & Branch Quotas Dialog */}
      <Dialog open={isCycleDialogOpen} onOpenChange={setIsCycleDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-3 border-b border-border/60">
            <DialogTitle>Configure Annual Leave Window</DialogTitle>
            <DialogDescription className="text-xs">
              Set mobile booking window dates and configure maximum simultaneous leave limits by functional department.
            </DialogDescription>

            {/* Modal Internal Tab Switcher */}
            <div className="flex gap-2 pt-3">
              <Button
                type="button"
                variant={dialogTab === "window" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDialogTab("window")}
                className="text-xs gap-1.5 h-8"
              >
                <CalendarRange className="size-3.5" />
                <span>Window Settings</span>
              </Button>
              <Button
                type="button"
                variant={dialogTab === "quotas" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDialogTab("quotas")}
                className="text-xs gap-1.5 h-8"
              >
                <ShieldAlert className="size-3.5" />
                <span>Branch Staffing Quotas</span>
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {dialogTab === "window" && (
              <div className="space-y-3 text-xs">
                <div>
                  <Label htmlFor="year">Cycle Year</Label>
                  <Input
                    id="year"
                    type="number"
                    value={cycleYear}
                    onChange={(e) => setCycleYear(parseInt(e.target.value, 10))}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="title">Cycle Title (Optional)</Label>
                  <Input
                    id="title"
                    value={cycleTitle}
                    onChange={(e) => setCycleTitle(e.target.value)}
                    placeholder="e.g. 2027 Annual Leave Selection"
                    className="mt-1 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="wStart">Window Opens</Label>
                    <Input
                      id="wStart"
                      type="date"
                      value={windowStart}
                      onChange={(e) => setWindowStart(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="wEnd">Window Closes</Label>
                    <Input
                      id="wEnd"
                      type="date"
                      value={windowEnd}
                      onChange={(e) => setWindowEnd(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={cycleStatus}
                    onChange={(e) =>
                      setCycleStatus(
                        e.target.value as "UPCOMING" | "OPEN" | "AUTO_SCHEDULING" | "FINALIZED"
                      )
                    }
                    className="mt-1 w-full rounded border border-border bg-background p-2 text-xs"
                  >
                    <option value="UPCOMING">UPCOMING (Not yet open to staff)</option>
                    <option value="OPEN">OPEN (Staff can book in app)</option>
                    <option value="AUTO_SCHEDULING">AUTO_SCHEDULING (Window closed, preparing allocations)</option>
                    <option value="FINALIZED">FINALIZED (Locked for regular booking)</option>
                  </select>
                </div>
              </div>
            )}

            {dialogTab === "quotas" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Specify the maximum number of employees in each department permitted on leave during the same week at each branch. Changes save automatically.
                </p>
                <div className="divide-y divide-border/60 rounded-md border border-border/80">
                  {branches.map((b) => (
                    <div key={b.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-sm">{b.name}</h4>
                        <p className="text-[11px] text-muted-foreground">Concurrent leave limits per week</p>
                      </div>
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                        {STAFFING_DEPARTMENTS.map((dept) => {
                          const currentVal = localQuotas[b.id]?.[dept.key] ?? 1;
                          return (
                            <div
                              key={dept.key}
                              className="flex items-center justify-between sm:justify-start gap-1.5 bg-muted/40 rounded px-2.5 py-1 text-xs"
                            >
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {dept.label}:
                              </span>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={currentVal}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 1;
                                  setLocalQuotas((prev) => ({
                                    ...prev,
                                    [b.id]: {
                                      ...(prev[b.id] || {}),
                                      [dept.key]: val,
                                    },
                                  }));
                                }}
                                onBlur={(e) => {
                                  const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                  handleSaveQuota(b.id, dept.key, val);
                                }}
                                className="w-12 h-6 text-xs text-center border border-border rounded bg-background"
                                disabled={!canManage || isPending}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t border-border/60 bg-muted/20 flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">
              {dialogTab === "quotas" ? "Quotas save on change" : ""}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsCycleDialogOpen(false)}>
                Close
              </Button>
              {dialogTab === "window" && (
                <Button size="sm" onClick={handleSaveCycle} disabled={isPending}>
                  {isPending ? "Saving..." : "Save Window Settings"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Scheduler Confirm Dialog */}
      <Dialog open={isAutoScheduleOpen} onOpenChange={setIsAutoScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run Fair Auto-Scheduler</DialogTitle>
            <DialogDescription className="text-xs">
              Assign leave weeks to all active, eligible staff who have not booked their full 15 days of annual leave.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-xs space-y-2 text-muted-foreground">
            <p>&bull; Staff will be notified via mobile push notifications with their assigned dates.</p>
            <p>&bull; Roster DAY_OFF exceptions will be generated automatically.</p>
            <p className="font-semibold text-foreground pt-1">
              Are you sure you want to run the auto-scheduler now?
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAutoScheduleOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRunAutoScheduler} disabled={isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
              {isPending ? "Assigning..." : "Execute Auto-Scheduler"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
