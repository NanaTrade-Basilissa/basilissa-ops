import "server-only";
import { AttendanceDirection, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, SYSTEM_ACTOR } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { PROVIDER_BASELINE } from "./assurance";
import { resolvePolicy } from "./policy-repository";
import { settleDay } from "./settle";

const log = scoped("attendance.auto-close");

/**
 * Closes shifts nobody clocked out of.
 *
 * A day left open is not a small problem: until it closes it credits zero
 * worked time, so an employee who forgot to punch out looks like they never
 * worked. Auto-closing gives them their scheduled hours and flags the day, so
 * a manager corrects from a sensible baseline rather than from nothing.
 *
 * The close is a real SYSTEM_AUTO_CLOSE event, not a special case inside the
 * projection. Everything stays derivable from the event log, and the assumption
 * is visible in the day's history rather than hidden in a calculation.
 */

export type AutoCloseSummary = { examined: number; closed: number; skipped: number };

/**
 * Deterministic, so re-running the sweep cannot create a second closing event
 * for the same day.
 */
function autoCloseKey(employeeId: string, workDateKey: string): string {
  return `autoclose:${employeeId}:${workDateKey}`;
}

export async function autoCloseStaleDays(
  now: Date = new Date(),
  limit = 200,
): Promise<AutoCloseSummary> {
  const candidates = await prisma.attendanceDay.findMany({
    where: {
      flags: { has: "MISSING_CLOCK_OUT" },
      // Without a scheduled end there is no defensible time to close at, so
      // those days wait for a person instead of being guessed at.
      scheduledEnd: { not: null, lt: now },
    },
    select: {
      employeeId: true,
      branchId: true,
      workDate: true,
      scheduledEnd: true,
      flags: true,
    },
    orderBy: { workDate: "asc" },
    take: limit,
  });

  let closed = 0;
  let skipped = 0;

  for (const day of candidates) {
    const workDateKey = day.workDate.toISOString().slice(0, 10);

    // Already closed on a previous sweep; the flag lingers because the day
    // still needs review.
    if (day.flags.includes("AUTO_CLOSED")) {
      skipped += 1;
      continue;
    }

    const policy = await resolvePolicy(day.branchId, day.scheduledEnd!);

    // If auto-close is disabled in policy (< 0), skip closing
    if (policy.autoCloseGraceMinutes < 0) {
      skipped += 1;
      continue;
    }

    const closeAfter = day.scheduledEnd!.getTime() + policy.autoCloseGraceMinutes * 60_000;

    // Still inside the grace window — someone may yet clock out.
    if (now.getTime() < closeAfter) {
      skipped += 1;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const event = await tx.attendanceEvent.create({
          data: {
            employeeId: day.employeeId,
            branchId: day.branchId,
            direction: AttendanceDirection.OUT,
            providerType: ProviderType.SYSTEM_AUTO_CLOSE,
            // The scheduled end, not now. Closing at the moment the sweep runs
            // would credit hours nobody worked, which is worse than the
            // missing punch it is fixing.
            occurredAt: day.scheduledEnd!,
            identityAssurance: PROVIDER_BASELINE.SYSTEM_AUTO_CLOSE.identity,
            locationAssurance: PROVIDER_BASELINE.SYSTEM_AUTO_CLOSE.location,
            timeAssurance: PROVIDER_BASELINE.SYSTEM_AUTO_CLOSE.time,
            verificationOutcome: "UNVERIFIED",
            idempotencyKey: autoCloseKey(day.employeeId, workDateKey),
            flags: ["AUTO_CLOSED"],
          },
          select: { id: true },
        });

        await recordAudit(
          {
            actor: SYSTEM_ACTOR,
            action: "attendance_event.auto_closed",
            entityType: "AttendanceEvent",
            entityId: event.id,
            metadata: {
              employeeId: day.employeeId,
              workDate: workDateKey,
              closedAt: day.scheduledEnd!.toISOString(),
              graceMinutes: policy.autoCloseGraceMinutes,
            },
          },
          tx,
        );
      });

      await settleDay(day.employeeId, day.branchId, workDateKey, prisma, now);
      closed += 1;

      log.info("closed a shift nobody clocked out of", {
        employeeId: day.employeeId,
        workDate: workDateKey,
        closedAt: day.scheduledEnd!.toISOString(),
      });
    } catch (error) {
      // A unique-constraint failure means a concurrent sweep already closed it,
      // which is fine. Anything else is worth seeing, and neither should stop
      // the remaining days being processed.
      skipped += 1;
      log.warn("could not auto-close", {
        employeeId: day.employeeId,
        workDate: workDateKey,
        error,
      });
    }
  }

  return { examined: candidates.length, closed, skipped };
}
