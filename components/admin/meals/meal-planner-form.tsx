"use client";

import { useActionState, useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
  UtensilsCrossed,
  Save,
  Send,
  Users,
  CheckCircle2,
  Clock,
  CalendarDays,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { saveWeeklyMenuAction, type MealPlanFormState } from "@/lib/modules/meals/actions";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { shiftDateKey } from "@/lib/platform/date";
import { cn } from "@/lib/utils";

export interface DayData {
  date: string;
  planId: string | null;
  dishName: string;
  description: string;
  isEnabled: boolean;
  cutoffHour: number;
  cutoffAt?: string | null;
  holidayName?: string | null;
  isPublished: boolean;
  isCutoffPassed: boolean;
  confirmedCount: number;
  optedOutCount: number;
  claimedCount: number;
}

interface MealPlannerFormProps {
  branchId: string;
  branchName: string;
  canWrite: boolean;
  weekMonday: string;
  initialCutoffAt?: string | null;
  initialDays: DayData[];
}

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function MealPlannerForm({
  branchId,
  branchName,
  canWrite,
  weekMonday,
  initialCutoffAt,
  initialDays,
}: MealPlannerFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [days, setDays] = useState<DayData[]>(initialDays);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishFlag, setPublishFlag] = useState<"true" | "false">("false");

  // Default cutoff: Sunday before the week at 8:00 PM (20:00)
  const defaultCutoff = () => {
    if (initialCutoffAt) {
      try {
        const d = new Date(initialCutoffAt);
        return d.toISOString().slice(0, 16);
      } catch {
        // Fall back below
      }
    }
    const prevSunday = shiftDateKey(weekMonday, -1);
    return `${prevSunday}T20:00`;
  };

  const [cutoffValue, setCutoffValue] = useState<string>(defaultCutoff);

  const [state, formAction, isPending] = useActionState<MealPlanFormState, FormData>(
    saveWeeklyMenuAction,
    {},
  );

  const [prevDays, setPrevDays] = useState(initialDays);
  if (initialDays !== prevDays) {
    setPrevDays(initialDays);
    setDays(initialDays);
  }

  const [prevCutoff, setPrevCutoff] = useState(initialCutoffAt);
  if (initialCutoffAt !== prevCutoff) {
    setPrevCutoff(initialCutoffAt);
    setCutoffValue(defaultCutoff());
  }

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const updateDayField = (
    index: number,
    field: "dishName" | "description" | "cutoffHour" | "isEnabled",
    value: string | number | boolean,
  ) => {
    setDays((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const prevSaturday = shiftDateKey(weekMonday, -2);
  const prevSunday = shiftDateKey(weekMonday, -1);
  const cutoffPresets = [
    {
      id: "sat-8pm",
      title: "Saturday",
      time: "8:00 PM",
      value: `${prevSaturday}T20:00`,
    },
    {
      id: "sat-10pm",
      title: "Saturday",
      time: "10:00 PM",
      value: `${prevSaturday}T22:00`,
    },
    {
      id: "sun-8pm",
      title: "Sunday",
      time: "8:00 PM",
      value: `${prevSunday}T20:00`,
    },
    {
      id: "sun-10pm",
      title: "Sunday",
      time: "10:00 PM",
      value: `${prevSunday}T22:00`,
    },
    {
      id: "mon-7am",
      title: "Monday",
      time: "7:00 AM",
      value: `${weekMonday}T07:00`,
    },
    {
      id: "mon-12pm",
      title: "Monday",
      time: "12:00 PM",
      value: `${weekMonday}T12:00`,
    },
  ];

  const handleOpenPublishDialog = () => {
    setIsPublishDialogOpen(true);
  };

  const handleConfirmPublish = () => {
    if (!formRef.current) return;
    setPublishFlag("true");
    setIsPublishDialogOpen(false);
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.requestSubmit();
      }
    }, 50);
  };

  const handleSaveDraft = () => {
    if (!formRef.current) return;
    setPublishFlag("false");
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.requestSubmit();
      }
    }, 50);
  };

  const totalConfirmed = days.reduce((sum, d) => sum + d.confirmedCount, 0);
  const totalClaimed = days.reduce((sum, d) => sum + d.claimedCount, 0);
  const enabledDays = days.filter((d) => d.isEnabled);
  const disabledDays = days.filter((d) => !d.isEnabled);

  return (
    <>
      <form ref={formRef} action={formAction} className="space-y-6">
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="publish" value={publishFlag} />
        <input type="hidden" name="cutoffAt" value={cutoffValue} />

        {/* Overview Metric Bar */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard
            label="Total Portions Ordered"
            value={totalConfirmed}
            icon={Users}
            tone="brand"
            subtext={`Confirmed for ${branchName}`}
          />
          <StatCard
            label="Portions Claimed"
            value={totalClaimed}
            icon={CheckCircle2}
            tone="good"
            subtext={
              totalConfirmed > 0
                ? `${Math.round((totalClaimed / totalConfirmed) * 100)}% of ordered claimed`
                : "No claims recorded yet"
            }
          />
          <StatCard
            label="Days Serving Food"
            value={`${enabledDays.length} / 7`}
            icon={UtensilsCrossed}
            tone="info"
            subtext={
              disabledDays.length > 0
                ? `${disabledDays.length} day${disabledDays.length > 1 ? "s" : ""} disabled`
                : "Serving all week"
            }
          />
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day, idx) => {
            const dateObj = new Date(`${day.date}T12:00:00Z`);
            const weekdayName =
              WEEKDAY_NAMES[idx] ?? dateObj.toLocaleDateString("en-US", { weekday: "long" });
            const formattedDate = dateObj.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });

            return (
              <Card
                key={day.date}
                className={cn(
                  "flex flex-col justify-between transition-opacity",
                  !day.isEnabled && "bg-muted/30 opacity-80",
                )}
              >
                <input type="hidden" name={`days[${idx}].date`} value={day.date} />
                <input
                  type="hidden"
                  name={`days[${idx}].isEnabled`}
                  value={day.isEnabled ? "true" : "false"}
                />

                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                        {weekdayName}
                      </span>
                      {day.holidayName && (
                        <StatusBadge tone="info" title="Public Holiday">
                          <CalendarDays className="size-3" />
                          {day.holidayName}
                        </StatusBadge>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formattedDate}
                    </span>
                  </div>

                  {/* Badges & Enabled Status */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {!day.isEnabled ? (
                      <StatusBadge tone="neutral">No Food Served</StatusBadge>
                    ) : day.isPublished ? (
                      <StatusBadge tone="good" dot>
                        Published
                      </StatusBadge>
                    ) : day.dishName.trim() ? (
                      <StatusBadge tone="warning" dot>
                        Draft
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">No Dish Set</StatusBadge>
                    )}

                    {day.isCutoffPassed && day.isEnabled && (
                      <StatusBadge tone="neutral">Cutoff Passed</StatusBadge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    {/* Food Served Toggle */}
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5">
                      <Label
                        htmlFor={`toggle-enabled-${idx}`}
                        className="cursor-pointer text-xs font-medium text-foreground"
                      >
                        {day.isEnabled ? "Food Served Today" : "No Meal (Disabled)"}
                      </Label>
                      <Switch
                        id={`toggle-enabled-${idx}`}
                        checked={day.isEnabled}
                        disabled={!canWrite}
                        onChange={(e) => updateDayField(idx, "isEnabled", e.target.checked)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`dish-${idx}`}
                        className={cn(
                          "text-xs font-medium",
                          day.isEnabled ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        Dish Name
                      </Label>
                      <Input
                        id={`dish-${idx}`}
                        name={`days[${idx}].dishName`}
                        placeholder={
                          day.isEnabled
                            ? "e.g. Jollof Rice & Chicken"
                            : "Disabled — no food scheduled"
                        }
                        value={day.dishName}
                        disabled={!canWrite}
                        onChange={(e) => updateDayField(idx, "dishName", e.target.value)}
                        className={cn(
                          "h-9 text-sm font-medium",
                          !day.isEnabled && "bg-muted/30 text-muted-foreground",
                        )}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`desc-${idx}`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Details / Sides (Optional)
                      </Label>
                      <Input
                        id={`desc-${idx}`}
                        name={`days[${idx}].description`}
                        placeholder="e.g. Served with shito & salad"
                        value={day.description}
                        disabled={!canWrite}
                        onChange={(e) => updateDayField(idx, "description", e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <input
                      type="hidden"
                      name={`days[${idx}].cutoffHour`}
                      value={day.cutoffHour ?? 20}
                    />
                  </div>

                  {/* Headcount summary for the day */}
                  <div className="flex items-center justify-between border-t border-border/70 pt-3 text-xs tabular-nums text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Users className="size-3.5 text-primary" />
                      {day.confirmedCount} eating
                    </span>
                    <span>{day.claimedCount} claimed</span>
                    {day.optedOutCount > 0 && (
                      <span className="text-muted-foreground/80">{day.optedOutCount} opt-out</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Action Footer */}
        {canWrite && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleSaveDraft}
              className="gap-2 flex-1 sm:flex-initial"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </Button>

            <Button
              type="button"
              disabled={isPending}
              onClick={handleOpenPublishDialog}
              className="gap-2 flex-1 sm:flex-initial"
            >
              <Send className="h-4 w-4" />
              {isPending ? "Publishing..." : "Publish Menu to Staff"}
            </Button>
          </div>
        )}
      </form>

      {/* Publication Cutoff Dialog */}
      <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Set Order Cutoff Deadline
            </DialogTitle>
            <DialogDescription>
              Select when staff meal ordering closes for this week.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {cutoffPresets.map((preset) => {
                const isSelected = cutoffValue === preset.value;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setCutoffValue(preset.value)}
                    className={`text-left p-2.5 rounded-lg border transition-all text-xs flex flex-col justify-between ${
                      isSelected
                        ? "border-foreground bg-accent text-foreground font-semibold"
                        : "border-border hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-foreground">{preset.title}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <span className="text-xs font-mono mt-1 text-foreground">{preset.time}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Date/Time Input */}
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="custom-cutoff-input" className="text-xs font-medium text-foreground">
                Date and time
              </Label>
              <Input
                id="custom-cutoff-input"
                type="datetime-local"
                value={cutoffValue}
                onChange={(e) => setCutoffValue(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Optional note if any days are disabled */}
            {disabledDays.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Note: {disabledDays.length} day{disabledDays.length > 1 ? "s" : ""} marked as no
                food served (
                {disabledDays
                  .map((d) => {
                    const idx = days.findIndex((x) => x.date === d.date);
                    return WEEKDAY_NAMES[idx] ?? d.date;
                  })
                  .join(", ")}
                ).
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="button" onClick={handleConfirmPublish} className="gap-2">
              <Send className="h-4 w-4" />
              Confirm & Publish Menu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
