"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarRange,
  Users,
  ShieldAlert,
  Play,
  Settings2,
  CheckCircle2,
  Clock,
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
  const [activeTab, setActiveTab] = useState<"cycle" | "quotas">("cycle");
  const [isPending, startTransition] = useTransition();

  // Edit Cycle Dialog
  const [isCycleDialogOpen, setIsCycleDialogOpen] = useState(false);
  const [cycleYear, setCycleYear] = useState(currentCycle?.year ?? new Date().getFullYear() + 1);
  const [cycleTitle, setCycleTitle] = useState(currentCycle?.title ?? "");
  const [windowStart, setWindowStart] = useState(currentCycle?.windowStartStr ?? "");
  const [windowEnd, setWindowEnd] = useState(currentCycle?.windowEndStr ?? "");
  const [cycleStatus, setCycleStatus] = useState(currentCycle?.status ?? "OPEN");

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

  function handleSaveQuota(branchId: string, jobCategory: string, maxConcurrent: number) {
    startTransition(async () => {
      const res = await saveBranchQuotaAction({ branchId, jobCategory, maxConcurrent });
      if (res.ok) {
        toast.success(`Updated ${jobCategory} quota for branch.`);
      } else {
        toast.error(res.error || "Failed to update quota.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex border-b border-border/60">
        <button
          type="button"
          onClick={() => setActiveTab("cycle")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "cycle"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Annual Planning Cycle
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("quotas")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "quotas"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Branch Anti-Collision Quotas
        </button>
      </div>

      {activeTab === "cycle" && (
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
                    : "Create a leave planning cycle for employees to schedule their 15 days."}
                </CardDescription>
              </div>

              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCycleDialogOpen(true)}
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

                  {/* Operational Notes */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      &bull; <strong>12-Month Probation Guard</strong>: Employees with less than 12 months continuous
                      service cannot book dates prior to their 1-year anniversary.
                    </p>
                    <p>
                      &bull; <strong>Anti-Collision Matrix</strong>: Enforces that only 1 Cook (or configured quota) can
                      be on leave per branch per week.
                    </p>
                    <p>
                      &bull; <strong>Blackout Weeks</strong>: Easter, Christmas, and New Year are locked from voluntary
                      booking.
                    </p>
                  </div>
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
                Automatically and fairly schedules unallocated leave for staff who didn&apos;t pick their weeks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded border border-purple-200 bg-purple-50 p-2.5 text-xs text-purple-900 space-y-1">
                <p className="font-semibold">Algorithm Rules:</p>
                <p>&bull; Spreads leaves evenly across Q1, Q2, Q3, Q4.</p>
                <p>&bull; Prevents branch role collisions (never 2 cooks off simultaneously).</p>
                <p>&bull; Skips company peak trading weeks.</p>
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
      )}

      {activeTab === "quotas" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-600" />
              <span>Branch Staffing Concurrency Limits</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Maximum number of staff allowed to take leave in the same role group during the same week. Default is 1.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/60">
              {branches.map((b) => (
                <div key={b.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-sm">{b.name}</h4>
                    <p className="text-xs text-muted-foreground">Anti-collision roster locks</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {(["COOK", "FRONT_OF_HOUSE", "CLEANER", "SUPERVISOR"] as const).map((role) => {
                      const currentVal = b.quotas[role] ?? 1;
                      return (
                        <div key={role} className="flex items-center gap-1.5 bg-muted/40 rounded px-2 py-1">
                          <span className="text-[11px] font-medium text-muted-foreground uppercase">{role}:</span>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            defaultValue={currentVal}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (val && val !== currentVal) {
                                handleSaveQuota(b.id, role, val);
                              }
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
          </CardContent>
        </Card>
      )}

      {/* Configure Cycle Dialog */}
      <Dialog open={isCycleDialogOpen} onOpenChange={setIsCycleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Annual Leave Window</DialogTitle>
            <DialogDescription className="text-xs">
              Set the selection window during which employees must choose their annual leave weeks in the mobile app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
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
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsCycleDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveCycle} disabled={isPending}>
              {isPending ? "Saving..." : "Save Cycle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Scheduler Confirm Dialog */}
      <Dialog open={isAutoScheduleOpen} onOpenChange={setIsAutoScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run Fair Auto-Scheduler</DialogTitle>
            <DialogDescription className="text-xs">
              This will assign leave weeks to all active, eligible staff who have not booked their full 15 days of
              annual leave.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-xs space-y-2 text-muted-foreground">
            <p>
              &bull; Staff will be notified immediately via push notifications with their assigned dates.
            </p>
            <p>
              &bull; Roster DAY_OFF exceptions will be generated automatically.
            </p>
            <p className="font-semibold text-foreground">
              Are you sure you want to run the auto-scheduler now?
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAutoScheduleOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRunAutoScheduler} disabled={isPending} className="bg-purple-600 text-white">
              {isPending ? "Assigning..." : "Execute Auto-Scheduler"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
