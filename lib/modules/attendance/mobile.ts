import "server-only";
import {
  AttendanceDirection,
  GeofenceDecision,
  IdentityAssurance,
  ProviderType,
  TimeAssurance,
} from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import type { AuditActor } from "@/lib/platform/audit";
import { dateKeyInZone } from "@/lib/platform/date";
import { evaluateGeofence, type PunchCoordinates } from "./geofence";
import { ingestEvent, type IngestCommand } from "./ingest";
import type { ProjectedDay } from "./projection";
import { resolveScheduleForDate } from "./schedule";
import { loadHolidayKeys } from "./holidays";
import { isCoveringAt } from "./cover";
import { loadLivePatternsFor } from "./patterns";

export type RecordMobilePunchInput = {
  employeeId: string;
  branchId: string;
  direction: AttendanceDirection;
  coordinates: PunchCoordinates;
  deviceId?: string;
  idempotencyKey?: string;
  occurredAt?: Date;
  isOffline?: boolean;
  actor?: AuditActor;
  _ingestFn?: typeof ingestEvent;
  skipScheduleCheck?: boolean;
};

export type MobilePunchResult =
  | {
      ok: true;
      eventId: string;
      replayed: boolean;
      direction: AttendanceDirection;
      workDateKey: string;
      day: ProjectedDay | null;
      geofenceDecision: GeofenceDecision;
      distanceMeters: number | null;
      flags: string[];
    }
  | {
      ok: false;
      error:
        | "EMPLOYEE_NOT_FOUND"
        | "EMPLOYEE_NOT_ACTIVE"
        | "BRANCH_NOT_FOUND"
        | "BRANCH_NOT_ASSIGNED"
        | "OUTSIDE_GEOFENCE"
        | "SHIFT_ALREADY_COMPLETED"
        | "NO_SCHEDULED_SHIFT"
        | "INGEST_FAILED";
      message: string;
      distanceMeters?: number | null;
      radiusMeters?: number;
      decision?: GeofenceDecision;
    };

/**
 * Validates mobile coordinates against branch geofencing and records an attendance
 * event through the provider-agnostic ingest pipeline.
 */
export async function recordMobilePunch(
  input: RecordMobilePunchInput,
): Promise<MobilePunchResult> {
  const {
    employeeId,
    branchId,
    direction,
    coordinates,
    deviceId,
    idempotencyKey,
    occurredAt,
    isOffline,
    actor,
    _ingestFn,
  } = input;

  // 1. Validate employee exists and is active
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      status: true,
      branchAssignments: {
        where: { branchId },
        select: { branchId: true, validFrom: true, validTo: true },
      },
    },
  });

  if (!employee) {
    return {
      ok: false,
      error: "EMPLOYEE_NOT_FOUND",
      message: "Employee not found.",
    };
  }

  if (employee.status !== "ACTIVE") {
    return {
      ok: false,
      error: "EMPLOYEE_NOT_ACTIVE",
      message: "Employee is not active.",
    };
  }

  // Mirrors the ingest pipeline's own check, so the person gets this message
  // rather than a generic refusal: assigned here, or covering a shift here.
  // Same instant the punch is recorded at: the client clock only counts offline.
  const punchAt = isOffline && occurredAt ? occurredAt : new Date();
  const assignedHere = employee.branchAssignments.some(
    (assignment) =>
      assignment.validFrom.getTime() <= punchAt.getTime() &&
      (assignment.validTo === null || assignment.validTo.getTime() > punchAt.getTime()),
  );
  if (!assignedHere && !(await isCoveringAt(employeeId, branchId, punchAt))) {
    return {
      ok: false,
      error: "BRANCH_NOT_ASSIGNED",
      message: "Employee is not assigned to this branch.",
    };
  }

  // 2. Fetch branch geofence configuration
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      geofenceRadiusMeters: true,
      maxAcceptableAccuracyMeters: true,
      geofenceEnabled: true,
      timezone: true,
    },
  });

  if (!branch) {
    return {
      ok: false,
      error: "BRANCH_NOT_FOUND",
      message: "Branch not found.",
    };
  }

  // 3. Evaluate geofence rules
  const geofenceResult = evaluateGeofence(branch, coordinates, direction);

  if (!geofenceResult.isAccepted) {
    return {
      ok: false,
      error: "OUTSIDE_GEOFENCE",
      message:
        geofenceResult.rejectionReason ??
        "Clock-in rejected: Outside geofence boundary.",
      distanceMeters: geofenceResult.distanceMeters,
      radiusMeters: branch.geofenceRadiusMeters,
      decision: geofenceResult.decision,
    };
  }

  // 4. For clock-in punches, enforce single-shift and scheduled shift policy
  if (direction === AttendanceDirection.IN && !input.skipScheduleCheck) {
    const branchTz = branch.timezone || "Africa/Accra";
    const punchNow = occurredAt || new Date();
    const todayKey = dateKeyInZone(punchNow, branchTz);
    const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

    // 4a. Reject if today's shift is already completed (clocked in and clocked out)
    const existingDay = await prisma.attendanceDay.findFirst({
      where: {
        employeeId,
        workDate: todayDate,
      },
      select: {
        actualIn: true,
        actualOut: true,
      },
    });

    if (existingDay && existingDay.actualIn !== null && existingDay.actualOut !== null) {
      return {
        ok: false,
        error: "SHIFT_ALREADY_COMPLETED",
        message:
          "You have already completed your shift for today. If you need an adjustment, please contact your manager.",
      };
    }

    // 4b. Reject if employee has no shift scheduled for today
    const [shifts, shiftAssignments, exceptions, holidays, patterns] = await Promise.all([
      prisma.shift.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          startMinute: true,
          endMinute: true,
          unpaidBreakMinutes: true,
          offOnPublicHolidays: true,
        },
      }),
      prisma.employeeShiftAssignment.findMany({
        where: {
          employeeId,
          validFrom: { lte: punchNow },
          OR: [{ validTo: null }, { validTo: { gte: punchNow } }],
        },
        select: {
          employeeId: true,
          shiftId: true,
          daysOfWeek: true,
          validFrom: true,
          validTo: true,
        },
      }),
      prisma.scheduleException.findMany({
        where: {
          employeeId,
          date: todayDate,
        },
        select: { date: true, shiftId: true, type: true, branchId: true },
      }),
      loadHolidayKeys(),
      loadLivePatternsFor(employeeId),
    ]);

    const resolvedSchedule = resolveScheduleForDate(todayKey, {
      timeZone: branchTz,
      shifts,
      assignments: shiftAssignments,
      exceptions: exceptions.map((ex) => ({
        dateKey: todayKey,
        shiftId: ex.shiftId,
        type: ex.type,
        branchId: ex.branchId,
      })),
      holidays,
      patterns,
    });

    if (!resolvedSchedule) {
      return {
        ok: false,
        error: "NO_SCHEDULED_SHIFT",
        message:
          "You do not have a shift scheduled for today. Please contact your manager to be added to the rota.",
      };
    }
  }

  // 4. Stable idempotency key: 30s bucket prevents accidental client double-taps
  const windowBucket = Math.floor(Date.now() / 30_000);
  const stableIdempotencyKey =
    idempotencyKey || `mobile:${employeeId}:${direction}:${windowBucket}`;

  // 5. Ingest command construction
  const now = new Date();
  const effectiveOccurredAt = isOffline && occurredAt ? occurredAt : now;
  const timeAssurance = isOffline ? TimeAssurance.DEVICE_UNVERIFIED : TimeAssurance.SERVER;

  const command: IngestCommand = {
    providerType: ProviderType.MOBILE_APP,
    idempotencyKey: stableIdempotencyKey,
    employeeId,
    branchId,
    occurredAt: effectiveOccurredAt,
    sourceReportedAt: isOffline && occurredAt ? occurredAt : undefined,
    directionHint: direction,
    deviceId: deviceId || "web-mobile-client",
    assurance: {
      identity: IdentityAssurance.DEVICE_BOUND,
      location: geofenceResult.locationAssurance,
      time: timeAssurance,
    },
    evidence: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      accuracyMeters: Math.round(coordinates.accuracyMeters),
      distanceMeters: geofenceResult.distanceMeters ?? undefined,
      isMockLocation: Boolean(coordinates.isMockLocation),
      geofenceDecision: geofenceResult.decision,
      geofenceSnapshot: geofenceResult.geofenceSnapshot,
    },
  };

  const auditActor: AuditActor = actor || {
    userId: employeeId,
    email: null,
    role: "EMPLOYEE",
  };

  const ingest = _ingestFn ?? ingestEvent;
  const result = await ingest(command, auditActor);

  if (!result.ok) {
    return {
      ok: false,
      error: "INGEST_FAILED",
      message: result.message,
    };
  }

  return {
    ok: true,
    eventId: result.eventId,
    replayed: result.replayed,
    direction: result.direction,
    workDateKey: result.workDateKey,
    day: result.day,
    geofenceDecision: geofenceResult.decision,
    distanceMeters: geofenceResult.distanceMeters,
    flags: isOffline ? [...geofenceResult.flags, "OFFLINE_SYNCED"] : geofenceResult.flags,
  };
}
