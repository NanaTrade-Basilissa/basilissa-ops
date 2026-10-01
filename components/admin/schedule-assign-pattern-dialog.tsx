"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { assignPatternAction } from "@/lib/modules/attendance/actions";
import { patternDayFor } from "@/lib/modules/attendance/schedule";
import { shiftDateKey } from "@/lib/platform/date";
import { PatternCycle, type CycleShift } from "@/components/admin/pattern-cycle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type AssignablePattern = { id: string; name: string; cycle: (string | null)[] };
export type PatternCandidate = { id: string; name: string; employeeCode: string | null; patternName: string | null };

const PREVIEW_PEOPLE = 6;

/**
 * Puts branch staff on a pattern from a date, each starting a set number of
 * days further into the cycle so their days off are staggered. The preview
 * shows each person's first week exactly as the schedule will resolve it.
 */
export function ScheduleAssignPatternDialog({
  branchId,
  branchName,
  weekStartKey,
  patterns,
  shifts,
  employees,
  open,
  onOpenChange,
}: {
  branchId: string;
  branchName: string;
  weekStartKey: string;
  patterns: AssignablePattern[];
  shifts: CycleShift[];
  employees: PatternCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [patternId, setPatternId] = useState(patterns[0]?.id ?? "");
  const [startDateKey, setStartDateKey] = useState(weekStartKey);
  const [stagger, setStagger] = useState(1);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const pattern = patterns.find((p) => p.id === patternId);
  const ending = patternId === "";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.employeeCode ?? "").toLowerCase().includes(q),
    );
  }, [employees, query]);
  const allSelected = visible.length > 0 && visible.every((e) => selected.includes(e.id));

  function toggleAll() {
    const ids = visible.map((e) => e.id);
    setSelected((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  }

  // Selection order is the stagger order, matching the action.
  const ordered = selected.map((id) => employees.find((e) => e.id === id)).filter(Boolean) as PatternCandidate[];

  function submit() {
    startTransition(async () => {
      const result = await assignPatternAction({
        branchId,
        patternId: patternId || null,
        employeeIds: selected,
        startDateKey,
        staggerDays: stagger,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not assign the pattern.");
        return;
      }
      toast.success(
        ending
          ? `Pattern ended for ${selected.length} ${selected.length === 1 ? "person" : "people"} from ${startDateKey}.`
          : `${result.assigned} ${result.assigned === 1 ? "person" : "people"} on ${pattern?.name} from ${startDateKey}.`,
      );
      onOpenChange(false);
      setSelected([]);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign rota pattern at {branchName}</DialogTitle>
          <DialogDescription>
            Replaces each person&apos;s pattern here from the start date. Their earlier weeks keep the rota they had.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="assignPattern">Pattern</Label>
              <NativeSelect id="assignPattern" value={patternId} onChange={(e) => setPatternId(e.target.value)}>
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="">No pattern (end it)</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignStart">From</Label>
              <Input id="assignStart" type="date" value={startDateKey} onChange={(e) => setStartDateKey(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignStagger">Stagger (days)</Label>
              <Input
                id="assignStagger"
                type="number"
                min={0}
                max={27}
                value={stagger}
                disabled={ending}
                onChange={(e) => setStagger(Math.max(0, Math.min(27, Number(e.target.value) || 0)))}
              />
            </div>
          </div>
          {!ending && (
            <p className="text-xs text-muted-foreground">
              Each person you tick starts {stagger} {stagger === 1 ? "day" : "days"} further into the cycle than the
              one before, so days off do not all fall together. 0 puts everyone on the same days.
            </p>
          )}

          {pattern && !ending && (
            <div className="space-y-1.5">
              <Label>Cycle</Label>
              <PatternCycle cycle={pattern.cycle} shifts={shifts} />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>People ({selected.length} selected)</Label>
              <button type="button" onClick={toggleAll} className="text-xs font-medium text-primary hover:underline">
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or code"
                className="pl-9"
                aria-label="Search staff"
              />
            </div>
            <div className="rounded-lg border border-border bg-card p-1 max-h-48 overflow-y-auto">
              {visible.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">No one matches.</p>
              ) : (
                visible.map((e) => (
                  <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <Checkbox
                      checked={selected.includes(e.id)}
                      onCheckedChange={() =>
                        setSelected((prev) => (prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id]))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                    {e.patternName && (
                      <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                        {e.patternName}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>

          {pattern && !ending && ordered.length > 0 && (
            <div className="space-y-1.5">
              <Label>First week from {startDateKey}</Label>
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2">
                {ordered.slice(0, PREVIEW_PEOPLE).map((person, index) => {
                  const anchorDateKey = shiftDateKey(startDateKey, -index * stagger);
                  const week = Array.from({ length: 7 }, (_, d) =>
                    patternDayFor(shiftDateKey(startDateKey, d), { anchorDateKey, cycle: pattern.cycle }),
                  );
                  return (
                    <div key={person.id} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-xs font-medium">{person.name}</span>
                      <PatternCycle cycle={week} shifts={shifts} size="xs" />
                    </div>
                  );
                })}
                {ordered.length > PREVIEW_PEOPLE && (
                  <p className="text-xs text-muted-foreground">and {ordered.length - PREVIEW_PEOPLE} more</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={isPending || selected.length === 0 || !startDateKey}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {ending ? "End pattern" : "Assign pattern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
