"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check } from "lucide-react";
import { toast } from "sonner";
import { updateBranchSchedulingModeAction } from "@/lib/modules/branches/actions";
import { minutesToTime, timeToMinutes } from "@/lib/modules/employees/validation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { id: 1, short: "Mon" },
  { id: 2, short: "Tue" },
  { id: 3, short: "Wed" },
  { id: 4, short: "Thu" },
  { id: 5, short: "Fri" },
  { id: 6, short: "Sat" },
  { id: 7, short: "Sun" },
] as const;

export function BranchSchedulingCard({
  branch,
  canWrite,
}: {
  branch: {
    id: string;
    name: string;
    schedulingMode: "ROTATING_ROTA" | "FIXED_SCHEDULE";
    fixedShiftStartMinute: number | null;
    fixedShiftEndMinute: number | null;
    fixedUnpaidBreakMinutes: number;
    fixedWorkDays: number[];
    fixedOffOnPublicHolidays: boolean;
  };
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<"ROTATING_ROTA" | "FIXED_SCHEDULE">(branch.schedulingMode);
  const [startTime, setStartTime] = useState(
    branch.fixedShiftStartMinute !== null ? minutesToTime(branch.fixedShiftStartMinute) : "08:00",
  );
  const [endTime, setEndTime] = useState(
    branch.fixedShiftEndMinute !== null ? minutesToTime(branch.fixedShiftEndMinute) : "17:00",
  );
  const [unpaidBreakMinutes, setUnpaidBreakMinutes] = useState<string>(
    String(branch.fixedUnpaidBreakMinutes ?? 0),
  );
  const [workDays, setWorkDays] = useState<number[]>(
    branch.fixedWorkDays.length > 0 ? branch.fixedWorkDays : [1, 2, 3, 4, 5],
  );
  const [offOnHolidays, setOffOnHolidays] = useState(branch.fixedOffOnPublicHolidays);

  function toggleDay(dayId: number) {
    setWorkDays((prev) =>
      prev.includes(dayId)
        ? prev.filter((d) => d !== dayId)
        : [...prev, dayId].sort((a, b) => a - b),
    );
  }

  function handleSave() {
    if (mode === "FIXED_SCHEDULE" && workDays.length === 0) {
      toast.error("Select at least one working day for Fixed Schedule mode.");
      return;
    }

    const startMinute = mode === "FIXED_SCHEDULE" ? timeToMinutes(startTime) : null;
    const endMinute = mode === "FIXED_SCHEDULE" ? timeToMinutes(endTime) : null;
    const parsedBreak = unpaidBreakMinutes.trim() === "" ? 0 : Number.parseInt(unpaidBreakMinutes, 10);

    if (mode === "FIXED_SCHEDULE" && (startMinute === null || endMinute === null)) {
      toast.error("Please enter valid start and end times.");
      return;
    }

    if (
      mode === "FIXED_SCHEDULE" &&
      (!Number.isFinite(parsedBreak) || parsedBreak < 0 || parsedBreak > 480)
    ) {
      toast.error("Unpaid break must be between 0 and 480 minutes.");
      return;
    }

    startTransition(async () => {
      const res = await updateBranchSchedulingModeAction({
        branchId: branch.id,
        schedulingMode: mode,
        fixedShiftStartMinute: startMinute,
        fixedShiftEndMinute: endMinute,
        fixedUnpaidBreakMinutes: mode === "FIXED_SCHEDULE" ? parsedBreak : branch.fixedUnpaidBreakMinutes,
        fixedWorkDays: workDays,
        fixedOffOnPublicHolidays: offOnHolidays,
      });

      if (res.ok) {
        toast.success(`Scheduling mode updated for ${branch.name}.`);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update scheduling settings.");
      }
    });
  }

  return (
    <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2.5">
          <CalendarClock className="size-5 shrink-0 text-foreground" />
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
              <span>Scheduling Mode</span>
              <StatusBadge tone={mode === "FIXED_SCHEDULE" ? "good" : "neutral"}>
                {mode === "FIXED_SCHEDULE" ? "Fixed Schedule" : "Weekly Rota"}
              </StatusBadge>
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs text-muted-foreground">
              Choose whether staff at {branch.name} follow a weekly rota or a branch-wide fixed schedule.
            </CardDescription>
          </div>
        </div>
        {canWrite && (
          <Button size="sm" onClick={handleSave} disabled={isPending} className="h-9 text-xs">
            {isPending ? "Saving..." : "Save Scheduling"}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="branch-scheduling-mode" className="text-xs text-muted-foreground">
            Schedule Type
          </Label>
          <NativeSelect
            id="branch-scheduling-mode"
            value={mode}
            disabled={!canWrite || isPending}
            onChange={(e) => setMode(e.target.value as "ROTATING_ROTA" | "FIXED_SCHEDULE")}
            className="h-9 text-xs"
          >
            <option value="ROTATING_ROTA">Weekly Rota (shift templates required to clock in)</option>
            <option value="FIXED_SCHEDULE">Fixed Schedule (applies to all branch staff)</option>
          </NativeSelect>
        </div>

        {mode === "ROTATING_ROTA" ? (
          <p className="text-xs text-muted-foreground">
            Staff at this branch must be scheduled via the Weekly Rota or an individual shift assignment to clock in.
          </p>
        ) : (
          <div className="space-y-4 rounded-xl border border-border/70 bg-muted/25 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fixed-start" className="text-xs text-muted-foreground">
                  Start Time
                </Label>
                <Input
                  id="fixed-start"
                  type="time"
                  value={startTime}
                  disabled={!canWrite || isPending}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-9 text-xs tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fixed-unpaid-break" className="text-xs text-muted-foreground">
                  Unpaid Break (min)
                </Label>
                <Input
                  id="fixed-unpaid-break"
                  type="number"
                  min={0}
                  max={480}
                  step={5}
                  value={unpaidBreakMinutes}
                  disabled={!canWrite || isPending}
                  onChange={(e) => setUnpaidBreakMinutes(e.target.value)}
                  placeholder="0"
                  className="h-9 text-xs tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fixed-end" className="text-xs text-muted-foreground">
                  End Time
                </Label>
                <Input
                  id="fixed-end"
                  type="time"
                  value={endTime}
                  disabled={!canWrite || isPending}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-9 text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Working Days</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = workDays.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      disabled={!canWrite || isPending}
                      onClick={() => toggleDay(day.id)}
                      className={cn(
                        "inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-default",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && <Check className="size-3" />}
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <Switch
                id="fixed-off-holidays"
                checked={offOnHolidays}
                disabled={!canWrite || isPending}
                onChange={(e) => setOffOnHolidays(e.target.checked)}
              />
              <Label htmlFor="fixed-off-holidays" className="cursor-pointer text-xs font-medium text-foreground">
                Off on public holidays
              </Label>
            </div>

            <p className="text-xs text-muted-foreground">
              Applies automatically to all active staff at {branch.name} without using shift templates. Individual exceptions or custom shift overrides still take precedence.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
