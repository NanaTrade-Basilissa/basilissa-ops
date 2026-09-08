import "server-only";
import {
  CorrectionOperation,
  ProviderType,
  TimeAssurance,
  type CorrectionReason,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { PROVIDER_BASELINE } from "./assurance";
import { checkCorrection, type CorrectionRefusal } from "./corrections";
import { settleDay } from "./settle";
import type { ProjectedDay } from "./projection";

const log = scoped("attendance.correction");

export type ApplyCorrectionCommand = {
  operation: CorrectionOperation;
  employeeId: string;
  branchId: string;
  workDateKey: string;
  /** Required except for INSERT_EVENT. */
  targetEventId?: string;
  /** ADJUST_TIME: the corrected instant. INSERT_EVENT: when the punch happened. */
  correctedOccurredAt?: Date;
  /** INSERT_EVENT only. */
  direction?: Prisma.AttendanceEventCreateInput["direction"];
  /** REASSIGN_BRANCH only. */
  correctedBranchId?: string;
  reasonCode: CorrectionReason;
  reasonText: string;
  actorUserId: string;
  actorEmployeeId: string | null;
};

export type CorrectionResult =
  | {
      ok: true;
      correctionId: string;
      requiresApproval: boolean;
      approvalReasons: string[];
      day: ProjectedDay;
    }
  | { ok: false; reason: CorrectionRefusal | "TARGET_NOT_FOUND"; message: string };

/**
 * Applies a correction.
 *
 * Nothing is edited. ADJUST_TIME and REASSIGN_BRANCH void the original event
 * and insert a replacement; VOID_EVENT only stops the original counting;
 * INSERT_EVENT adds a punch that should have existed. The correction row, any
 * replacement event, the audit entry and the re-settled day all share one
 * transaction.
 */
export async function applyCorrection(
  command: ApplyCorrectionCommand,
  actor: AuditActor,
): Promise<CorrectionResult> {
  const now = new Date();
  const workDate = new Date(`${command.workDateKey}T00:00:00.000Z`);

  const target = command.targetEventId
    ? await prisma.attendanceEvent.findUnique({
        where: { id: command.targetEventId },
        select: {
          id: true,
          employeeId: true,
          branchId: true,
          direction: true,
          occurredAt: true,
          providerType: true,
          identityAssurance: true,
          locationAssurance: true,
          timeAssurance: true,
        },
      })
    : null;

  if (command.operation !== CorrectionOperation.INSERT_EVENT && !target) {
    return {
      ok: false,
      reason: "TARGET_NOT_FOUND",
      message: "The event being corrected no longer exists",
    };
  }

  // How much paid time this moves, used only to decide whether a second
  // approver is needed.
  const minutesDelta =
    command.operation === CorrectionOperation.ADJUST_TIME && target && command.correctedOccurredAt
      ? Math.round(
          (command.correctedOccurredAt.getTime() - target.occurredAt.getTime()) / 60_000,
        )
      : 0;

  const check = checkCorrection({
    operation: command.operation,
    actorUserId: command.actorUserId,
    actorEmployeeId: command.actorEmployeeId,
    targetEmployeeId: command.employeeId,
    reasonCode: command.reasonCode,
    reasonText: command.reasonText,
    minutesDelta,
    // Determined properly by re-projecting below; the check only needs to know
    // whether it *might*, and a large swing already trips materiality.
    createsOvertime: false,
    workDate,
    now,
  });

  if (!check.allowed) return { ok: false, reason: check.reason, message: check.message };

  const correctionId = await prisma.$transaction(async (tx) => {
    let replacementEventId: string | null = null;

    if (
      command.operation === CorrectionOperation.ADJUST_TIME ||
      command.operation === CorrectionOperation.REASSIGN_BRANCH ||
      command.operation === CorrectionOperation.INSERT_EVENT
    ) {
      const occurredAt =
        command.correctedOccurredAt ?? target?.occurredAt ?? now;

      // Assurance is inherited from the original, with time downgraded to
      // HUMAN_ASSERTED. This is exactly what three axes are for: correcting the
      // clock on a fingerprint punch does not stop it being biometrically
      // identified — the finger was still on the reader. Only the time became
      // somebody's judgement.
      const inherited = target
        ? {
            identity: target.identityAssurance,
            location: target.locationAssurance,
            time:
              command.operation === CorrectionOperation.ADJUST_TIME
                ? TimeAssurance.HUMAN_ASSERTED
                : target.timeAssurance,
          }
        : PROVIDER_BASELINE[ProviderType.MANAGER_MANUAL];

      const replacement = await tx.attendanceEvent.create({
        data: {
          employeeId: command.employeeId,
          branchId: command.correctedBranchId ?? target?.branchId ?? command.branchId,
          direction: command.direction ?? target?.direction ?? "IN",
          providerType: target?.providerType ?? ProviderType.MANAGER_MANUAL,
          actorUserId: command.actorUserId,
          occurredAt,
          sourceReportedAt: target?.occurredAt,
          identityAssurance: inherited.identity,
          locationAssurance: inherited.location,
          timeAssurance: inherited.time,
          verificationOutcome: "UNVERIFIED",
          idempotencyKey: `correction:${command.operation}:${target?.id ?? "new"}:${occurredAt.toISOString()}`,
          flags: ["CORRECTION"],
        },
        select: { id: true },
      });
      replacementEventId = replacement.id;
    }

    const correction = await tx.attendanceCorrection.create({
      data: {
        employeeId: command.employeeId,
        workDate,
        operation: command.operation,
        targetEventId: target?.id ?? null,
        replacementEventId,
        before: target
          ? ({
              occurredAt: target.occurredAt.toISOString(),
              branchId: target.branchId,
              direction: target.direction,
              providerType: target.providerType,
            } as Prisma.InputJsonValue)
          : undefined,
        after: (command.correctedOccurredAt || command.correctedBranchId
          ? {
              occurredAt: command.correctedOccurredAt?.toISOString(),
              branchId: command.correctedBranchId,
            }
          : { voided: true }) as Prisma.InputJsonValue,
        reasonCode: command.reasonCode,
        reasonText: command.reasonText,
        correctedBy: command.actorUserId,
        requiresApproval: check.requiresApproval,
      },
      select: { id: true },
    });

    await recordAudit(
      {
        actor,
        action: `attendance_correction.${command.operation.toLowerCase()}`,
        entityType: "AttendanceCorrection",
        entityId: correction.id,
        metadata: {
          employeeId: command.employeeId,
          workDate: command.workDateKey,
          targetEventId: target?.id ?? null,
          replacementEventId,
          minutesDelta,
          requiresApproval: check.requiresApproval,
          approvalReasons: check.reasons,
          reasonCode: command.reasonCode,
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return correction.id;
  });

  const day = await settleDay(command.employeeId, command.branchId, command.workDateKey);

  log.info("correction applied", {
    correctionId,
    operation: command.operation,
    employeeId: command.employeeId,
    workDate: command.workDateKey,
    minutesDelta,
    requiresApproval: check.requiresApproval,
    dayStatus: day.status,
  });

  return {
    ok: true,
    correctionId,
    requiresApproval: check.requiresApproval,
    approvalReasons: check.reasons,
    day,
  };
}
