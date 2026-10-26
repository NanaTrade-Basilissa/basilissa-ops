import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { LeaveStatus, LeaveType } from "@prisma/client";
import { sendEmployeePushNotification } from "@/lib/platform/push";
import { scoped } from "@/lib/platform/logger";

const log = scoped("attendance.sick-leave");

export interface SubmitSickLeaveInput {
  employeeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  attachmentUrl?: string;
  attachmentKey?: string;
}

/**
 * Submits a sick leave request with medical doctor report attachment.
 */
export async function submitSickLeaveRequest(input: SubmitSickLeaveInput) {
  const { employeeId, startDate, endDate, reason, attachmentUrl, attachmentKey } = input;

  if (!reason || reason.trim().length === 0) {
    throw new Error("A reason or doctor description is required.");
  }

  if (startDate > endDate) {
    throw new Error("Start date cannot be after end date.");
  }

  const startUtc = new Date(`${startDate}T00:00:00.000Z`);
  const endUtc = new Date(`${endDate}T00:00:00.000Z`);

  const dayCount = Math.max(1, Math.round((endUtc.getTime() - startUtc.getTime()) / 86400000) + 1);

  // If sick leave is more than 1 day, a medical report is required by company policy
  if (dayCount > 1 && !attachmentUrl) {
    throw new Error("A Doctor's Report (medical certificate) is required for sick leave exceeding 1 day.");
  }

  // Primary branch
  const assignment = await prisma.employeeBranchAssignment.findFirst({
    where: { employeeId, isPrimary: true },
    select: { branchId: true },
  });

  const created = await prisma.leaveRequest.create({
    data: {
      employeeId,
      branchId: assignment?.branchId || null,
      type: LeaveType.SICK,
      startDate: startUtc,
      endDate: endUtc,
      reason: reason.trim(),
      status: LeaveStatus.PENDING,
      attachmentUrl: attachmentUrl || null,
      attachmentKey: attachmentKey || null,
    },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true },
      },
      branch: {
        select: { id: true, name: true },
      },
    },
  });

  log.info("Sick leave submitted with medical note", {
    id: created.id,
    employeeId,
    dayCount,
    hasAttachment: Boolean(attachmentUrl),
  });

  return created;
}
