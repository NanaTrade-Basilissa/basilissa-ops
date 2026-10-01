"use server";

import { revalidatePath } from "next/cache";
import {
  CorrectionOperation,
  Prisma,
  ProviderType,
  ScheduleExceptionType,
  type CorrectionReason,
  type ManualEntryReason,
} from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { auditActorFrom, can, requirePermission } from "@/lib/modules/identity/server";
import { recordAudit } from "@/lib/platform/audit";
import { settleDay } from "./settle";
import { applyCorrection } from "./correction-service";
import { ingestEvent } from "./ingest";
import { checkManualEntry } from "./manual";
import { resolvePolicy } from "./policy-repository";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";
import { supersedePolicy } from "./policy-repository";
import {
  assignPatternSchema,
  attendancePolicySchema,
  coverShiftSchema,
  holidaySchema,
  patternSchema,
  type AssignPatternFormInput,
  type CoverShiftInput,
  type PatternFormInput,
} from "./validation";
import { canAuthorizeOvertime } from "./overtime-auth";
import { autoCloseStaleDays, type AutoCloseSummary } from "./auto-close";
import { shiftDateKey } from "@/lib/platform/date";
import { reviewLeaveRequest } from "./leave";
import { DuplicateHolidayError, deleteHoliday, importCalendarHolidays, resettleDates, saveHoliday } from "./holidays";
import {
  PatternInUseError,
  assignPattern,
  deletePattern,
  generatePatternWeek,
  savePattern,
  setAutoRota,
  setPatternActive,
} from "./patterns";

// `FormState` already includes undefined, so intersecting with it would make
// the whole type non-optional. Extend the non-null half and re-add undefined.
export type PolicyFormState =
  // `versionId` is the id of the version just created. It doubles as a token
  // the form can watch to clear the reason box: `saved: true` stays true across
  // consecutive saves, so it cannot distinguish one save from the next.
  (NonNullable<FormState> & { saved?: boolean; versionId?: string }) | undefined;

/**
 * Puts a new attendance policy version into effect.
 *
 * Authorisation is checked here, not only on the page that renders the form.
 * Server Actions are reachable by direct POST, so a form-level check is a UI
 * convenience and this is the actual boundary.
 *
 * policy:write is deliberately narrow — HR and Super Admin. Grace periods and
 * overtime thresholds are employment terms, not system configuration, so an
 * Administrator can read them but not move them.
 */
export async function updateAttendancePolicy(
  _prevState: PolicyFormState,
  formData: FormData,
): Promise<PolicyFormState> {
  const actor = await requirePermission("policy:write");

  const parsed = attendancePolicySchema.safeParse({
    graceInMinutes: formData.get("graceInMinutes"),
    graceOutMinutes: formData.get("graceOutMinutes"),
    overtimeThresholdMinutes: formData.get("overtimeThresholdMinutes"),
    breakPolicy: formData.get("breakPolicy"),
    autoDeductMinutes: formData.get("autoDeductMinutes"),
    autoDeductAfterMinutes: formData.get("autoDeductAfterMinutes"),
    roundingMinutes: formData.get("roundingMinutes"),
    autoCloseGraceMinutes: formData.get("autoCloseGraceMinutes"),
    dedupWindowMinutes: formData.get("dedupWindowMinutes"),
    maxManualEntryDays: formData.get("maxManualEntryDays"),
    branchManagerCanAuthorizeOvertime: formData.get("branchManagerCanAuthorizeOvertime") === "on",
    // Confirming the values is the act of removing the provisional flag, so
    // the checkbox reads as "these are agreed" rather than "still a guess".
    isProvisional: formData.get("confirmed") !== "on",
    changeReason: formData.get("changeReason"),
  });

  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const rawBranchId = formData.get("branchId");
  const branchId = typeof rawBranchId === "string" && rawBranchId.trim() ? rawBranchId.trim() : null;

  // Supersede, never update: the current version is closed and a new one
  // opened, so attendance already settled keeps resolving against the rules
  // that applied when it was worked.
  const versionId = await supersedePolicy(
    branchId,
    parsed.data,
    auditActorFrom(actor),
    parsed.data.changeReason,
  );

  revalidatePath("/admin/attendance/policy");
  return { saved: true, versionId };
}

/**
 * The actor's own employee record, if they have one.
 *
 * Needed to refuse self-entry: an administrator with no employee record cannot
 * be recording their own attendance, but a branch manager who is also an
 * employee very much can.
 */
async function actorEmployeeId(userId: string): Promise<string | null> {
  const employee = await prisma.employee.findFirst({
    where: { userId },
    select: { id: true },
  });
  return employee?.id ?? null;
}

export type AttendanceActionState = (NonNullable<FormState> & { saved?: string }) | undefined;

/**
 * Records attendance by hand.
 *
 * The least-verified path in the system, so it carries controls the others do
 * not need: no self-entry, a bounded retro window taken from policy, a reason
 * code with mandatory text for OTHER, and a second approver for older entries.
 * The direction is still derived from the sequence rather than chosen — a
 * manager saying "clock-in" does not make it one if the person was already
 * clocked in.
 */
export async function recordManualAttendance(
  employeeId: string,
  branchId: string,
  _prevState: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const actor = await requirePermission("attendance:manual_entry", { branchId });

  const occurredAtRaw = String(formData.get("occurredAt") ?? "");
  const reasonCode = String(formData.get("reasonCode") ?? "") as ManualEntryReason;
  const reasonText = String(formData.get("reasonText") ?? "");

  const occurredAt = new Date(occurredAtRaw);
  if (Number.isNaN(occurredAt.getTime())) {
    return { error: "Enter a valid date and time.", fieldErrors: { occurredAt: "Invalid" } };
  }

  const policy = await resolvePolicy(branchId, occurredAt);
  const check = checkManualEntry({
    actorUserId: actor.userId,
    actorEmployeeId: await actorEmployeeId(actor.userId),
    targetEmployeeId: employeeId,
    occurredAt,
    now: new Date(),
    maxRetroDays: policy.maxManualEntryDays,
    reasonCode,
    reasonText,
  });

  if (!check.allowed) return { error: check.message };

  const result = await ingestEvent(
    {
      providerType: ProviderType.MANAGER_MANUAL,
      // Stable per employee, minute and actor, so a double-submitted form
      // cannot become two punches.
      idempotencyKey: `manual:${employeeId}:${occurredAt.toISOString().slice(0, 16)}:${actor.userId}`,
      employeeId,
      branchId,
      occurredAt,
      actorUserId: actor.userId,
      evidence: { manualReasonCode: reasonCode, manualReasonText: reasonText || undefined },
    },
    auditActorFrom(actor),
  );

  if (!result.ok) return { error: result.message };

  revalidatePath(`/admin/attendance/${employeeId}/${result.workDateKey}`);
  revalidatePath("/admin/attendance");

  return {
    saved: check.requiresSecondApproval
      ? `Recorded as a ${result.direction.toLowerCase().replace("_", " ")}. This entry reaches back far enough to need a second approver.`
      : `Recorded as a ${result.direction.toLowerCase().replace("_", " ")}.`,
  };
}

/**
 * Direct manual attendance recording from the main dashboard.
 *
 * Takes employeeId and branchId from the submitted FormData and delegates
 * to recordManualAttendance with branch authorization checks.
 */
export async function recordManualAttendanceDirect(
  prevState: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  const branchId = String(formData.get("branchId") ?? "");

  if (!employeeId) {
    return { error: "Please select an employee.", fieldErrors: { employeeId: "Required" } };
  }
  if (!branchId) {
    return { error: "Please select a branch.", fieldErrors: { branchId: "Required" } };
  }

  return recordManualAttendance(employeeId, branchId, prevState, formData);
}

/** Adjusts, voids or reassigns a recorded punch. Never edits it. */
export async function correctAttendance(
  employeeId: string,
  branchId: string,
  workDateKey: string,
  _prevState: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const actor = await requirePermission("attendance:write", { branchId });

  const operation = String(formData.get("operation") ?? "") as CorrectionOperation;
  const targetEventId = String(formData.get("targetEventId") ?? "") || undefined;
  const correctedRaw = String(formData.get("correctedOccurredAt") ?? "");
  const correctedOccurredAt = correctedRaw ? new Date(correctedRaw) : undefined;

  if (operation === CorrectionOperation.ADJUST_TIME && !correctedOccurredAt) {
    return { error: "Enter the corrected time." };
  }

  const result = await applyCorrection(
    {
      operation,
      employeeId,
      branchId,
      workDateKey,
      targetEventId,
      correctedOccurredAt,
      direction: (formData.get("direction") as Prisma.AttendanceEventCreateInput["direction"]) || undefined,
      reasonCode: String(formData.get("reasonCode") ?? "") as CorrectionReason,
      reasonText: String(formData.get("reasonText") ?? ""),
      actorUserId: actor.userId,
      actorEmployeeId: await actorEmployeeId(actor.userId),
    },
    auditActorFrom(actor),
  );

  if (!result.ok) return { error: result.message };

  revalidatePath(`/admin/attendance/${employeeId}/${workDateKey}`);
  revalidatePath("/admin/attendance");

  return {
    saved: result.requiresApproval
      ? `Applied. Needs a second approver because it ${result.approvalReasons.join(" and ")}.`
      : "Applied.",
  };
}

export type ScheduleOverrideState = (NonNullable<FormState> & { saved?: string }) | undefined;

/**
 * Creates or updates a single-day schedule override (DAY_OFF, SHIFT_CHANGE, EXTRA_SHIFT).
 */
export async function saveScheduleOverride(
  _prevState: ScheduleOverrideState,
  formData: FormData,
): Promise<ScheduleOverrideState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  const branchId = String(formData.get("branchId") ?? "");
  const dateKey = String(formData.get("dateKey") ?? "");
  const type = String(formData.get("type") ?? "") as ScheduleExceptionType;
  const shiftId = String(formData.get("shiftId") ?? "") || null;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!employeeId || !branchId || !dateKey || !type) {
    return { error: "Missing required fields." };
  }

  if ((type === ScheduleExceptionType.SHIFT_CHANGE || type === ScheduleExceptionType.EXTRA_SHIFT) && !shiftId) {
    return { error: "Please select a shift.", fieldErrors: { shiftId: "Required" } };
  }

  if (!reason) {
    return { error: "Please provide a reason for this schedule override.", fieldErrors: { reason: "Required" } };
  }

  const actor = await requirePermission("schedule:write", { branchId });

  const date = new Date(`${dateKey}T00:00:00.000Z`);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.scheduleException.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });

    const override = await tx.scheduleException.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: {
        employeeId,
        date,
        type,
        shiftId: type === ScheduleExceptionType.DAY_OFF ? null : shiftId,
        reason,
        createdBy: actor.userId,
      },
      update: {
        type,
        shiftId: type === ScheduleExceptionType.DAY_OFF ? null : shiftId,
        // A day off is not worked anywhere, so it cannot be a cover shift.
        ...(type === ScheduleExceptionType.DAY_OFF ? { branchId: null } : {}),
        reason,
      },
    });

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: existing ? "schedule.override_updated" : "schedule.override_created",
        entityType: "ScheduleException",
        entityId: override.id,
        before: existing ? { type: existing.type, shiftId: existing.shiftId, reason: existing.reason } : undefined,
        after: { type, shiftId, reason, employeeId, date: dateKey },
      },
      tx,
    );

    // Resettle attendance day for this date if punches exist
    try {
      await settleDay(employeeId, branchId, dateKey, tx);
    } catch {
      // If day does not settle (e.g. outside policy window), continue
    }
  });

  revalidatePath("/admin/shifts");
  revalidatePath("/admin/attendance");
  revalidatePath(`/admin/attendance/${employeeId}/${dateKey}`);

  return { saved: "Schedule override saved." };
}

/**
 * Deletes a single-day schedule override, reverting employee to recurring schedule.
 */
export async function clearScheduleOverride(
  _prevState: ScheduleOverrideState,
  formData: FormData,
): Promise<ScheduleOverrideState> {
  const exceptionId = String(formData.get("exceptionId") ?? "");
  const branchId = String(formData.get("branchId") ?? "");

  if (!exceptionId || !branchId) {
    return { error: "Missing required fields." };
  }

  const actor = await requirePermission("schedule:write", { branchId });

  await prisma.$transaction(async (tx) => {
    const existing = await tx.scheduleException.findUnique({
      where: { id: exceptionId },
    });
    if (!existing) return;

    await tx.scheduleException.delete({
      where: { id: exceptionId },
    });

    const dateKey = existing.date.toISOString().slice(0, 10);

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "schedule.override_cleared",
        entityType: "ScheduleException",
        entityId: exceptionId,
        before: { type: existing.type, shiftId: existing.shiftId, reason: existing.reason },
      },
      tx,
    );

    try {
      await settleDay(existing.employeeId, branchId, dateKey, tx);
    } catch {
      // Continue
    }
  });

  revalidatePath("/admin/shifts");
  revalidatePath("/admin/attendance");

  return { saved: "Override cleared. Employee reverted to standard rota." };
}

export type ResolveDayInput = {
  notes: string;
  payableOvertimeMinutes?: number;
};

/**
 * Resolves an attendance day that requires review, transitions status to SETTLED,
 * and authorizes payable overtime if the actor has sufficient authority.
 */
export async function resolveAttendanceDay(
  employeeId: string,
  branchId: string,
  dateKey: string,
  input: ResolveDayInput,
): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission("attendance:write", { branchId });
  const policy = await resolvePolicy(branchId, new Date(`${dateKey}T00:00:00.000Z`));

  if (input.payableOvertimeMinutes !== undefined && input.payableOvertimeMinutes > 0) {
    const authorized = canAuthorizeOvertime(actor, branchId, policy);
    if (!authorized) {
      return {
        success: false,
        error: "Only Area Managers and Administrators may authorize payable overtime unless enabled in policy.",
      };
    }
  }

  const workDate = new Date(`${dateKey}T00:00:00.000Z`);
  const existingDay = await prisma.attendanceDay.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
  });

  if (!existingDay) {
    return { success: false, error: "Attendance day record not found." };
  }

  const payableOvertime =
    input.payableOvertimeMinutes !== undefined
      ? Math.max(0, input.payableOvertimeMinutes)
      : existingDay.payableOvertimeMinutes;

  await prisma.$transaction(async (tx) => {
    await tx.attendanceDay.update({
      where: { employeeId_workDate: { employeeId, workDate } },
      data: {
        status: "SETTLED",
        settledAt: new Date(),
        payableOvertimeMinutes: payableOvertime,
      },
    });

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "attendance_day.resolved",
        entityType: "AttendanceDay",
        entityId: existingDay.id,
        before: {
          status: existingDay.status,
          payableOvertimeMinutes: existingDay.payableOvertimeMinutes,
        },
        after: {
          status: "SETTLED",
          payableOvertimeMinutes: payableOvertime,
        },
        metadata: {
          employeeId,
          branchId,
          workDate: dateKey,
          notes: input.notes,
        },
      },
      tx,
    );
  });

  revalidatePath(`/admin/attendance/${employeeId}/${dateKey}`);
  revalidatePath("/admin/attendance");

  return { success: true };
}

/**
 * Triggers an on-demand sweep to close unclocked-out shifts that have exceeded their schedule.
 */
export async function runDailyAttendanceSweepAction(): Promise<AutoCloseSummary> {
  await requirePermission("attendance:write");

  const result = await autoCloseStaleDays();
  revalidatePath("/admin/attendance");
  return result;
}

export type CopyWeeklyScheduleResult = {
  ok: boolean;
  copiedCount?: number;
  skippedCount?: number;
  error?: string;
  message?: string;
};

/**
 * Copies schedule exceptions / customized shifts from a source week into a target week for all active employees of a branch.
 */
export async function copyWeeklyScheduleAction(
  sourceWeekStart: string,
  targetWeekStart: string,
  branchId: string,
  overwriteExisting: boolean = false,
): Promise<CopyWeeklyScheduleResult> {

  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceWeekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(targetWeekStart)) {
    return { ok: false, error: "Invalid week date format. Expected YYYY-MM-DD." };
  }

  if (sourceWeekStart === targetWeekStart) {
    return { ok: false, error: "Source and target weeks cannot be the same week." };
  }

  const actor = await requirePermission("schedule:write", { branchId });

  const sourceStart = new Date(`${sourceWeekStart}T00:00:00.000Z`);
  const targetStart = new Date(`${targetWeekStart}T00:00:00.000Z`);
  const dayDelta = Math.round((targetStart.getTime() - sourceStart.getTime()) / (24 * 60 * 60 * 1000));

  const sourceEnd = new Date(`${shiftDateKey(sourceWeekStart, 6)}T23:59:59.999Z`);

  const branchAssignments = await prisma.employeeBranchAssignment.findMany({
    where: {
      branchId,
      validTo: null,
      employee: { status: "ACTIVE" },
    },
    select: { employeeId: true },
  });

  const employeeIds = branchAssignments.map((b) => b.employeeId);
  if (employeeIds.length === 0) {
    return { ok: false, error: "No active employees assigned to this branch." };
  }

  const sourceExceptions = await prisma.scheduleException.findMany({
    where: {
      employeeId: { in: employeeIds },
      date: { gte: sourceStart, lte: sourceEnd },
    },
  });

  if (sourceExceptions.length === 0) {
    return {
      ok: true,
      copiedCount: 0,
      skippedCount: 0,
      message: "No custom shift overrides found in the source week to copy.",
    };
  }

  let copiedCount = 0;
  let skippedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const ex of sourceExceptions) {
      const sourceDateKey = ex.date.toISOString().slice(0, 10);
      const targetDateKey = shiftDateKey(sourceDateKey, dayDelta);
      const targetDate = new Date(`${targetDateKey}T00:00:00.000Z`);

      const existing = await tx.scheduleException.findUnique({
        where: {
          employeeId_date: {
            employeeId: ex.employeeId,
            date: targetDate,
          },
        },
      });

      if (existing && !overwriteExisting) {
        skippedCount++;
        continue;
      }

      await tx.scheduleException.upsert({
        where: {
          employeeId_date: {
            employeeId: ex.employeeId,
            date: targetDate,
          },
        },
        create: {
          employeeId: ex.employeeId,
          date: targetDate,
          type: ex.type,
          shiftId: ex.shiftId,
          reason: `Copied from week ${sourceWeekStart}: ${ex.reason || "Scheduled rota"}`,
          createdBy: actor.userId,
        },
        update: {
          type: ex.type,
          shiftId: ex.shiftId,
          reason: `Copied from week ${sourceWeekStart}: ${ex.reason || "Scheduled rota"}`,
        },
      });

      copiedCount++;
    }

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "schedule.week_copied",
        entityType: "BranchSchedule",
        entityId: branchId,
        metadata: {
          sourceWeekStart,
          targetWeekStart,
          copiedCount,
          skippedCount,
          overwriteExisting,
        },
      },
      tx,
    );
  });

  revalidatePath("/admin/shifts");
  return {
    ok: true,
    copiedCount,
    skippedCount,
    message: `Copied ${copiedCount} shift override(s) from week of ${sourceWeekStart}${skippedCount > 0 ? ` (${skippedCount} existing preserved)` : ""}.`,
  };
}

export type BulkAssignShiftInput = {
  employeeIds: string[];
  shiftId: string;
  daysOfWeek: number[];
  validFrom: string;
  validTo?: string | null;
  branchId: string;
};

/**
 * Assigns a recurring shift pattern to multiple employees in bulk.
 */
export async function bulkAssignShiftAction(
  input: BulkAssignShiftInput,
): Promise<{ ok: boolean; count?: number; error?: string; message?: string }> {
  const { employeeIds, shiftId, daysOfWeek, validFrom, validTo, branchId } = input;

  if (!employeeIds || employeeIds.length === 0) {
    return { ok: false, error: "Please select at least one employee." };
  }

  if (!shiftId) {
    return { ok: false, error: "Please select a shift template." };
  }

  if (!daysOfWeek || daysOfWeek.length === 0) {
    return { ok: false, error: "Please select at least one day of the week." };
  }

  if (!validFrom || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
    return { ok: false, error: "Invalid start date. Expected YYYY-MM-DD." };
  }

  const actor = await requirePermission("schedule:write", { branchId });

  const fromDate = new Date(`${validFrom}T00:00:00.000Z`);
  const toDate = validTo && /^\d{4}-\d{2}-\d{2}$/.test(validTo)
    ? new Date(`${validTo}T23:59:59.999Z`)
    : null;

  let createdCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const empId of employeeIds) {
      await tx.employeeShiftAssignment.create({
        data: {
          employeeId: empId,
          shiftId,
          daysOfWeek,
          validFrom: fromDate,
          validTo: toDate,
        },
      });
      createdCount++;
    }

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "schedule.bulk_assigned",
        entityType: "EmployeeShiftAssignment",
        entityId: branchId,
        metadata: {
          employeeCount: createdCount,
          shiftId,
          daysOfWeek,
          validFrom,
          validTo,
        },
      },
      tx,
    );
  });

  revalidatePath("/admin/shifts");
  return {
    ok: true,
    count: createdCount,
    message: `Successfully assigned shift to ${createdCount} staff member(s).`,
  };
}

/**
 * Approves or rejects an employee's leave request.
 */
export async function reviewLeaveRequestAction(
  leaveRequestId: string,
  decision: "APPROVED" | "REJECTED",
  managerNotes?: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!leaveRequestId || !decision) {
    return { ok: false, error: "Invalid review parameters." };
  }

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    select: { branchId: true, employeeId: true },
  });

  if (!leave) {
    return { ok: false, error: "Leave request not found." };
  }

  const actor = await requirePermission("attendance:write", {
    branchId: leave.branchId ?? undefined,
  });

  try {
    const res = await reviewLeaveRequest({
      leaveRequestId,
      reviewerUserId: actor.userId,
      decision,
      managerNotes,
    });

    revalidatePath("/admin/leave");
    revalidatePath("/admin/shifts");
    // The pending count badge lives in the admin layout.
    revalidatePath("/admin", "layout");

    return {
      ok: true,
      message:
        res.status === "APPROVED"
          ? "Leave request approved and roster day-off overrides applied."
          : "Leave request declined.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to review leave request.",
    };
  }
}



// ---------------------------------------------------------------------------
// Public holidays
//
// Holidays change who is scheduled, so they sit with attendance policy and
// use its permission: the people who set grace periods also own this list.
// ---------------------------------------------------------------------------

function revalidateHolidayViews() {
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/shifts");
  revalidatePath("/admin/attendance");
}

export async function saveHolidayAction(
  id: string | null,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("policy:write");

  const parsed = holidaySchema.safeParse({
    dateKey: formData.get("dateKey"),
    name: formData.get("name"),
    confirmed: formData.get("confirmed") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const { affectedDates } = await saveHoliday(id, parsed.data, auditActorFrom(actor));
    await resettleDates(affectedDates);
  } catch (error) {
    if (error instanceof DuplicateHolidayError) {
      return { error: error.message, fieldErrors: { dateKey: "Already a holiday" } };
    }
    throw error;
  }

  revalidateHolidayViews();
  return { success: true };
}

export async function deleteHolidayAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await requirePermission("policy:write");
  const { affectedDates } = await deleteHoliday(id, auditActorFrom(actor));
  await resettleDates(affectedDates);
  revalidateHolidayViews();
  return { ok: true };
}

export async function importCalendarHolidaysAction(
  year: number,
): Promise<{ ok: boolean; added?: number; skipped?: number; error?: string }> {
  const actor = await requirePermission("policy:write");
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { ok: false, error: "Choose a year between 2020 and 2100." };
  }
  const result = await importCalendarHolidays(year, auditActorFrom(actor));
  await resettleDates(result.affectedDates);
  revalidateHolidayViews();
  return { ok: true, added: result.added, skipped: result.skipped };
}

// ---------------------------------------------------------------------------
// Cover shifts
// ---------------------------------------------------------------------------

export type CoverShiftResult = {
  ok: boolean;
  error?: string;
  assigned?: number;
  /** People who already had an override that day and were left alone. */
  skipped?: string[];
};

/**
 * Rosters people to work one shift at a branch on one day, including people
 * from other branches. It is a one-day override like any other, with the
 * branch recorded, and that is what lets their punch be accepted there.
 *
 * Two permissions, because two schedules change: the receiving branch gains
 * someone, and each person's own branch loses them for the day. Naming the
 * receiving branch alone must not let its manager take staff from anywhere.
 */
export async function assignCoverShiftAction(input: CoverShiftInput): Promise<CoverShiftResult> {
  const parsed = coverShiftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid cover shift." };
  }
  const { branchId, dateKey, shiftId, employeeIds, reason, overwrite } = parsed.data;

  const actor = await requirePermission("schedule:write", { branchId });

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, isActive: true, OR: [{ branchId }, { branchId: null }] },
    select: { id: true },
  });
  if (!shift) return { ok: false, error: "That shift is not available at this branch." };

  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, status: "ACTIVE" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      branchAssignments: { where: { validTo: null }, select: { branchId: true } },
    },
  });
  if (employees.length !== new Set(employeeIds).size) {
    return { ok: false, error: "Some of the people chosen are not active employees." };
  }

  const notYours = employees.filter(
    (employee) =>
      !employee.branchAssignments.some((assignment) =>
        can(actor, "schedule:write", { branchId: assignment.branchId }),
      ),
  );
  if (notYours.length > 0) {
    return {
      ok: false,
      error: `You cannot change the schedule of ${notYours
        .map((e) => `${e.firstName} ${e.lastName}`.trim())
        .join(", ")}. Ask someone who manages their branch.`,
    };
  }

  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const skipped: string[] = [];
  let assigned = 0;

  await prisma.$transaction(async (tx) => {
    for (const employee of employees) {
      const existing = await tx.scheduleException.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date } },
      });
      if (existing && !overwrite) {
        skipped.push(`${employee.firstName} ${employee.lastName}`.trim());
        continue;
      }

      const data = {
        type: ScheduleExceptionType.EXTRA_SHIFT,
        shiftId,
        branchId,
        reason,
      };
      const cover = await tx.scheduleException.upsert({
        where: { employeeId_date: { employeeId: employee.id, date } },
        create: { employeeId: employee.id, date, createdBy: actor.userId, ...data },
        update: data,
      });

      await recordAudit(
        {
          actor: auditActorFrom(actor),
          action: "schedule.cover_assigned",
          entityType: "ScheduleException",
          entityId: cover.id,
          before: existing
            ? { type: existing.type, shiftId: existing.shiftId, branchId: existing.branchId, reason: existing.reason }
            : undefined,
          after: { ...data, employeeId: employee.id, date: dateKey },
        },
        tx,
      );

      // Recalculate only a day that already has a record, e.g. a cover entered
      // after the fact. Settling always writes a row, so doing it for a cover
      // booked in advance would create an empty attendance day for the future.
      const recorded = await tx.attendanceDay.findUnique({
        where: { employeeId_workDate: { employeeId: employee.id, workDate: date } },
        select: { branchId: true },
      });
      if (recorded) await settleDay(employee.id, recorded.branchId, dateKey, tx);
      assigned += 1;
    }
  });

  revalidatePath("/admin/shifts");
  revalidatePath("/admin/attendance");
  return { ok: true, assigned, skipped };
}


// ---------------------------------------------------------------------------
// Rota patterns
//
// A pattern for one branch needs schedule:write there; a pattern for every
// branch needs it everywhere. Editing checks the branch the pattern is on now
// as well as the one it is moving to, so nobody can take over another
// branch's pattern by re-scoping it.
// ---------------------------------------------------------------------------

type ActionResult = { ok: boolean; error?: string };

async function requirePatternWrite(branchId: string | null) {
  return branchId ? requirePermission("schedule:write", { branchId }) : requirePermission("schedule:write");
}

function revalidateRota() {
  revalidatePath("/admin/shifts");
  revalidatePath("/admin/attendance");
}

export async function savePatternAction(
  id: string | null,
  input: PatternFormInput,
): Promise<ActionResult & { fieldErrors?: Record<string, string> }> {
  const parsed = patternSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message, fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { name, branchId, cycle } = parsed.data;

  const actor = await requirePatternWrite(branchId);
  if (id) {
    const existing = await prisma.shiftPattern.findUnique({ where: { id }, select: { branchId: true } });
    if (!existing) return { ok: false, error: "That pattern no longer exists." };
    await requirePatternWrite(existing.branchId);
  }

  // Every shift in the cycle must be one this branch can use.
  const shiftIds = [...new Set(cycle.filter((day): day is string => day !== null))];
  const usable = await prisma.shift.count({
    where: {
      id: { in: shiftIds },
      isActive: true,
      OR: branchId ? [{ branchId: null }, { branchId }] : [{ branchId: null }],
    },
  });
  if (usable !== shiftIds.length) {
    return { ok: false, error: "One of the shifts is inactive or belongs to another branch." };
  }

  await savePattern(id, { name, branchId, cycle }, auditActorFrom(actor));
  revalidateRota();
  return { ok: true };
}

export async function setPatternActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const pattern = await prisma.shiftPattern.findUnique({ where: { id }, select: { branchId: true } });
  if (!pattern) return { ok: false, error: "That pattern no longer exists." };
  const actor = await requirePatternWrite(pattern.branchId);
  await setPatternActive(id, isActive, auditActorFrom(actor));
  revalidateRota();
  return { ok: true };
}

export async function deletePatternAction(id: string): Promise<ActionResult> {
  const pattern = await prisma.shiftPattern.findUnique({ where: { id }, select: { branchId: true } });
  if (!pattern) return { ok: false, error: "That pattern no longer exists." };
  const actor = await requirePatternWrite(pattern.branchId);
  try {
    await deletePattern(id, auditActorFrom(actor));
  } catch (error) {
    if (error instanceof PatternInUseError) return { ok: false, error: error.message };
    throw error;
  }
  revalidateRota();
  return { ok: true };
}

/**
 * Puts people on a pattern at a branch, or ends it (patternId null). Only
 * people currently assigned to that branch: a branch's rota is not a way to
 * schedule someone else's staff. Cover shifts are for that.
 */
export async function assignPatternAction(
  input: AssignPatternFormInput,
): Promise<ActionResult & { assigned?: number }> {
  const parsed = assignPatternSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { branchId, patternId, employeeIds, startDateKey, staggerDays } = parsed.data;

  const actor = await requirePermission("schedule:write", { branchId });

  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { timezone: true } });
  if (!branch) return { ok: false, error: "That branch no longer exists." };

  if (patternId) {
    const pattern = await prisma.shiftPattern.findFirst({
      where: { id: patternId, isActive: true, OR: [{ branchId: null }, { branchId }] },
      select: { id: true },
    });
    if (!pattern) return { ok: false, error: "That pattern is inactive or belongs to another branch." };
  }

  const here = await prisma.employeeBranchAssignment.findMany({
    where: { branchId, validTo: null, employeeId: { in: employeeIds }, employee: { status: "ACTIVE" } },
    select: { employeeId: true },
  });
  const hereIds = new Set(here.map((row) => row.employeeId));
  if (employeeIds.some((id) => !hereIds.has(id))) {
    return { ok: false, error: "Some of the people chosen are not active staff at this branch." };
  }

  const result = await assignPattern(
    { branchId, patternId, employeeIds, startDateKey, staggerDays, timeZone: branch.timezone },
    auditActorFrom(actor),
  );
  revalidateRota();
  return { ok: true, assigned: result.assigned };
}

export async function setAutoRotaAction(branchId: string, autoRota: boolean): Promise<ActionResult> {
  if (!branchId) return { ok: false, error: "Choose a branch." };
  const actor = await requirePermission("schedule:write", { branchId });
  await setAutoRota(branchId, autoRota, auditActorFrom(actor));
  revalidateRota();
  return { ok: true };
}

export async function generatePatternWeekAction(
  branchId: string,
  weekStartKey: string,
  overwrite: boolean,
): Promise<ActionResult & { written?: number; skipped?: number; people?: number }> {
  if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartKey)) return { ok: false, error: "Choose a branch and week." };
  const actor = await requirePermission("schedule:write", { branchId });

  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { autoRota: true } });
  if (!branch) return { ok: false, error: "That branch no longer exists." };
  // With Auto rota on, patterns already apply live; writing them out as
  // overrides would freeze this week against later pattern changes.
  if (branch.autoRota) return { ok: false, error: "This branch runs on Auto rota, so there is nothing to generate." };

  const result = await generatePatternWeek(branchId, weekStartKey, overwrite, auditActorFrom(actor));
  revalidateRota();
  return { ok: true, ...result };
}
