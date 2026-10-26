import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { LeaveCycleStatus, LeaveStatus, LeaveType, ScheduleExceptionType } from "@prisma/client";
import { getDateRangeKeys } from "./leave";
import { sendEmployeePushNotification } from "@/lib/platform/push";
import { recordInboxNotification } from "@/lib/platform/inbox";
import { scoped } from "@/lib/platform/logger";

const log = scoped("attendance.leave-cycle");

export const ROLE_CATEGORIES = {
  COOK: "COOK",
  FRONT_OF_HOUSE: "FRONT_OF_HOUSE",
  CLEANER: "CLEANER",
  SUPERVISOR: "SUPERVISOR",
  OTHER: "OTHER",
} as const;

export type JobRoleCategory = (typeof ROLE_CATEGORIES)[keyof typeof ROLE_CATEGORIES];

/**
 * Standardizes raw job titles into critical restaurant operational role categories.
 */
export function normalizeJobCategory(jobTitle?: string | null): JobRoleCategory {
  if (!jobTitle) return "OTHER";
  const title = jobTitle.toLowerCase().trim();

  // Check CLEANER first so titles like "Kitchen Cleaner" are categorized as CLEANER
  if (
    title.includes("clean") ||
    title.includes("dish") ||
    title.includes("sanit") ||
    title.includes("utility") ||
    title.includes("porter") ||
    title.includes("janitor")
  ) {
    return "CLEANER";
  }

  // Check SUPERVISOR / Management
  if (
    title.includes("manager") ||
    title.includes("supervisor") ||
    title.includes("lead") ||
    title.includes("in-charge")
  ) {
    return "SUPERVISOR";
  }

  // Check COOK / Kitchen production
  if (
    title.includes("cook") ||
    title.includes("chef") ||
    title.includes("kitchen") ||
    title.includes("pastry") ||
    title.includes("baker") ||
    title.includes("grill") ||
    title.includes("fry")
  ) {
    return "COOK";
  }

  // Check FRONT_OF_HOUSE / Guest service
  if (
    title.includes("cashier") ||
    title.includes("waiter") ||
    title.includes("waitress") ||
    title.includes("server") ||
    title.includes("counter") ||
    title.includes("front") ||
    title.includes("host") ||
    title.includes("barista")
  ) {
    return "FRONT_OF_HOUSE";
  }

  return "OTHER";
}

/**
 * Calculates ISO-8601 week string, e.g., "2027-W08".
 */
export function getIsoWeekString(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Returns Monday 00:00:00 to Sunday 23:59:59 dates for a given ISO week string (e.g. "2027-W14").
 */
export function getDatesFromIsoWeek(isoWeek: string): {
  startDate: Date;
  endDate: Date;
  startDateStr: string;
  endDateStr: string;
  year: number;
  weekNumber: number;
} {
  const [yearStr, weekStr] = isoWeek.split("-W");
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);

  // Jan 4th is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // 1 = Monday, 7 = Sunday
  const mondayWeek1 = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);

  const startUtc = new Date(mondayWeek1.getTime() + (week - 1) * 7 * 86400000);
  const endUtc = new Date(startUtc.getTime() + 6 * 86400000);

  const startDateStr = startUtc.toISOString().slice(0, 10);
  const endDateStr = endUtc.toISOString().slice(0, 10);

  return {
    startDate: startUtc,
    endDate: endUtc,
    startDateStr,
    endDateStr,
    year,
    weekNumber: week,
  };
}

/**
 * Generates all ISO week strings for a given calendar year (52 or 53 weeks).
 */
export function getAllWeeksInYear(year: number): string[] {
  const weeks: string[] = [];
  // December 28th is always in the last ISO week of the year
  const lastDay = new Date(Date.UTC(year, 11, 28));
  const lastWeekStr = getIsoWeekString(lastDay);
  const totalWeeks = parseInt(lastWeekStr.split("-W")[1], 10);

  for (let w = 1; w <= totalWeeks; w++) {
    weeks.push(`${year}-W${String(w).padStart(2, "0")}`);
  }
  return weeks;
}

/**
 * 12-Month Probation Engine.
 * Staff cannot take annual leave before their 1-year work anniversary.
 */
export function calculateProbationEndDate(hireDate?: Date | null): Date | null {
  if (!hireDate) return null;
  const probationEnd = new Date(hireDate);
  probationEnd.setFullYear(probationEnd.getFullYear() + 1);
  return probationEnd;
}

export function isProbationCleared(
  employee: { hireDate?: Date | null; probationEndDate?: Date | null },
  targetDate: Date
): boolean {
  const effectiveProbationEnd = employee.probationEndDate || calculateProbationEndDate(employee.hireDate);
  if (!effectiveProbationEnd) return true; // If no hire date recorded, treat as cleared
  return targetDate.getTime() >= effectiveProbationEnd.getTime();
}

/**
 * Gets or creates the annual leave cycle for a year.
 */
export async function getOrCreateCurrentLeaveCycle(targetYear?: number) {
  const year = targetYear || new Date().getFullYear() + 1; // Default to planning next year

  let cycle = await prisma.leaveCycle.findUnique({
    where: { year },
    include: {
      allocations: true,
    },
  });

  if (!cycle) {
    const windowStart = new Date(Date.UTC(year - 1, 10, 1)); // Nov 1 previous year
    const windowEnd = new Date(Date.UTC(year - 1, 11, 20));   // Dec 20 previous year

    // Default restaurant blackout weeks: Easter (~W14), Christmas/New Year (~W51, W52)
    const blackoutWeeks = [`${year}-W14`, `${year}-W51`, `${year}-W52`];

    cycle = await prisma.leaveCycle.create({
      data: {
        year,
        title: `${year} Annual Leave Planning`,
        windowStart,
        windowEnd,
        status: LeaveCycleStatus.OPEN,
        blackoutWeeks,
      },
      include: {
        allocations: true,
      },
    });

    // Populate initial allocations for all active employees
    await syncLeaveAllocations(cycle.id);
  }

  return cycle;
}

/**
 * Syncs LeaveAllocation records for all active employees for a given cycle.
 */
export async function syncLeaveAllocations(cycleId: string): Promise<number> {
  const cycle = await prisma.leaveCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, year: true },
  });

  if (!cycle) throw new Error("LeaveCycle not found.");

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      hireDate: true,
      probationEndDate: true,
    },
  });

  let createdCount = 0;
  const cycleYearEnd = new Date(Date.UTC(cycle.year, 11, 31));

  for (const emp of employees) {
    const effectiveProbationEnd = emp.probationEndDate || calculateProbationEndDate(emp.hireDate);
    // An employee is eligible if their probation clears on or before the end of the leave cycle year
    const isEligible = !effectiveProbationEnd || effectiveProbationEnd.getTime() <= cycleYearEnd.getTime();

    await prisma.leaveAllocation.upsert({
      where: {
        employeeId_cycleId: {
          employeeId: emp.id,
          cycleId: cycle.id,
        },
      },
      create: {
        employeeId: emp.id,
        cycleId: cycle.id,
        entitledDays: 15,
        scheduledDays: 0,
        isEligible,
        probationEndDate: effectiveProbationEnd,
      },
      update: {
        isEligible,
        probationEndDate: effectiveProbationEnd,
      },
    });
    createdCount++;
  }

  return createdCount;
}

export type WeekSlotStatus =
  | "AVAILABLE"
  | "BOOKED_BY_ME"
  | "COLLISION_LOCKED"
  | "PROBATION_LOCKED"
  | "BLACKOUT_LOCKED"
  | "WINDOW_CLOSED"
  | "ALLOWANCE_REACHED";

export interface WeekSlotInfo {
  isoWeek: string;
  startDateStr: string;
  endDateStr: string;
  weekNumber: number;
  status: WeekSlotStatus;
  statusLabel: string;
  isClickable: boolean;
  bookedByName?: string;
  leaveRequestId?: string;
}

/**
 * Returns the interactive status for all 52 weeks of the cycle year for an employee.
 */
export async function getCycleWeeksForEmployee(
  employeeId: string,
  cycleId?: string
): Promise<{
  cycle: {
    id: string;
    year: number;
    title: string | null;
    status: LeaveCycleStatus;
    windowStartStr: string;
    windowEndStr: string;
    isWindowOpen: boolean;
  };
  allocation: {
    entitledDays: number;
    scheduledDays: number;
    remainingDays: number;
    weeksBooked: number;
    maxWeeks: number;
    isEligible: boolean;
    probationEndDateStr: string | null;
  };
  employee: {
    id: string;
    fullName: string;
    jobTitle: string | null;
    jobCategory: JobRoleCategory;
    branchId: string | null;
    branchName: string | null;
  };
  weeks: WeekSlotInfo[];
}> {
  // Resolve or retrieve cycle
  const cycle = cycleId
    ? await prisma.leaveCycle.findUnique({ where: { id: cycleId } })
    : await getOrCreateCurrentLeaveCycle();

  if (!cycle) throw new Error("Leave cycle not found.");

  const now = new Date();
  const isWindowOpen =
    cycle.status === LeaveCycleStatus.OPEN &&
    now.getTime() >= cycle.windowStart.getTime() &&
    now.getTime() <= cycle.windowEnd.getTime();

  // Employee & primary branch
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      branchAssignments: {
        where: { isPrimary: true },
        include: { branch: true },
      },
    },
  });

  if (!employee) throw new Error("Employee not found.");

  const primaryBranch = employee.branchAssignments[0]?.branch || null;
  const branchId = primaryBranch?.id || null;
  const jobCategory = normalizeJobCategory(employee.jobTitle);

  // Allocation
  let allocation = await prisma.leaveAllocation.findUnique({
    where: {
      employeeId_cycleId: {
        employeeId,
        cycleId: cycle.id,
      },
    },
  });

  if (!allocation) {
    await syncLeaveAllocations(cycle.id);
    allocation = await prisma.leaveAllocation.findUnique({
      where: {
        employeeId_cycleId: {
          employeeId,
          cycleId: cycle.id,
        },
      },
    });
  }

  const entitledDays = allocation?.entitledDays ?? 15;
  const scheduledDays = allocation?.scheduledDays ?? 0;
  const remainingDays = Math.max(0, entitledDays - scheduledDays);
  const maxWeeks = Math.floor(entitledDays / 5); // 15 days = 3 weeks
  const weeksBooked = Math.floor(scheduledDays / 5);

  const effectiveProbationEnd =
    allocation?.probationEndDate ||
    employee.probationEndDate ||
    calculateProbationEndDate(employee.hireDate);

  // Quota for this branch and role category
  let maxConcurrent = 1;
  if (branchId) {
    const quota = await prisma.branchLeaveQuota.findUnique({
      where: {
        branchId_jobCategory: {
          branchId,
          jobCategory,
        },
      },
    });
    if (quota) maxConcurrent = quota.maxConcurrent;
  }

  // Fetch all approved/pending leaves for this cycle & branch
  const branchLeaves = branchId
    ? await prisma.leaveRequest.findMany({
        where: {
          branchId,
          cycleId: cycle.id,
          status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
        },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, jobTitle: true },
          },
        },
      })
    : [];

  const blackoutSet = new Set(cycle.blackoutWeeks || []);
  const allWeeks = getAllWeeksInYear(cycle.year);
  const slots: WeekSlotInfo[] = [];

  for (const isoWeek of allWeeks) {
    const { startDate, endDate, startDateStr, endDateStr, weekNumber } = getDatesFromIsoWeek(isoWeek);

    // 1. Check if booked by self
    const myLeave = branchLeaves.find(
      (l) => l.employeeId === employeeId && l.isoWeek === isoWeek
    );

    if (myLeave) {
      slots.push({
        isoWeek,
        startDateStr,
        endDateStr,
        weekNumber,
        status: "BOOKED_BY_ME",
        statusLabel: "Your Scheduled Leave",
        isClickable: true,
        leaveRequestId: myLeave.id,
      });
      continue;
    }

    // 2. 12-Month Probation check
    if (effectiveProbationEnd && startDate.getTime() < effectiveProbationEnd.getTime()) {
      slots.push({
        isoWeek,
        startDateStr,
        endDateStr,
        weekNumber,
        status: "PROBATION_LOCKED",
        statusLabel: `Probation Active (Eligible after ${effectiveProbationEnd.toISOString().slice(0, 10)})`,
        isClickable: false,
      });
      continue;
    }

    // 3. Blackout week check (Easter, Christmas, New Year)
    if (blackoutSet.has(isoWeek)) {
      slots.push({
        isoWeek,
        startDateStr,
        endDateStr,
        weekNumber,
        status: "BLACKOUT_LOCKED",
        statusLabel: "Peak Company Trading Week (Locked)",
        isClickable: false,
      });
      continue;
    }

    // 4. Role Anti-Collision Check
    // Count how many colleagues in the SAME job category at this branch already booked this week
    const roleColleaguesLeaves = branchLeaves.filter(
      (l) =>
        l.isoWeek === isoWeek &&
        l.employeeId !== employeeId &&
        normalizeJobCategory(l.employee.jobTitle) === jobCategory
    );

    if (roleColleaguesLeaves.length >= maxConcurrent) {
      const colleague = roleColleaguesLeaves[0].employee;
      const roleName = jobCategory.replace(/_/g, " ").toLowerCase();
      slots.push({
        isoWeek,
        startDateStr,
        endDateStr,
        weekNumber,
        status: "COLLISION_LOCKED",
        statusLabel: `Slot Taken by another ${roleName} (${colleague.firstName} ${colleague.lastName.charAt(0)}.)`,
        isClickable: false,
        bookedByName: `${colleague.firstName} ${colleague.lastName}`,
      });
      continue;
    }

    // 5. Window closed check
    if (!isWindowOpen) {
      slots.push({
        isoWeek,
        startDateStr,
        endDateStr,
        weekNumber,
        status: "WINDOW_CLOSED",
        statusLabel: "Annual Selection Window Closed",
        isClickable: false,
      });
      continue;
    }

    // 6. Allowance reached check
    if (remainingDays < 5) {
      slots.push({
        isoWeek,
        startDateStr,
        endDateStr,
        weekNumber,
        status: "ALLOWANCE_REACHED",
        statusLabel: "All 15 days of annual leave already booked",
        isClickable: false,
      });
      continue;
    }

    // Slot is Available!
    slots.push({
      isoWeek,
      startDateStr,
      endDateStr,
      weekNumber,
      status: "AVAILABLE",
      statusLabel: "Available to Book",
      isClickable: true,
    });
  }

  return {
    cycle: {
      id: cycle.id,
      year: cycle.year,
      title: cycle.title,
      status: cycle.status,
      windowStartStr: cycle.windowStart.toISOString().slice(0, 10),
      windowEndStr: cycle.windowEnd.toISOString().slice(0, 10),
      isWindowOpen,
    },
    allocation: {
      entitledDays,
      scheduledDays,
      remainingDays,
      weeksBooked,
      maxWeeks,
      isEligible: allocation?.isEligible ?? true,
      probationEndDateStr: effectiveProbationEnd?.toISOString().slice(0, 10) ?? null,
    },
    employee: {
      id: employee.id,
      fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      jobTitle: employee.jobTitle,
      jobCategory,
      branchId,
      branchName: primaryBranch?.name || null,
    },
    weeks: slots,
  };
}

/**
 * Books a weekly annual leave block for an employee with concurrency locking.
 */
export async function bookWeeklyAnnualLeave(input: {
  employeeId: string;
  cycleId: string;
  isoWeek: string;
  reason?: string;
  bypassWindow?: boolean; // For HR admin manual booking
}) {
  const { employeeId, cycleId, isoWeek, reason, bypassWindow = false } = input;

  const cycle = await prisma.leaveCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new Error("Leave cycle not found.");

  const now = new Date();
  if (!bypassWindow) {
    if (
      cycle.status !== LeaveCycleStatus.OPEN ||
      now.getTime() < cycle.windowStart.getTime() ||
      now.getTime() > cycle.windowEnd.getTime()
    ) {
      throw new Error("The annual leave selection window is currently closed.");
    }
  }

  // Parse ISO week
  const { startDate, endDate, startDateStr, endDateStr } = getDatesFromIsoWeek(isoWeek);

  // Check blackout weeks
  if (cycle.blackoutWeeks.includes(isoWeek)) {
    throw new Error(`Week ${isoWeek} is a blackout trading week and cannot be selected.`);
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      branchAssignments: { where: { isPrimary: true } },
    },
  });

  if (!employee) throw new Error("Employee not found.");

  // Check 12-Month Probation
  const probationEnd = employee.probationEndDate || calculateProbationEndDate(employee.hireDate);
  if (probationEnd && startDate.getTime() < probationEnd.getTime()) {
    throw new Error(
      `You are on probation until ${probationEnd.toISOString().slice(0, 10)}. You can only schedule leave after your 1-year anniversary.`
    );
  }

  const branchId = employee.branchAssignments[0]?.branchId;
  if (!branchId) throw new Error("Employee is not assigned to a primary branch.");

  const jobCategory = normalizeJobCategory(employee.jobTitle);

  // Check Quota / Anti-Collision within a transaction
  return await prisma.$transaction(async (tx) => {
    // 1. Quota
    const quotaRecord = await tx.branchLeaveQuota.findUnique({
      where: {
        branchId_jobCategory: {
          branchId,
          jobCategory,
        },
      },
    });
    const maxConcurrent = quotaRecord?.maxConcurrent ?? 1;

    // 2. Count active leaves in same role & branch & week
    const existingRoleLeaves = await tx.leaveRequest.findMany({
      where: {
        branchId,
        isoWeek,
        status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
      },
      include: {
        employee: { select: { jobTitle: true, firstName: true, lastName: true } },
      },
    });

    const roleLeaves = existingRoleLeaves.filter(
      (l) => normalizeJobCategory(l.employee.jobTitle) === jobCategory
    );

    if (roleLeaves.length >= maxConcurrent) {
      const colleague = roleLeaves[0].employee;
      throw new Error(
        `Week ${isoWeek} is already booked by another ${jobCategory.toLowerCase()} at your branch (${colleague.firstName} ${colleague.lastName}).`
      );
    }

    // 3. Check allocation
    let allocation = await tx.leaveAllocation.findUnique({
      where: {
        employeeId_cycleId: {
          employeeId,
          cycleId,
        },
      },
    });

    if (!allocation) {
      allocation = await tx.leaveAllocation.create({
        data: {
          employeeId,
          cycleId,
          entitledDays: 15,
          scheduledDays: 0,
        },
      });
    }

    if (allocation.scheduledDays + 5 > allocation.entitledDays) {
      throw new Error("You have already scheduled your full 15 days of annual leave.");
    }

    // 4. Create LeaveRequest (Auto-approved during annual planning)
    const leaveRequest = await tx.leaveRequest.create({
      data: {
        employeeId,
        branchId,
        cycleId,
        isoWeek,
        type: LeaveType.ANNUAL,
        startDate,
        endDate,
        reason: reason?.trim() || `Annual Leave: Week ${isoWeek}`,
        status: LeaveStatus.APPROVED,
        isAutoScheduled: false,
      },
    });

    // 5. Update scheduledDays on allocation
    await tx.leaveAllocation.update({
      where: { id: allocation.id },
      data: {
        scheduledDays: { increment: 5 },
      },
    });

    // 6. Generate ScheduleException records (DAY_OFF)
    const dates = getDateRangeKeys(startDateStr, endDateStr);
    for (const dateKey of dates) {
      const dateObj = new Date(`${dateKey}T00:00:00.000Z`);
      await tx.scheduleException.upsert({
        where: {
          employeeId_date: {
            employeeId,
            date: dateObj,
          },
        },
        create: {
          employeeId,
          date: dateObj,
          type: ScheduleExceptionType.DAY_OFF,
          reason: `Annual Leave: ${isoWeek}`,
        },
        update: {
          type: ScheduleExceptionType.DAY_OFF,
          reason: `Annual Leave: ${isoWeek}`,
        },
      });
    }

    return leaveRequest;
  });
}

/**
 * Cancels a booked annual leave slot.
 */
export async function cancelWeeklyAnnualLeave(input: {
  employeeId: string;
  leaveRequestId: string;
}) {
  const { employeeId, leaveRequestId } = input;

  return await prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: { cycle: true },
    });

    if (!leave) throw new Error("Leave record not found.");
    if (leave.employeeId !== employeeId) throw new Error("Unauthorized.");
    if (leave.status === LeaveStatus.CANCELLED) throw new Error("Leave is already cancelled.");

    // Update status
    await tx.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: LeaveStatus.CANCELLED },
    });

    // Decrement allocation
    if (leave.cycleId) {
      await tx.leaveAllocation.updateMany({
        where: {
          employeeId,
          cycleId: leave.cycleId,
        },
        data: {
          scheduledDays: { decrement: 5 },
        },
      });
    }

    // Delete schedule exceptions
    const startDateStr = leave.startDate.toISOString().slice(0, 10);
    const endDateStr = leave.endDate.toISOString().slice(0, 10);
    const dates = getDateRangeKeys(startDateStr, endDateStr);

    for (const dateKey of dates) {
      const dateObj = new Date(`${dateKey}T00:00:00.000Z`);
      await tx.scheduleException.deleteMany({
        where: {
          employeeId,
          date: dateObj,
          type: ScheduleExceptionType.DAY_OFF,
        },
      });
    }

    return { success: true };
  });
}

/**
 * FAIR AUTO-SCHEDULER ENGINE
 * Executed after annual window closes.
 * Evenly and fairly distributes unallocated leave weeks across quarters without collisions.
 */
export async function runFairAutoScheduler(cycleId: string, dryRun = false) {
  const cycle = await prisma.leaveCycle.findUnique({
    where: { id: cycleId },
  });

  if (!cycle) throw new Error("Leave cycle not found.");

  // Retrieve all eligible allocations with unscheduled days
  const incompleteAllocations = await prisma.leaveAllocation.findMany({
    where: {
      cycleId,
      isEligible: true,
      scheduledDays: { lt: 15 },
    },
    include: {
      employee: {
        include: {
          branchAssignments: { where: { isPrimary: true }, include: { branch: true } },
        },
      },
    },
  });

  const blackoutSet = new Set(cycle.blackoutWeeks || []);
  const allWeeks = getAllWeeksInYear(cycle.year).filter((w) => !blackoutSet.has(w));

  // Partition weeks across 4 quarters to enforce even distribution
  const quarterWeeks: Record<number, string[]> = {
    1: [], // Q1: W01 - W13
    2: [], // Q2: W14 - W26
    3: [], // Q3: W27 - W39
    4: [], // Q4: W40 - W52
  };

  for (const w of allWeeks) {
    const num = parseInt(w.split("-W")[1], 10);
    if (num <= 13) quarterWeeks[1].push(w);
    else if (num <= 26) quarterWeeks[2].push(w);
    else if (num <= 39) quarterWeeks[3].push(w);
    else quarterWeeks[4].push(w);
  }

  // Pre-load current booked leaves to track concurrency live
  const existingLeaves = await prisma.leaveRequest.findMany({
    where: {
      cycleId,
      status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
      isoWeek: { not: null },
    },
    include: {
      employee: { select: { jobTitle: true } },
    },
  });

  // Track branch-role-week concurrency in-memory: key = `${branchId}:${jobCategory}:${isoWeek}`
  const branchRoleWeekOccupancy = new Map<string, number>();
  for (const l of existingLeaves) {
    if (l.branchId && l.isoWeek) {
      const cat = normalizeJobCategory(l.employee.jobTitle);
      const key = `${l.branchId}:${cat}:${l.isoWeek}`;
      branchRoleWeekOccupancy.set(key, (branchRoleWeekOccupancy.get(key) || 0) + 1);
    }
  }

  // Pre-load branch quotas
  const quotas = await prisma.branchLeaveQuota.findMany();
  const quotaMap = new Map<string, number>();
  for (const q of quotas) {
    quotaMap.set(`${q.branchId}:${q.jobCategory}`, q.maxConcurrent);
  }

  const assignedSummary: {
    employeeId: string;
    employeeName: string;
    branchName: string;
    jobCategory: string;
    weeksAssigned: string[];
  }[] = [];

  for (const alloc of incompleteAllocations) {
    const emp = alloc.employee;
    const branch = emp.branchAssignments[0]?.branch;
    if (!branch) continue;

    const jobCategory = normalizeJobCategory(emp.jobTitle);
    const maxConcurrent = quotaMap.get(`${branch.id}:${jobCategory}`) ?? 1;

    const remainingDays = 15 - alloc.scheduledDays;
    const neededWeeks = Math.ceil(remainingDays / 5);

    const probationEnd = alloc.probationEndDate || calculateProbationEndDate(emp.hireDate);
    const assignedWeeksForEmp: string[] = [];

    // Try round-robin assignment across Q1 -> Q2 -> Q3 -> Q4
    let currentQuarter = 1;
    let attempts = 0;

    while (assignedWeeksForEmp.length < neededWeeks && attempts < 50) {
      attempts++;
      const quarterList = quarterWeeks[currentQuarter];

      for (const candidateWeek of quarterList) {
        if (assignedWeeksForEmp.includes(candidateWeek)) continue;

        const { startDate } = getDatesFromIsoWeek(candidateWeek);

        // Probation check
        if (probationEnd && startDate.getTime() < probationEnd.getTime()) {
          continue;
        }

        // Concurrency check
        const occKey = `${branch.id}:${jobCategory}:${candidateWeek}`;
        const currentOcc = branchRoleWeekOccupancy.get(occKey) || 0;

        if (currentOcc < maxConcurrent) {
          // Found an available slot!
          branchRoleWeekOccupancy.set(occKey, currentOcc + 1);
          assignedWeeksForEmp.push(candidateWeek);
          break;
        }
      }

      // Rotate to next quarter for fair seasonal spacing
      currentQuarter = currentQuarter === 4 ? 1 : currentQuarter + 1;
    }

    if (!dryRun && assignedWeeksForEmp.length > 0) {
      for (const weekStr of assignedWeeksForEmp) {
        const { startDate, endDate, startDateStr, endDateStr } = getDatesFromIsoWeek(weekStr);

        await prisma.leaveRequest.create({
          data: {
            employeeId: emp.id,
            branchId: branch.id,
            cycleId,
            isoWeek: weekStr,
            type: LeaveType.ANNUAL,
            startDate,
            endDate,
            reason: `Auto-Scheduled Annual Leave: Week ${weekStr}`,
            status: LeaveStatus.APPROVED,
            isAutoScheduled: true,
          },
        });

        // Upsert DAY_OFF schedule exceptions
        const dates = getDateRangeKeys(startDateStr, endDateStr);
        for (const dateKey of dates) {
          const dateObj = new Date(`${dateKey}T00:00:00.000Z`);
          await prisma.scheduleException.upsert({
            where: {
              employeeId_date: {
                employeeId: emp.id,
                date: dateObj,
              },
            },
            create: {
              employeeId: emp.id,
              date: dateObj,
              type: ScheduleExceptionType.DAY_OFF,
              reason: `Auto-Scheduled Annual Leave: ${weekStr}`,
            },
            update: {
              type: ScheduleExceptionType.DAY_OFF,
              reason: `Auto-Scheduled Annual Leave: ${weekStr}`,
            },
          });
        }
      }

      await prisma.leaveAllocation.update({
        where: { id: alloc.id },
        data: {
          scheduledDays: { increment: assignedWeeksForEmp.length * 5 },
          autoAssigned: true,
        },
      });

      // Send push notification to employee
      await sendEmployeePushNotification(emp.id, {
        title: "Annual Leave Finalized",
        body: `Your annual leave for ${cycle.year} has been scheduled (${assignedWeeksForEmp.join(", ")}). View in the app.`,
        data: { type: "LEAVE_AUTO_SCHEDULED", cycleId },
      });

      await recordInboxNotification({
        employeeId: emp.id,
        kind: "LEAVE_DECISION",
        title: "Annual Leave Finalized",
        body: `Your annual leave for ${cycle.year} has been scheduled: ${assignedWeeksForEmp.join(", ")}. View your roster in the Leave tab.`,
        data: { type: "LEAVE_AUTO_SCHEDULED", cycleId },
      });
    }

    assignedSummary.push({
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      branchName: branch.name,
      jobCategory,
      weeksAssigned: assignedWeeksForEmp,
    });
  }

  if (!dryRun) {
    await prisma.leaveCycle.update({
      where: { id: cycleId },
      data: {
        status: LeaveCycleStatus.FINALIZED,
        autoScheduledAt: new Date(),
      },
    });
  }

  log.info("Fair auto-scheduler completed", {
    cycleId,
    dryRun,
    employeesProcessed: assignedSummary.length,
  });

  return {
    cycleId,
    dryRun,
    processedCount: assignedSummary.length,
    summary: assignedSummary,
  };
}
