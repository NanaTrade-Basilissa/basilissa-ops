"use server";

import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";
import { shiftDateKey } from "@/lib/platform/date";
import {
  resolveScheduleForDate,
  type ShiftTemplate,
  type ScheduleInputs,
} from "@/lib/modules/attendance/schedule";
import { ScheduleExceptionType } from "@prisma/client";

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
  shiftCounts: Record<string, number>; // shiftId -> count
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

/**
 * Loads the weekly rota and staff schedule for one branch from Monday to Sunday.
 */
export async function getWeeklyBranchSchedule(
  scope: BranchScope,
  branchId: string,
  weekStartKey: string,
): Promise<WeeklyScheduleData | null> {
  // Authorization: scope enforcement
  if (scope.kind === "branches" && !scope.branchIds.includes(branchId)) {
    return null;
  }
  if (scope.kind === "none") {
    return null;
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, timezone: true },
  });
  if (!branch) return null;

  const timeZone = branch.timezone || "Africa/Accra";

  // Build the 7 days: Monday to Sunday
  const days: DayColumn[] = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const dateKey = shiftDateKey(weekStartKey, offset);
    const [year, month, day] = dateKey.split("-").map(Number);
    const dateObj = new Date(Date.UTC(year!, month! - 1, day!));
    const dayName = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dateObj);
    const formattedDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(dateObj);
    const isoWeekday = offset + 1; // 1 = Mon ... 7 = Sun
    return { dateKey, dayName, formattedDay, isoWeekday };
  });

  const weekStartDate = new Date(`${days[0].dateKey}T00:00:00.000Z`);
  const weekEndDate = new Date(`${days[6].dateKey}T23:59:59.999Z`);

  // Active employees assigned to this branch
  const branchAssignments = await prisma.employeeBranchAssignment.findMany({
    where: {
      branchId,
      validTo: null,
      employee: { status: "ACTIVE" },
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          jobTitle: true,
        },
      },
    },
    orderBy: [
      { employee: { lastName: "asc" } },
      { employee: { firstName: "asc" } },
    ],
  });

  const employeeIds = branchAssignments.map((ba) => ba.employee.id);

  // Available shifts for this branch (branch-specific + global)
  const shifts = await prisma.shift.findMany({
    where: {
      isActive: true,
      OR: [{ branchId }, { branchId: null }],
    },
    select: {
      id: true,
      name: true,
      startMinute: true,
      endMinute: true,
      unpaidBreakMinutes: true,
    },
    orderBy: { startMinute: "asc" },
  });

  const shiftTemplates: ShiftTemplate[] = shifts.map((s) => ({
    id: s.id,
    name: s.name,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    unpaidBreakMinutes: s.unpaidBreakMinutes,
  }));

  // Recurring shift assignments for these employees
  const shiftAssignments = await prisma.employeeShiftAssignment.findMany({
    where: {
      employeeId: { in: employeeIds },
      validFrom: { lte: weekEndDate },
      OR: [{ validTo: null }, { validTo: { gte: weekStartDate } }],
    },
    select: {
      employeeId: true,
      shiftId: true,
      daysOfWeek: true,
      validFrom: true,
      validTo: true,
    },
  });

  // Schedule exceptions for these employees in this week
  const exceptions = await prisma.scheduleException.findMany({
    where: {
      employeeId: { in: employeeIds },
      date: { gte: weekStartDate, lte: weekEndDate },
    },
    include: { shift: true },
  });

  // Coverage tracker per dateKey
  const coverage: Record<string, DailyCoverage> = {};
  for (const d of days) {
    coverage[d.dateKey] = {
      dateKey: d.dateKey,
      totalScheduled: 0,
      totalDayOff: 0,
      shiftCounts: {},
    };
    for (const s of shifts) {
      coverage[d.dateKey].shiftCounts[s.id] = 0;
    }
  }

  // Resolve schedule for each employee for each day
  const employees: EmployeeScheduleRow[] = branchAssignments.map((ba) => {
    const emp = ba.employee;
    const empAssignments = shiftAssignments.filter((sa) => sa.employeeId === emp.id);
    const empExceptions = exceptions.filter((ex) => ex.employeeId === emp.id);

    const scheduleInputs: ScheduleInputs = {
      timeZone,
      shifts: shiftTemplates,
      assignments: empAssignments,
      exceptions: empExceptions.map((ex) => ({
        dateKey: ex.date.toISOString().slice(0, 10),
        type: ex.type,
        shiftId: ex.shiftId,
      })),
    };

    const daySchedules: Record<string, EmployeeDaySchedule> = {};

    for (const d of days) {
      const resolved = resolveScheduleForDate(d.dateKey, scheduleInputs);
      const ex = empExceptions.find((e) => e.date.toISOString().slice(0, 10) === d.dateKey);

      if (resolved) {
        daySchedules[d.dateKey] = {
          dateKey: d.dateKey,
          shiftId: resolved.shiftId,
          shiftName: resolved.shiftName,
          startMinute: shifts.find((s) => s.id === resolved.shiftId)?.startMinute ?? null,
          endMinute: shifts.find((s) => s.id === resolved.shiftId)?.endMinute ?? null,
          isException: resolved.source === "exception",
          exceptionId: ex?.id,
          exceptionType: ex?.type,
          exceptionReason: ex?.reason,
        };

        coverage[d.dateKey].totalScheduled += 1;
        coverage[d.dateKey].shiftCounts[resolved.shiftId] =
          (coverage[d.dateKey].shiftCounts[resolved.shiftId] || 0) + 1;
      } else if (ex?.type === ScheduleExceptionType.DAY_OFF) {
        daySchedules[d.dateKey] = {
          dateKey: d.dateKey,
          shiftId: null,
          shiftName: null,
          startMinute: null,
          endMinute: null,
          isException: true,
          exceptionId: ex.id,
          exceptionType: ScheduleExceptionType.DAY_OFF,
          exceptionReason: ex.reason,
        };
        coverage[d.dateKey].totalDayOff += 1;
      } else {
        daySchedules[d.dateKey] = {
          dateKey: d.dateKey,
          shiftId: null,
          shiftName: null,
          startMinute: null,
          endMinute: null,
          isException: false,
        };
      }
    }

    return {
      employeeId: emp.id,
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      employeeCode: emp.employeeCode,
      jobTitle: emp.jobTitle,
      days: daySchedules,
    };
  });

  return {
    branchId: branch.id,
    branchName: branch.name,
    weekStartKey,
    days,
    shifts,
    employees,
    coverage,
  };
}
