"use server";

import { revalidatePath } from "next/cache";
import { requireFeature } from "@/lib/platform/features-guard";
import {
  CorrectionOperation,
  ProviderType,
  ScheduleExceptionType,
  type CorrectionReason,
  type ManualEntryReason,
} from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { auditActorFrom, requirePermission } from "@/lib/modules/identity/server";
import { recordAudit } from "@/lib/platform/audit";
import { settleDay } from "./settle";
import { applyCorrection } from "./correction-service";
import { ingestEvent } from "./ingest";
import { checkManualEntry } from "./manual";
import { resolvePolicy } from "./policy-repository";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";
import { supersedePolicy } from "./policy-repository";
import { attendancePolicySchema } from "./validation";

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
  // Gated in the action as well as the page: a Server Action is reachable
  // by direct POST without ever rendering the page in front of it.
  requireFeature("attendance");

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
    // Confirming the values is the act of removing the provisional flag, so
    // the checkbox reads as "these are agreed" rather than "still a guess".
    isProvisional: formData.get("confirmed") !== "on",
    changeReason: formData.get("changeReason"),
  });

  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Supersede, never update: the current version is closed and a new one
  // opened, so attendance already settled keeps resolving against the rules
  // that applied when it was worked.
  const versionId = await supersedePolicy(
    null,
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
  // Gated in the action as well as the page: a Server Action is reachable
  // by direct POST without ever rendering the page in front of it.
  requireFeature("attendance");

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
  requireFeature("attendance");

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
  // Gated in the action as well as the page: a Server Action is reachable
  // by direct POST without ever rendering the page in front of it.
  requireFeature("attendance");

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
  requireFeature("attendance");

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
  requireFeature("attendance");

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
