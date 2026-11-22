"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, CalendarSync, ChevronDown, RotateCcw, Search, User, UserCheck } from "lucide-react";
import { ScheduleExceptionType } from "@prisma/client";
import { ScheduleOverrideDialog } from "@/components/admin/schedule-override-dialog";
import { ScheduleBulkAssignDialog } from "@/components/admin/schedule-bulk-assign-dialog";
import {
  ScheduleAssignPatternDialog,
  type AssignablePattern,
} from "@/components/admin/schedule-assign-pattern-dialog";
import type { CycleShift } from "@/components/admin/pattern-cycle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { minutesToTime } from "@/lib/modules/employees/validation";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { dateKeyInZone } from "@/lib/platform/date";

/** Reason text on days written by "Generate week"; see generatePatternWeek. */
const GENERATED_PREFIX = "Generated from rota pattern";

export type DayColumn = {
  dateKey: string;
  dayName: string;
  formattedDay: string;
  isoWeekday: number;
  holidayName: string | null;
};

export type EmployeeDaySchedule = {
  dateKey: string;
  shiftId: string | null;
  shiftName: string | null;
  startMinute: number | null;
  endMinute: number | null;
  isException: boolean;
  isPattern?: boolean;
  exceptionId?: string;
  exceptionType?: ScheduleExceptionType;
  exceptionReason?: string;
  overtimeMinutes?: number | null;
  coverBranchName?: string | null;
  isAway?: boolean;
};

export type EmployeeScheduleRow = {
  employeeId: string;
  name: string;
  employeeCode: string | null;
  jobTitle: string | null;
  days: Record<string, EmployeeDaySchedule>;
  isVisitor: boolean;
  homeBranchName: string | null;
  patternName: string | null;
};

export type DailyCoverage = {
  dateKey: string;
  totalScheduled: number;
  totalDayOff: number;
  shiftCounts: Record<string, number>;
};

export type WeeklyScheduleData = {
  branchId: string;
  branchName: string;
  autoRota: boolean;
  schedulingMode?: "ROTATING_ROTA" | "FIXED_SCHEDULE";
  weekStartKey: string;
  days: DayColumn[];
  shifts: {
    id: string;
    name: string;
    startMinute: number;
    endMinute: number;
  }[];
  employees: EmployeeScheduleRow[];
  coverage: Record<string, DailyCoverage>;
};

export function WeeklyScheduleGrid({
  data,
  canManage,
  toolbarFilters,
  toolbarActions,
  patterns = [],
  patternShifts = [],
}: {
  data: WeeklyScheduleData;
  canManage: boolean;
  toolbarFilters?: ReactNode;
  toolbarActions?: ReactNode;
  patterns?: AssignablePattern[];
  patternShifts?: CycleShift[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [shiftTarget, setShiftTarget] = useState<EmployeeScheduleRow | null>(null);
  const [patternTarget, setPatternTarget] = useState<EmployeeScheduleRow | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: string;
    employeeName: string;
    dateKey: string;
    formattedDate: string;
    currentShiftId: string | null;
    currentShiftName: string | null;
    isException: boolean;
    exceptionId?: string;
    exceptionType?: ScheduleExceptionType;
    exceptionReason?: string;
    overtimeMinutes?: number | null;
  } | null>(null);

  const todayKey = dateKeyInZone(new Date(), DISPLAY_TIMEZONE);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.employees;
    return data.employees.filter((emp) => {
      const hay = `${emp.name} ${emp.employeeCode ?? ""} ${emp.jobTitle ?? ""} ${emp.patternName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data.employees, search]);

  function handleCellClick(emp: EmployeeScheduleRow, day: DayColumn) {
    if (!canManage) return;

    const daySchedule = emp.days[day.dateKey];
    if (emp.isVisitor && !daySchedule.coverBranchName) return;
    setSelectedCell({
      employeeId: emp.employeeId,
      employeeName: emp.name,
      dateKey: day.dateKey,
      formattedDate: `${day.dayName}, ${day.formattedDay}`,
      currentShiftId: daySchedule.shiftId,
      currentShiftName: daySchedule.shiftName,
      isException: daySchedule.isException,
      exceptionId: daySchedule.exceptionId,
      exceptionType: daySchedule.exceptionType,
      exceptionReason: daySchedule.exceptionReason,
      overtimeMinutes: daySchedule.overtimeMinutes ?? null,
    });
  }

  return (
    <div className="space-y-3">
      {/* Unified toolbar: Search + Branch + Week Navigator + Actions */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full shrink-0 sm:w-56 md:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="rota-search"
              placeholder="Search employee, code, role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>

          {search.trim() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSearch("")}
              className="h-9 gap-1.5 text-xs"
              title="Clear search"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}

          {toolbarFilters}
        </div>

        {toolbarActions && (
          <div className="flex items-center justify-end gap-2">{toolbarActions}</div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
        <table className="w-full min-w-[920px] text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th scope="col" className="p-3.5 pl-4 w-56">
                Employee ({search.trim() ? `${filteredEmployees.length}/${data.employees.length}` : data.employees.length})
              </th>
              {data.days.map((day) => {
                const isToday = day.dateKey === todayKey;
                return (
                  <th
                    key={day.dateKey}
                    scope="col"
                    className={`p-3 text-center min-w-28 ${
                      isToday ? "bg-primary/5 font-bold text-foreground" : ""
                    }`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="flex items-center gap-1">
                        {day.dayName}
                        {isToday && (
                          <span className="inline-block size-1.5 rounded-full bg-primary" />
                        )}
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground lowercase">
                        {day.formattedDay}
                      </span>
                      {day.holidayName && (
                        <span
                          className="mt-0.5 max-w-24 truncate rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                          title={day.holidayName}
                        >
                          {day.holidayName}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  {search.trim()
                    ? `No employees matching "${search.trim()}" at this branch.`
                    : "No active employees assigned to this branch."}
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => (
                <tr key={emp.employeeId} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3 pl-4 align-middle">
                    {canManage && !emp.isVisitor ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              className="group inline-flex max-w-52 cursor-pointer items-center gap-1 text-left font-medium text-foreground hover:underline"
                            >
                              <span className="truncate">{emp.name}</span>
                              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
                            </button>
                          }
                        />
                        <DropdownMenuContent
                          align="start"
                          className="w-auto min-w-48 [&_[role=menuitem]]:whitespace-nowrap"
                        >
                          <DropdownMenuItem onClick={() => setShiftTarget(emp)}>
                            <CalendarPlus className="size-4" />
                            Assign shift
                          </DropdownMenuItem>
                          {patterns.length > 0 && (
                            <DropdownMenuItem onClick={() => setPatternTarget(emp)}>
                              <CalendarSync className="size-4" />
                              Assign rota pattern
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => router.push(`/admin/employees/${emp.employeeId}`)}>
                            <User className="size-4" />
                            View employee profile
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Link
                        href={`/admin/employees/${emp.employeeId}`}
                        className="font-medium text-foreground hover:underline block truncate max-w-52"
                      >
                        {emp.name}
                      </Link>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {emp.employeeCode && (
                        <span className="font-mono text-[11px]">{emp.employeeCode}</span>
                      )}
                      {emp.jobTitle && <span>· {emp.jobTitle}</span>}
                    </div>
                    {emp.patternName && (
                      <span className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                        {emp.patternName}
                      </span>
                    )}
                    {emp.isVisitor && (
                      <span className="mt-1 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                        Covering from {emp.homeBranchName ?? "another branch"}
                      </span>
                    )}
                  </td>
                  {data.days.map((day) => {
                    const sched = emp.days[day.dateKey];
                    const isToday = day.dateKey === todayKey;

                    return (
                      <td
                        key={day.dateKey}
                        onClick={() => handleCellClick(emp, day)}
                        className={`p-2 text-center align-middle transition-colors ${
                          isToday ? "bg-primary/5" : ""
                        } ${
                          canManage && !(emp.isVisitor && !sched.coverBranchName)
                            ? "cursor-pointer hover:bg-muted/40"
                            : ""
                        }`}
                        title={
                          sched.isException
                            ? `Override: ${sched.exceptionReason || "Adjusted"}`
                            : canManage
                            ? "Click to adjust schedule or mark day off"
                            : undefined
                        }
                      >
                        {sched.shiftName && sched.isAway ? (
                          <div className="inline-flex flex-col items-center justify-center rounded-lg border border-dashed border-sky-400/60 bg-sky-500/5 px-2 py-1 text-xs text-sky-900 dark:text-sky-200 w-full min-h-12">
                            <span className="font-semibold truncate max-w-24">At {sched.coverBranchName}</span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-24">{sched.shiftName}</span>
                          </div>
                        ) : sched.shiftName ? (
                          <div
                            className={`inline-flex flex-col items-center justify-center rounded-lg px-2 py-1 text-xs transition-all w-full min-h-12 ${
                              sched.coverBranchName
                                ? "border border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200"
                                : sched.isPattern || (sched.isException && sched.exceptionReason?.startsWith(GENERATED_PREFIX))
                                ? "border border-violet-300/80 bg-violet-50/80 text-violet-900 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
                                : sched.isException &&
                                    !(sched.exceptionType === ScheduleExceptionType.EXTRA_SHIFT && sched.exceptionReason === "Scheduled shift")
                                ? "border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                                : "border border-border/80 bg-background text-foreground shadow-2xs"
                            }`}
                          >
                            <span className="font-semibold truncate max-w-24">
                              {sched.shiftName}
                            </span>
                            {sched.startMinute != null && sched.endMinute != null && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {minutesToTime(sched.startMinute)}–{minutesToTime(sched.endMinute)}
                              </span>
                            )}
                            {sched.coverBranchName ? (
                              <span className="text-[9px] uppercase font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                                cover
                              </span>
                            ) : sched.exceptionType === ScheduleExceptionType.OVERTIME || (sched.overtimeMinutes != null && sched.overtimeMinutes > 0) ? (
                              <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded border border-amber-500/30 mt-0.5">
                                +{sched.overtimeMinutes ? (sched.overtimeMinutes >= 60 ? `${sched.overtimeMinutes / 60}h` : `${sched.overtimeMinutes}m`) : "OT"}
                              </span>
                            ) : sched.isPattern || (sched.isException && sched.exceptionReason?.startsWith(GENERATED_PREFIX)) ? (
                              <span className="text-[9px] uppercase font-bold text-violet-700 dark:text-violet-300 mt-0.5">
                                pattern
                              </span>
                            ) : sched.isException &&
                              !(sched.exceptionType === ScheduleExceptionType.EXTRA_SHIFT && sched.exceptionReason === "Scheduled shift") ? (
                              <span className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                                override
                              </span>
                            ) : null}
                          </div>
                        ) : sched.exceptionType === ScheduleExceptionType.DAY_OFF ? (
                          <div className="inline-flex flex-col items-center justify-center rounded-lg px-2 py-1 text-xs border border-muted bg-muted/30 text-muted-foreground w-full min-h-12">
                            <span className="font-medium text-xs">Day off</span>
                            {sched.exceptionReason?.startsWith(GENERATED_PREFIX) ? (
                              <span className="text-[9px] uppercase font-bold text-violet-600 dark:text-violet-400">
                                pattern
                              </span>
                            ) : (
                              <span className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400">
                                override
                              </span>
                            )}
                          </div>
                        ) : day.holidayName && !emp.isVisitor ? (
                          <div className="flex items-center justify-center min-h-12 text-rose-700/70 dark:text-rose-300/70 text-xs font-medium">
                            Holiday
                          </div>
                        ) : (
                          <div className="flex items-center justify-center min-h-12 text-muted-foreground/40 text-xs">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/40 text-xs font-medium">
              <td className="p-3 pl-4 text-foreground font-semibold flex items-center gap-1.5">
                <UserCheck className="size-4 text-muted-foreground" />
                Total on duty
              </td>
              {data.days.map((day) => {
                const cov = data.coverage[day.dateKey];
                const isToday = day.dateKey === todayKey;

                return (
                  <td
                    key={day.dateKey}
                    className={`p-2.5 text-center align-top ${
                      isToday ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="font-bold text-sm text-foreground">
                      {cov.totalScheduled}
                    </div>
                    {cov.totalScheduled > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1 text-[10px] text-muted-foreground">
                        {data.shifts.map((s) => {
                          const count = cov.shiftCounts[s.id] || 0;
                          if (count === 0) return null;
                          return (
                            <span key={s.id} className="truncate">
                              {count} {s.name.split(" ")[0]}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {canManage && selectedCell && (
        <ScheduleOverrideDialog
          open={Boolean(selectedCell)}
          onOpenChange={(open) => {
            if (!open) setSelectedCell(null);
          }}
          employeeId={selectedCell.employeeId}
          employeeName={selectedCell.employeeName}
          branchId={data.branchId}
          dateKey={selectedCell.dateKey}
          formattedDate={selectedCell.formattedDate}
          currentShiftId={selectedCell.currentShiftId}
          currentShiftName={selectedCell.currentShiftName}
          isException={selectedCell.isException}
          exceptionId={selectedCell.exceptionId}
          exceptionType={selectedCell.exceptionType}
          exceptionReason={selectedCell.exceptionReason}
          overtimeMinutes={selectedCell.overtimeMinutes ?? undefined}
          shifts={data.shifts}
        />
      )}
      {canManage && shiftTarget && (
        <ScheduleBulkAssignDialog
          open={Boolean(shiftTarget)}
          onOpenChange={(open) => {
            if (!open) setShiftTarget(null);
          }}
          branchId={data.branchId}
          branchName={data.branchName}
          employees={[{ id: shiftTarget.employeeId, name: shiftTarget.name, employeeCode: shiftTarget.employeeCode }]}
          targetEmployee={{ id: shiftTarget.employeeId, name: shiftTarget.name, employeeCode: shiftTarget.employeeCode }}
          shifts={data.shifts}
          activeWeekStart={data.weekStartKey}
        />
      )}

      {canManage && patternTarget && (
        <ScheduleAssignPatternDialog
          open={Boolean(patternTarget)}
          onOpenChange={(open) => {
            if (!open) setPatternTarget(null);
          }}
          branchId={data.branchId}
          branchName={data.branchName}
          weekStartKey={data.weekStartKey}
          patterns={patterns}
          shifts={patternShifts}
          employees={[
            {
              id: patternTarget.employeeId,
              name: patternTarget.name,
              employeeCode: patternTarget.employeeCode,
              patternName: patternTarget.patternName,
            },
          ]}
          targetEmployee={{
            id: patternTarget.employeeId,
            name: patternTarget.name,
            employeeCode: patternTarget.employeeCode,
            patternName: patternTarget.patternName,
          }}
        />
      )}
    </div>
  );
}
