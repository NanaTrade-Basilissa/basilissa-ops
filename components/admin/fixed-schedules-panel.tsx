"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  Check,
  Laptop,
  Pencil,
  RotateCw,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  bulkAssignFixedScheduleAction,
  clearFixedScheduleAction,
} from "@/lib/modules/employees/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { id: 1, short: "Mon", full: "Monday" },
  { id: 2, short: "Tue", full: "Tuesday" },
  { id: 3, short: "Wed", full: "Wednesday" },
  { id: 4, short: "Thu", full: "Thursday" },
  { id: 5, short: "Fri", full: "Friday" },
  { id: 6, short: "Sat", full: "Saturday" },
  { id: 7, short: "Sun", full: "Sunday" },
] as const;

export type FixedScheduleEmployeeRow = {
  id: string;
  employeeCode: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  branchId: string | null;
  branchName: string;
  hasPattern: boolean;
  fixedAssignment: {
    id: string;
    shiftId: string;
    shiftName: string;
    timeRange: string;
    daysOfWeek: number[];
    remoteDaysOfWeek: number[];
    validFrom: string;
  } | null;
};

export type ShiftOptionItem = {
  id: string;
  name: string;
  timeRange: string;
  isActive: boolean;
};

function formatDaysList(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return "None";
  if (sorted.join(",") === "1,2,3,4,5") return "Mon–Fri";
  if (sorted.join(",") === "1,2,3,4,5,6") return "Mon–Sat";
  if (sorted.join(",") === "1,2,3,4,5,6,7") return "Every day";
  return sorted.map((d) => WEEKDAYS.find((w) => w.id === d)?.short ?? String(d)).join(", ");
}

export function FixedSchedulesPanel({
  employees,
  shifts,
  branches,
  canManage,
}: {
  employees: FixedScheduleEmployeeRow[];
  shifts: ShiftOptionItem[];
  branches: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState<"all" | "fixed" | "rotating">("all");

  // Selection for bulk assignment
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Assign / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalEmployeeIds, setModalEmployeeIds] = useState<string[]>([]);
  const [modalTitle, setModalTitle] = useState("Assign Fixed Schedule");
  const activeShifts = useMemo(() => shifts.filter((s) => s.isActive), [shifts]);
  const [shiftId, setShiftId] = useState(activeShifts[0]?.id ?? "");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [remoteDaysOfWeek, setRemoteDaysOfWeek] = useState<number[]>([]);
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (branchFilter !== "all" && e.branchId !== branchFilter) return false;
      if (modeFilter === "fixed" && !e.fixedAssignment) return false;
      if (modeFilter === "rotating" && e.fixedAssignment) return false;
      if (q) {
        const hay = `${e.name} ${e.employeeCode} ${e.jobTitle ?? ""} ${e.department ?? ""} ${e.branchName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, search, branchFilter, modeFilter]);

  const fixedCount = useMemo(() => employees.filter((e) => e.fixedAssignment).length, [employees]);
  const remoteCount = useMemo(
    () => employees.filter((e) => (e.fixedAssignment?.remoteDaysOfWeek.length ?? 0) > 0).length,
    [employees],
  );
  const rotatingCount = employees.length - fixedCount;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filteredEmployees.map((e) => e.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      const removeSet = new Set(filteredIds);
      setSelectedIds((prev) => prev.filter((id) => !removeSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  }

  function openEditSingle(emp: FixedScheduleEmployeeRow) {
    setModalEmployeeIds([emp.id]);
    setModalTitle(`Fixed Schedule — ${emp.name}`);
    setShiftId(emp.fixedAssignment?.shiftId ?? activeShifts[0]?.id ?? "");
    setDaysOfWeek(emp.fixedAssignment?.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setRemoteDaysOfWeek(emp.fixedAssignment?.remoteDaysOfWeek ?? []);
    setValidFrom(new Date().toISOString().slice(0, 10));
    setIsModalOpen(true);
  }

  function openBulkAssign() {
    if (selectedIds.length === 0) {
      toast.error("Select one or more employees using the checkboxes first.");
      return;
    }
    setModalEmployeeIds(selectedIds);
    setModalTitle(`Assign Fixed Schedule (${selectedIds.length} staff)`);
    setShiftId(activeShifts[0]?.id ?? "");
    setDaysOfWeek([1, 2, 3, 4, 5]);
    setRemoteDaysOfWeek([]);
    setValidFrom(new Date().toISOString().slice(0, 10));
    setIsModalOpen(true);
  }

  function toggleWorkingDay(dayId: number) {
    setDaysOfWeek((prev) => {
      if (prev.includes(dayId)) {
        // Also remove from remote days if unchecked as working day
        setRemoteDaysOfWeek((r) => r.filter((d) => d !== dayId));
        return prev.filter((d) => d !== dayId);
      }
      return [...prev, dayId].sort((a, b) => a - b);
    });
  }

  function toggleRemoteDay(dayId: number) {
    if (!daysOfWeek.includes(dayId)) return;
    setRemoteDaysOfWeek((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId].sort((a, b) => a - b),
    );
  }

  function handleSaveFixedSchedule() {
    if (!shiftId) {
      toast.error("Please select a shift template.");
      return;
    }
    if (daysOfWeek.length === 0) {
      toast.error("Select at least one working day.");
      return;
    }

    startTransition(async () => {
      const res = await bulkAssignFixedScheduleAction({
        employeeIds: modalEmployeeIds,
        shiftId,
        daysOfWeek,
        remoteDaysOfWeek,
        validFrom,
      });

      if (res.ok) {
        toast.success(`Fixed schedule saved for ${res.count} employee(s).`);
        setIsModalOpen(false);
        setSelectedIds([]);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to assign fixed schedule.");
      }
    });
  }

  function handleSwitchToRotating(emp: FixedScheduleEmployeeRow) {
    startTransition(async () => {
      const res = await clearFixedScheduleAction(emp.id);
      if (res.ok) {
        toast.success(`${emp.name} switched to Rotating Weekly Rota.`);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update schedule mode.");
      }
    });
  }

  const allFilteredSelected =
    filteredEmployees.length > 0 && filteredEmployees.every((e) => selectedIds.includes(e.id));

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Fixed Schedule Staff</p>
            <p className="text-xl font-bold text-foreground">{fixedCount}</p>
          </div>
          <CalendarCheck className="size-5 text-emerald-600" />
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Hybrid / Remote Days Configured</p>
            <p className="text-xl font-bold text-foreground">{remoteCount}</p>
          </div>
          <Laptop className="size-5 text-blue-600" />
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Rotating Shift / Unassigned</p>
            <p className="text-xl font-bold text-foreground">{rotatingCount}</p>
          </div>
          <RotateCw className="size-5 text-purple-600" />
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, code, job title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>

          <NativeSelect
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[150px]"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>

          <NativeSelect
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as "all" | "fixed" | "rotating")}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[160px]"
          >
            <option value="all">All Schedule Modes</option>
            <option value="fixed">Fixed Schedule Only</option>
            <option value="rotating">Rotating / Unassigned</option>
          </NativeSelect>
        </div>

        {canManage && (
          <Button
            type="button"
            size="sm"
            onClick={openBulkAssign}
            disabled={selectedIds.length === 0 || isPending}
            className="h-9 gap-1.5 text-xs"
          >
            <Users className="size-3.5" />
            <span>
              Assign Fixed Schedule{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </span>
          </Button>
        )}
      </div>

      {/* Staff Schedule Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {canManage && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all visible employees"
                    className="size-4 rounded border-border cursor-pointer"
                  />
                </TableHead>
              )}
              <TableHead>Employee</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Fixed Shift & Days</TableHead>
              <TableHead>Remote / WFH Days</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 7 : 5} className="text-center py-8 text-xs text-muted-foreground">
                  No employees match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((emp) => {
                const isSelected = selectedIds.includes(emp.id);
                const fixed = emp.fixedAssignment;
                return (
                  <TableRow key={emp.id} className={cn(isSelected && "bg-primary/5")}>
                    {canManage && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(emp.id)}
                          aria-label={`Select ${emp.name}`}
                          className="size-4 rounded border-border cursor-pointer"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground">{emp.name}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{emp.employeeCode}</span>
                          {emp.jobTitle ? ` · ${emp.jobTitle}` : ""}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{emp.branchName}</TableCell>
                    <TableCell>
                      {fixed ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px]">
                          Fixed Schedule
                        </Badge>
                      ) : emp.hasPattern ? (
                        <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-[11px]">
                          Rotating Pattern
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          Weekly Rota
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {fixed ? (
                        <div className="space-y-0.5">
                          <div className="text-xs font-medium text-foreground">
                            {fixed.shiftName}{" "}
                            <span className="text-muted-foreground font-normal">({fixed.timeRange})</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDaysList(fixed.daysOfWeek)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {fixed && fixed.remoteDaysOfWeek.length > 0 ? (
                        <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-700 text-[11px]">
                          <Laptop className="size-3" />
                          <span>{formatDaysList(fixed.remoteDaysOfWeek)}</span>
                        </Badge>
                      ) : fixed ? (
                        <span className="text-xs text-muted-foreground">On-site only</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEditSingle(emp)}
                            disabled={isPending}
                            className="h-7 px-2 text-xs gap-1"
                          >
                            <Pencil className="size-3" />
                            <span>{fixed ? "Edit" : "Set Fixed"}</span>
                          </Button>
                          {fixed && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSwitchToRotating(emp)}
                              disabled={isPending}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              title="Remove fixed schedule so this employee uses the Rotating Weekly Rota"
                            >
                              Switch to Rota
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Assign / Edit Fixed Schedule Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            <DialogDescription className="text-xs">
              Configure regular working days and optional remote (work-from-home) days. Public holidays apply automatically when enabled on the shift template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="fixed-shift-template">Shift Template</Label>
              <NativeSelect
                id="fixed-shift-template"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="text-xs"
              >
                {activeShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.timeRange})
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Working Days</Label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDaysOfWeek([1, 2, 3, 4, 5]);
                      setRemoteDaysOfWeek((r) => r.filter((d) => d <= 5));
                    }}
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    Mon–Fri
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDaysOfWeek([1, 2, 3, 4, 5, 6]);
                      setRemoteDaysOfWeek((r) => r.filter((d) => d <= 6));
                    }}
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    Mon–Sat
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = daysOfWeek.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => toggleWorkingDay(day.id)}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-lg border py-2 text-xs font-semibold transition-colors cursor-pointer",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-blue-200/80 bg-blue-50/40 p-3">
              <div className="flex items-center gap-1.5">
                <Laptop className="size-3.5 text-blue-600" />
                <Label className="mb-0 text-blue-950">Remote / Work-From-Home Days (Optional)</Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Select any working days where this person works remotely instead of coming to the office.
              </p>
              <div className="grid grid-cols-7 gap-1.5 pt-1">
                {WEEKDAYS.map((day) => {
                  const isWorking = daysOfWeek.includes(day.id);
                  const isRemote = remoteDaysOfWeek.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      disabled={!isWorking}
                      onClick={() => toggleRemoteDay(day.id)}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-lg border py-1.5 text-[11px] font-semibold transition-colors",
                        !isWorking
                          ? "border-border/40 bg-muted/20 text-muted-foreground/40 cursor-not-allowed"
                          : isRemote
                          ? "border-blue-500 bg-blue-600 text-white cursor-pointer"
                          : "border-border bg-background text-foreground hover:border-blue-300 cursor-pointer",
                      )}
                    >
                      <span>{day.short}</span>
                      {isRemote && <Check className="size-2.5 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fixed-valid-from">Effective From</Label>
              <Input
                id="fixed-valid-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="text-xs max-w-48"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveFixedSchedule} disabled={isPending}>
              {isPending ? "Saving..." : "Save Fixed Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
