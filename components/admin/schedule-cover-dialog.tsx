"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { assignCoverShiftAction } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type CoverCandidate = {
  id: string;
  name: string;
  employeeCode: string;
  jobTitle: string | null;
  homeBranchName: string | null;
};

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/**
 * Rosters people, from this branch or any other the manager can schedule, to
 * work one shift here on one day. Their punch is accepted at this branch for
 * that shift only.
 */
export function ScheduleCoverDialog({
  branchId,
  branchName,
  days,
  shifts,
  candidates,
}: {
  branchId: string;
  branchName: string;
  days: { dateKey: string; dayName: string; formattedDay: string; holidayName: string | null }[];
  shifts: { id: string; name: string; startMinute: number; endMinute: number }[];
  candidates: CoverCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dateKey, setDateKey] = useState(days.find((d) => d.holidayName)?.dateKey ?? days[0]?.dateKey ?? "");
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.name, c.employeeCode, c.jobTitle ?? "", c.homeBranchName ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [candidates, query]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    startTransition(async () => {
      const result = await assignCoverShiftAction({
        branchId,
        dateKey,
        shiftId,
        employeeIds: selected,
        reason,
        overwrite,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not assign the cover shift.");
        return;
      }
      const skipped = result.skipped ?? [];
      toast.success(
        `${result.assigned} ${result.assigned === 1 ? "person" : "people"} rostered at ${branchName}.` +
          (skipped.length ? ` Skipped (already had a change that day): ${skipped.join(", ")}.` : ""),
      );
      setOpen(false);
      setSelected([]);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowRightLeft className="size-3.5" />
            <span>Cover shift</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cover shift at {branchName}</DialogTitle>
          <DialogDescription>
            Roster people to work one shift here, including staff from other branches or Head Office. They
            can clock in at {branchName} for that shift only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="coverDate">Day</Label>
              <NativeSelect id="coverDate" value={dateKey} onChange={(e) => setDateKey(e.target.value)}>
                {days.map((d) => (
                  <option key={d.dateKey} value={d.dateKey}>
                    {d.dayName} {d.formattedDay}
                    {d.holidayName ? ` (${d.holidayName})` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverShift">Shift</Label>
              <NativeSelect id="coverShift" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({hhmm(s.startMinute)}–{hhmm(s.endMinute)})
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coverReason">Reason</Label>
            <Input
              id="coverReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Holiday supervision"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              People ({selected.length} selected)
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, code, job or branch"
                className="pl-9"
              />
            </div>
            <div className="rounded-lg border border-border bg-card p-1 max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">No one matches.</p>
              ) : (
                filtered.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.employeeCode}
                        {c.jobTitle ? ` · ${c.jobTitle}` : ""}
                        {c.homeBranchName ? ` · ${c.homeBranchName}` : ""}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <Switch id="coverOverwrite" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              <Label htmlFor="coverOverwrite">Replace changes already made for that day</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Off: anyone who already has a day off or shift change that day is skipped, and you are told who.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || selected.length === 0 || !shiftId || reason.trim().length < 3}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Roster {selected.length || ""} {selected.length === 1 ? "person" : "people"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
