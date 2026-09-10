import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { LeaveStatus, LeaveType, ScheduleExceptionType } from "@prisma/client";
import { sendEmployeePushNotification } from "@/lib/platform/push";
import { scoped } from "@/lib/platform/logger";

const log = scoped("attendance.leave");

export interface SubmitLeaveRequestInput {
  employeeId: string;
  type: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  branchId?: string;
}

export interface ReviewLeaveRequestInput {
  leaveRequestId: string;
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  managerNotes?: string;
}

/**
 * Generates an array of "YYYY-MM-DD" date strings inclusive between start and end.
 */
export function getDateRangeKeys(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const curr = new Date(`${startDateStr}T00:00:00.000Z`);
  const end = new Date(`${endDateStr}T00:00:00.000Z`);

  if (curr.getTime() > end.getTime()) {
    throw new Error("startDate cannot be after endDate");
  }

  // Guard against runaway ranges (max 90 days per request)
  let count = 0;
  while (curr.getTime() <= end.getTime() && count < 90) {
    dates.push(curr.toISOString().slice(0, 10));
    curr.setUTCDate(curr.getUTCDate() + 1);
    count++;
  }

  return dates;
}

/**
 * Submits a new leave request on behalf of an employee.
 */
export async function submitLeaveRequest(input: SubmitLeaveRequestInput) {
  const { employeeId, type, startDate, endDate, reason, branchId } = input;

  if (!reason || reason.trim().length === 0) {
    throw new Error("A reason for leave is required.");
  }

  if (startDate > endDate) {
    throw new Error("Start date cannot be after end date.");
  }

  // Resolve branchId if not explicitly provided
  let effectiveBranchId = branchId;
  if (!effectiveBranchId) {
    const assignment = await prisma.employeeBranchAssignment.findFirst({
      where: { employeeId },
      orderBy: { isPrimary: "desc" },
      select: { branchId: true },
    });
    effectiveBranchId = assignment?.branchId;
  }

  const startUtc = new Date(`${startDate}T00:00:00.000Z`);
  const endUtc = new Date(`${endDate}T00:00:00.000Z`);

  const created = await prisma.leaveRequest.create({
    data: {
      employeeId,
      branchId: effectiveBranchId,
      type,
      startDate: startUtc,
      endDate: endUtc,
      reason: reason.trim(),
      status: LeaveStatus.PENDING,
    },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, employeeCode: true },
      },
      branch: {
        select: { id: true, name: true },
      },
    },
  });

  log.info("Leave request submitted", {
    id: created.id,
    employeeId,
    type,
    startDate,
    endDate,
  });

  return created;
}

/**
 * Fetches leave requests for an employee.
 */
export async function getEmployeeLeaveRequests(employeeId: string, limit = 50, offset = 0) {
  const [requests, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        reviewer: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.leaveRequest.count({ where: { employeeId } }),
  ]);

  return { requests, total };
}

/**
 * Reviews (approves or rejects) a leave request.
 * If approved, automatically generates DAY_OFF ScheduleExceptions for every date in range
 * and sends an Expo push notification to the employee.
 */
export async function reviewLeaveRequest(input: ReviewLeaveRequestInput) {
  const { leaveRequestId, reviewerUserId, decision, managerNotes } = input;

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true },
      },
      branch: {
        select: { id: true, name: true },
      },
    },
  });

  if (!leave) {
    throw new Error("Leave request not found.");
  }

  if (leave.status !== LeaveStatus.PENDING) {
    throw new Error(`Leave request has already been ${leave.status.toLowerCase()}.`);
  }

  const startDateKey = leave.startDate.toISOString().slice(0, 10);
  const endDateKey = leave.endDate.toISOString().slice(0, 10);
  const now = new Date();

  if (decision === "APPROVED") {
    const dates = getDateRangeKeys(startDateKey, endDateKey);

    // Run in transaction: update leave request & upsert DAY_OFF schedule exceptions
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: leaveRequestId },
        data: {
          status: LeaveStatus.APPROVED,
          reviewedBy: reviewerUserId,
          reviewedAt: now,
          managerNotes: managerNotes?.trim() || null,
        },
      });

      for (const dateKey of dates) {
        const dateObj = new Date(`${dateKey}T00:00:00.000Z`);
        await tx.scheduleException.upsert({
          where: {
            employeeId_date: {
              employeeId: leave.employeeId,
              date: dateObj,
            },
          },
          create: {
            employeeId: leave.employeeId,
            date: dateObj,
            type: ScheduleExceptionType.DAY_OFF,
            shiftId: null,
            reason: `Approved Leave: ${leave.type} - ${leave.reason}`,
            createdBy: reviewerUserId,
          },
          update: {
            type: ScheduleExceptionType.DAY_OFF,
            shiftId: null,
            reason: `Approved Leave: ${leave.type} - ${leave.reason}`,
            createdBy: reviewerUserId,
          },
        });
      }
    });

    log.info("Leave request approved and schedule exceptions created", {
      leaveRequestId,
      employeeId: leave.employeeId,
      daysCount: dates.length,
    });

    // Notify employee via push
    await sendEmployeePushNotification(leave.employeeId, {
      title: "Leave Request Approved",
      body: `Your leave request for ${startDateKey}${startDateKey !== endDateKey ? ` to ${endDateKey}` : ""} has been approved.`,
      data: {
        type: "LEAVE_STATUS",
        leaveRequestId,
        status: "APPROVED",
      },
    });

    return { ok: true, status: LeaveStatus.APPROVED };
  } else {
    // REJECTED
    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: LeaveStatus.REJECTED,
        reviewedBy: reviewerUserId,
        reviewedAt: now,
        managerNotes: managerNotes?.trim() || null,
      },
    });

    log.info("Leave request rejected", {
      leaveRequestId,
      employeeId: leave.employeeId,
    });

    // Notify employee via push
    const notesSnippet = managerNotes ? `: ${managerNotes.trim()}` : ".";
    await sendEmployeePushNotification(leave.employeeId, {
      title: "Leave Request Declined",
      body: `Your leave request for ${startDateKey}${startDateKey !== endDateKey ? ` to ${endDateKey}` : ""} was not approved${notesSnippet}`,
      data: {
        type: "LEAVE_STATUS",
        leaveRequestId,
        status: "REJECTED",
      },
    });

    return { ok: true, status: LeaveStatus.REJECTED };
  }
}
