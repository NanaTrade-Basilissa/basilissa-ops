"use client";

import { useState } from "react";
import Link from "next/link";
import { UserCheck } from "lucide-react";
import { ScheduleExceptionType } from "@prisma/client";
import { ScheduleOverrideDialog } from "@/components/admin/schedule-override-dialog";
import { minutesToTime } from "@/lib/modules/employees/validation";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { dateKeyInZone } from "@/lib/platform/date";

export type DayColumn = {
  dateKey: string;
  dayName: string;
  formattedDay: string;
  isoWeekday: number;
};

export type EmployeeDaySchedule = {
  dateKey: string;
  shiftId: string | null;
  shiftName: string | null;
  startMinute: number | null;
  endMinute: number | null;
  isException: boolean;
  exceptionId?: string;
  exceptionType?: ScheduleExceptionType;
  exceptionReason?: string;
};

export type EmployeeScheduleRow = {
  employeeId: string;
  name: string;
  employeeCode: string | null;
  jobTitle: string | null;
  days: Record<string, EmployeeDaySchedule>;
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
}: {
  data: WeeklyScheduleData;
  canManage: boolean;
}) {
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
  } | null>(null);

  const todayKey = dateKeyInZone(new Date(), DISPLAY_TIMEZONE);

  function handleCellClick(emp: EmployeeScheduleRow, day: DayColumn) {
    if (!canManage) return;

    const daySchedule = emp.days[day.dateKey];
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
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
        <table className="w-full min-w-[920px] text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th scope="col" className="p-3.5 pl-4 w-56">
                Employee ({data.employees.length})
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
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No active employees assigned to this branch.
                </td>
              </tr>
            ) : (
              data.employees.map((emp) => (
                <tr key={emp.employeeId} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3 pl-4 align-middle">
                    <Link
                      href={`/admin/employees/${emp.employeeId}`}
                      className="font-medium text-foreground hover:underline block truncate max-w-52"
                    >
                      {emp.name}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {emp.employeeCode && (
                        <span className="font-mono text-[11px]">{emp.employeeCode}</span>
                      )}
                      {emp.jobTitle && <span>· {emp.jobTitle}</span>}
                    </div>
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
                          canManage
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
                        {sched.shiftName ? (
                          <div
                            className={`inline-flex flex-col items-center justify-center rounded-lg px-2 py-1 text-xs transition-all w-full min-h-12 ${
                              sched.isException
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
                            {sched.isException && (
                              <span className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                                override
                              </span>
                            )}
                          </div>
                        ) : sched.exceptionType === ScheduleExceptionType.DAY_OFF ? (
                          <div className="inline-flex flex-col items-center justify-center rounded-lg px-2 py-1 text-xs border border-muted bg-muted/30 text-muted-foreground w-full min-h-12">
                            <span className="font-medium text-xs">Day off</span>
                            <span className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400">
                              override
                            </span>
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
          shifts={data.shifts}
        />
      )}
    </div>
  );
}
