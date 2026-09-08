import "server-only";
import {
  AttendanceDirection,
  ManualEntryReason,
  Prisma,
  ProviderType,
  type IdentityAssurance,
  type LocationAssurance,
  type TimeAssurance,
} from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { type AssuranceProfile } from "./assurance";
import { providerFor } from "./providers";
import {
  canonicalEvents,
  directionForIncoming,
  resolveDuplicate,
  type DedupCandidate,
} from "./events";
import { resolvePolicy } from "./policy-repository";
import { resolveWorkDate, settleDay } from "./settle";
import type { ProjectedDay } from "./projection";

const log = scoped("attendance.ingest");

/**
 * The ingest pipeline: provider-agnostic by design.
 *
 * Every capture path — a terminal, the mobile app, a manager typing it in —
 * arrives here in the same shape, and the steps below run identically. Adding
 * a provider means writing an adapter that produces an IngestCommand, not
 * touching this file.
 *
 * Where providers genuinely differ, they differ by DECLARATION: retro limits,
 * verification and the assurance baseline are read from `providers.ts`, never
 * branched on here. This file used to name MANAGER_MANUAL twice, which is how
 * a provider-agnostic pipeline stops being one.
 */

export type IngestEvidence = {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  distanceMeters?: number;
  isMockLocation?: boolean;
  deviceRawPayload?: Prisma.InputJsonValue;
  manualReasonCode?: ManualEntryReason;
  manualReasonText?: string;
};

export type IngestCommand = {
  providerType: ProviderType;
  /** Provider-scoped and stable, so a replay resolves to the same row. */
  idempotencyKey: string;
  employeeId: string;
  branchId: string;
  /** The authoritative time. Which clock it came from is the provider's call. */
  occurredAt: Date;
  /** What the source claimed, when that differs from what is trusted. */
  sourceReportedAt?: Date;
  clockSkewMs?: number;
  /** Advisory. Recorded and compared, never obeyed. */
  directionHint?: AttendanceDirection;
  /** Who performed the action, for manual and system entries. */
  actorUserId?: string;
  deviceId?: string;
  providerRef?: string;
  /** Overrides the provider baseline where evidence justifies it. */
  assurance?: Partial<AssuranceProfile>;
  evidence?: IngestEvidence;
};

export type IngestFailure =
  | "PROVIDER_NOT_IMPLEMENTED"
  | "EMPLOYEE_NOT_FOUND"
  | "EMPLOYEE_NOT_ACTIVE"
  | "BRANCH_NOT_ASSIGNED"
  | "FUTURE_TIMESTAMP"
  | "RETRO_LIMIT_EXCEEDED"
  | "SELF_ENTRY_FORBIDDEN";

export type IngestResult =
  | {
      ok: true;
      eventId: string;
      /** True when an existing event was returned rather than a new one created. */
      replayed: boolean;
      direction: AttendanceDirection;
      workDateKey: string;
      day: ProjectedDay | null;
    }
  | { ok: false; reason: IngestFailure; message: string };

/** Clock skew and network delay are normal; hours into the future are not. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

export async function ingestEvent(
  command: IngestCommand,
  actor: AuditActor,
): Promise<IngestResult> {
  const provider = providerFor(command.providerType);

  /*
    A provider is registered before it is built, so its shape can be agreed
    while that is still cheap. The cost of registering early is that the enum
    accepts a value nothing can honour yet — and an unbuilt provider silently
    producing a VERIFIED event with a full assurance baseline is a worse
    outcome than any error. Refused explicitly, first.
  */
  if (provider.status !== "IMPLEMENTED") {
    return {
      ok: false,
      reason: "PROVIDER_NOT_IMPLEMENTED",
      message: `${provider.label} is not implemented yet (${provider.plannedFor})`,
    };
  }

  // 1. Replay check next, before any validation. A retried request must
  //    return the original event even if the rules have since changed —
  //    otherwise a network retry could be rejected for a reason that did not
  //    apply when the person actually punched.
  const existing = await prisma.attendanceEvent.findUnique({
    where: {
      providerType_idempotencyKey: {
        providerType: command.providerType,
        idempotencyKey: command.idempotencyKey,
      },
    },
    select: { id: true, direction: true, employeeId: true, branchId: true, occurredAt: true },
  });

  if (existing) {
    const workDateKey = await resolveWorkDate(
      existing.employeeId,
      existing.branchId,
      existing.occurredAt,
    );
    return {
      ok: true,
      eventId: existing.id,
      replayed: true,
      direction: existing.direction,
      workDateKey,
      day: null,
    };
  }

  // 2. Identify. An unknown or inactive employee is refused rather than
  //    guessed at; a device-sourced command would have been quarantined
  //    before reaching here.
  const employee = await prisma.employee.findUnique({
    where: { id: command.employeeId },
    select: {
      id: true,
      status: true,
      branchAssignments: {
        where: { OR: [{ validTo: null }, { validTo: { gt: command.occurredAt } }] },
        select: { branchId: true, validFrom: true },
      },
    },
  });

  if (!employee) {
    return { ok: false, reason: "EMPLOYEE_NOT_FOUND", message: "Unknown employee" };
  }
  if (employee.status !== "ACTIVE") {
    return { ok: false, reason: "EMPLOYEE_NOT_ACTIVE", message: "Employee is not active" };
  }

  const assignedHere = employee.branchAssignments.some(
    (assignment) =>
      assignment.branchId === command.branchId &&
      assignment.validFrom.getTime() <= command.occurredAt.getTime(),
  );
  if (!assignedHere) {
    return {
      ok: false,
      reason: "BRANCH_NOT_ASSIGNED",
      message: "Employee is not assigned to this branch",
    };
  }

  // 3. Sanity-check the time before anything is derived from it.
  const now = Date.now();
  if (command.occurredAt.getTime() > now + FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: "FUTURE_TIMESTAMP", message: "Timestamp is in the future" };
  }

  const policy = await resolvePolicy(command.branchId, command.occurredAt);

  /*
    A human choosing a date in the past is the shape fabrication takes, so that
    is bounded. A device reporting late is a terminal delivering a buffered
    offline day, and bounding that would discard real punches. Which of the two
    a provider is, it declares.
  */
  if (provider.capabilities.retroLimit === "POLICY_MANUAL_LIMIT") {
    const ageDays = (now - command.occurredAt.getTime()) / 86_400_000;
    if (ageDays > policy.maxManualEntryDays) {
      return {
        ok: false,
        reason: "RETRO_LIMIT_EXCEEDED",
        message: `${provider.label} is limited to ${policy.maxManualEntryDays} days`,
      };
    }
  }

  const workDateKey = await resolveWorkDate(employee.id, command.branchId, command.occurredAt);

  const dayEvents = await loadDayEvents(employee.id, command.branchId, workDateKey);
  // Superseded events must not advance the state machine, or a deduplicated
  // punch would still push the next one the wrong way.
  const priorEvents = canonicalEvents(dayEvents);

  // 4. Assurance: provider baseline, adjusted where evidence justifies it.
  const baseline = provider.baseline;
  const assurance: AssuranceProfile = {
    identity: (command.assurance?.identity ?? baseline.identity) as IdentityAssurance,
    location: (command.assurance?.location ?? baseline.location) as LocationAssurance,
    time: (command.assurance?.time ?? baseline.time) as TimeAssurance,
  };

  // 5. Direction, accounting for near-simultaneous duplicates. See
  //    directionForIncoming — the ordering there is load-bearing.
  const { direction, hintMismatch } = directionForIncoming(
    command.occurredAt,
    priorEvents,
    command.directionHint,
    policy.dedupWindowMinutes,
  );

  const candidates: DedupCandidate[] = priorEvents.map((event) => ({
    ...event,
    assurance: event.assurance,
  }));
  const duplicate = resolveDuplicate(
    { direction, occurredAt: command.occurredAt, assurance },
    candidates,
    policy.dedupWindowMinutes,
  );

  const flags: string[] = [];
  if (hintMismatch) flags.push("DIRECTION_HINT_MISMATCH");
  if (command.evidence?.isMockLocation) flags.push("MOCK_LOCATION");
  if (duplicate.kind !== "unique") flags.push("CROSS_PROVIDER_DUPLICATE");

  // 7. Persist. Event, evidence and audit share one transaction, so a punch
  //    cannot exist without its record of who caused it.
  const eventId = await prisma.$transaction(async (tx) => {
    const created = await tx.attendanceEvent.create({
      data: {
        employeeId: employee.id,
        branchId: command.branchId,
        direction,
        providerType: command.providerType,
        providerRef: command.providerRef,
        deviceId: command.deviceId,
        actorUserId: command.actorUserId,
        occurredAt: command.occurredAt,
        sourceReportedAt: command.sourceReportedAt,
        clockSkewMs: command.clockSkewMs,
        directionHint: command.directionHint,
        hintMismatch,
        identityAssurance: assurance.identity,
        locationAssurance: assurance.location,
        timeAssurance: assurance.time,
        verificationOutcome: provider.capabilities.verification,
        supersedesEventId: duplicate.kind === "supersedes" ? duplicate.eventId : null,
        supersededByEventId: duplicate.kind === "superseded_by" ? duplicate.eventId : null,
        idempotencyKey: command.idempotencyKey,
        flags,
      },
      select: { id: true },
    });

    if (command.evidence) {
      await tx.eventEvidence.create({
        data: { eventId: created.id, ...command.evidence },
      });
    }

    await recordAudit(
      {
        actor,
        action: "attendance_event.recorded",
        entityType: "AttendanceEvent",
        entityId: created.id,
        after: {
          employeeId: employee.id,
          branchId: command.branchId,
          direction,
          providerType: command.providerType,
          occurredAt: command.occurredAt.toISOString(),
          workDateKey,
          assurance,
          flags,
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return created.id;
  });

  // 8. Settle. Done synchronously because it is one employee and one day, and
  //    a manager typing an entry should see the result rather than waiting for
  //    a worker tick. Bulk device ingest may move this onto the queue.
  const day = await settleDay(employee.id, command.branchId, workDateKey);

  log.info("event recorded", {
    eventId,
    employeeId: employee.id,
    direction,
    providerType: command.providerType,
    workDateKey,
    dayStatus: day.status,
    flags,
  });

  return { ok: true, eventId, replayed: false, direction, workDateKey, day };
}

/** The employee's canonical events already owned by this work date. */
async function loadDayEvents(employeeId: string, branchId: string, workDateKey: string) {
  const dayStart = new Date(`${workDateKey}T00:00:00.000Z`);
  const rows = await prisma.attendanceEvent.findMany({
    where: {
      employeeId,
      occurredAt: {
        gte: new Date(dayStart.getTime() - 24 * 60 * 60_000),
        lte: new Date(dayStart.getTime() + 48 * 60 * 60_000),
      },
    },
    select: {
      id: true,
      direction: true,
      occurredAt: true,
      supersedesEventId: true,
      supersededByEventId: true,
      identityAssurance: true,
      locationAssurance: true,
      timeAssurance: true,
    },
  });

  const owned = await Promise.all(
    rows.map(async (row) => ({
      row,
      key: await resolveWorkDate(employeeId, branchId, row.occurredAt),
    })),
  );

  return owned
    .filter((entry) => entry.key === workDateKey)
    .map(({ row }) => ({
      id: row.id,
      direction: row.direction,
      occurredAt: row.occurredAt,
      supersedesEventId: row.supersedesEventId,
      supersededByEventId: row.supersededByEventId,
      assurance: {
        identity: row.identityAssurance,
        location: row.locationAssurance,
        time: row.timeAssurance,
      },
    }));
}
