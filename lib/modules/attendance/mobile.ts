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
import { evaluateGeofence, type PunchCoordinates } from "./geofence";
import { ingestEvent, type IngestCommand } from "./ingest";
import type { ProjectedDay } from "./projection";

export type RecordMobilePunchInput = {
  employeeId: string;
  branchId: string;
  direction: AttendanceDirection;
  coordinates: PunchCoordinates;
  deviceId?: string;
  idempotencyKey?: string;
  actor?: AuditActor;
  _ingestFn?: typeof ingestEvent;
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
        select: { branchId: true },
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

  if (employee.branchAssignments.length === 0) {
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

  // 4. Stable idempotency key: 30s bucket prevents accidental client double-taps
  const windowBucket = Math.floor(Date.now() / 30_000);
  const stableIdempotencyKey =
    idempotencyKey || `mobile:${employeeId}:${direction}:${windowBucket}`;

  // 5. Ingest command construction
  const command: IngestCommand = {
    providerType: ProviderType.MOBILE_APP,
    idempotencyKey: stableIdempotencyKey,
    employeeId,
    branchId,
    occurredAt: new Date(),
    directionHint: direction,
    deviceId: deviceId || "web-mobile-client",
    assurance: {
      identity: IdentityAssurance.DEVICE_BOUND,
      location: geofenceResult.locationAssurance,
      time: TimeAssurance.SERVER,
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
    flags: geofenceResult.flags,
  };
}
