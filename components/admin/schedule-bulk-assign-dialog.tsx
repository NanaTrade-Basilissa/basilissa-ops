"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Loader2, Square, Users } from "lucide-react";
import { toast } from "sonner";
import { bulkAssignShiftAction } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const DAYS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 7, label: "Sun" },
];

export function ScheduleBulkAssignDialog({
  branchId,
  branchName,
  employees,
  shifts,
  activeWeekStart,
}: {
  branchId: string;
  branchName: string;
  employees: { id: string; name: string; employeeCode: string | null }[];
  shifts: { id: string; name: string; startMinute: number; endMinute: number }[];
  activeWeekStart: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>(shifts[0]?.id ?? "");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // default Mon-Fri
  const [validFrom, setValidFrom] = useState(activeWeekStart);
  const [validTo, setValidTo] = useState("");

  const allSelected = employees.length > 0 && selectedEmpIds.length === employees.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedEmpIds([]);
    } else {
      setSelectedEmpIds(employees.map((e) => e.id));
    }
  }

  function toggleEmployee(id: string) {
    setSelectedEmpIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleDay(dayId: number) {
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId].sort(),
    );
  }

  function handleAssign() {
    if (selectedEmpIds.length === 0) {
      toast.error("Please select at least one staff member.");
      return;
    }
    if (!selectedShiftId) {
      toast.error("Please select a shift.");
      return;
    }
    if (selectedDays.length === 0) {
      toast.error("Please select at least one day of the week.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await bulkAssignShiftAction({
          employeeIds: selectedEmpIds,
          shiftId: selectedShiftId,
          daysOfWeek: selectedDays,
          validFrom,
          validTo: validTo || null,
          branchId,
        });

        if (result.ok) {
          toast.success(result.message || `Shift assigned to ${result.count} staff members.`);
          setOpen(false);
          router.refresh();
        } else {
          toast.error(result.error || "Failed to bulk assign shift.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to bulk assign shift.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Users className="size-3.5" />
            <span>Bulk Assign</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Assign Shift</DialogTitle>
          <DialogDescription>
            Assign a recurring shift pattern to multiple staff members at {branchName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* Shift selector */}
          <div className="space-y-1.5">
            <Label htmlFor="bulkShiftSelect">Shift Template</Label>
            <NativeSelect
              id="bulkShiftSelect"
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({String(Math.floor(s.startMinute / 60)).padStart(2, "0")}:{String(s.startMinute % 60).padStart(2, "0")} – {String(Math.floor(s.endMinute / 60)).padStart(2, "0")}:{String(s.endMinute % 60).padStart(2, "0")})
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Days of week selector */}
          <div className="space-y-1.5">
            <Label>Days of the Week</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => {
                const active = selectedDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "border border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulkValidFrom">Effective From</Label>
              <Input
                id="bulkValidFrom"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulkValidTo">Until (Optional)</Label>
              <Input
                id="bulkValidTo"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                placeholder="Indefinite"
              />
            </div>
          </div>

          {/* Employee multi-select checklist */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Select Staff ({selectedEmpIds.length}/{employees.length})</Label>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 max-h-48 overflow-y-auto space-y-1">
              {employees.length === 0 ? (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  No active staff assigned to this branch.
                </div>
              ) : (
                employees.map((emp) => {
                  const isChecked = selectedEmpIds.includes(emp.id);
                  return (
                    <div
                      key={emp.id}
                      onClick={() => toggleEmployee(emp.id)}
                      className="flex items-center gap-2.5 rounded-md p-1.5 text-xs hover:bg-muted/50 cursor-pointer select-none"
                    >
                      {isChecked ? (
                        <CheckSquare className="size-4 text-primary shrink-0" />
                      ) : (
                        <Square className="size-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium text-foreground">{emp.name}</span>
                      {emp.employeeCode && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ({emp.employeeCode})
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
            Assign to {selectedEmpIds.length} Staff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
