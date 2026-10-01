"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Minus, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { savePatternAction } from "@/lib/modules/attendance/actions";
import { shortRestDays } from "@/lib/modules/attendance/schedule";
import { PatternCycle, shiftShortName, type CycleShift } from "@/components/admin/pattern-cycle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PatternDialogValues = { id: string; name: string; branchId: string | null; cycle: (string | null)[] };

/** Templates carry their branch so the day pickers only offer usable ones. */
export type PatternShiftOption = CycleShift & { branchId: string | null; isActive: boolean };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function PatternDialog({
  pattern,
  branches,
  allowGlobal,
  shifts,
  open,
  onOpenChange,
}: {
  /** Absent to create. */
  pattern?: PatternDialogValues;
  branches: { id: string; name: string }[];
  allowGlobal: boolean;
  shifts: PatternShiftOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(pattern?.name ?? "");
  const [branchId, setBranchId] = useState<string>(
    pattern?.branchId ?? (allowGlobal ? "" : (branches[0]?.id ?? "")),
  );
  const [cycle, setCycle] = useState<(string | null)[]>(pattern?.cycle ?? [null, null, null, null, null, null, null]);
  const [error, setError] = useState<string | null>(null);

  const usable = shifts.filter((shift) => shift.isActive && (shift.branchId === null || shift.branchId === branchId));
  const shortRest = shortRestDays(cycle, usable);

  function setDay(index: number, value: string) {
    setCycle((prev) => prev.map((day, i) => (i === index ? value || null : day)));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await savePatternAction(pattern?.id ?? null, { name, branchId: branchId || null, cycle });
      if (!result.ok) {
        setError(result.error ?? "Could not save the pattern.");
        return;
      }
      toast.success(pattern ? "Pattern updated" : "Pattern created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pattern ? "Edit pattern" : "New rota pattern"}</DialogTitle>
          <DialogDescription>
            A cycle of shifts and days off that repeats. A cycle that is not 7 days long shifts each week, so
            people do not get the same days every week.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="patternName">Name</Label>
              <Input
                id="patternName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kitchen 8-day"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patternBranch">Branch</Label>
              <NativeSelect id="patternBranch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {allowGlobal && <option value="">Every branch</option>}
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cycle ({cycle.length} {cycle.length === 1 ? "day" : "days"})</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Remove last day"
                  disabled={cycle.length <= 1}
                  onClick={() => setCycle((prev) => prev.slice(0, -1))}
                >
                  <Minus className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Add a day"
                  disabled={cycle.length >= 28}
                  onClick={() => setCycle((prev) => [...prev, null])}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {cycle.map((day, index) => (
                <div key={index} className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Day {index + 1}</span>
                  <NativeSelect
                    aria-label={`Day ${index + 1}`}
                    value={day ?? ""}
                    onChange={(e) => setDay(index, e.target.value)}
                  >
                    <option value="">Off</option>
                    {usable.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shiftShortName(shift.name)} {hhmm(shift.startMinute)}–{hhmm(shift.endMinute)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Preview</Label>
            <PatternCycle cycle={cycle} shifts={usable} highlight={shortRest.map((d) => d.dayIndex)} />
          </div>

          {shortRest.length > 0 && (
            <Alert className="border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
              <AlertTriangle className="size-4" />
              <AlertDescription className="text-rose-900/80 dark:text-rose-200/80">
                Short rest before day {shortRest.map((d) => d.dayIndex + 1).join(", ")}: only{" "}
                {Math.min(...shortRest.map((d) => d.restMinutes)) / 60} hours between shifts, e.g. an evening
                followed by a morning. Allowed, but check it is intended.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={save} disabled={isPending || name.trim().length < 2}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {pattern ? "Save changes" : "Create pattern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
