import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AttendanceDirection,
  GeofenceDecision,
  ProviderType,
} from "@prisma/client";
import { recordMobilePunch } from "@/lib/modules/attendance/server";
import { prisma } from "@/lib/platform/prisma";

describe("recordMobilePunch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validEmployee = {
    id: "emp_1",
    status: "ACTIVE",
    branchAssignments: [{ branchId: "branch_1" }],
  };

  const validBranch = {
    id: "branch_1",
    name: "Accra Mall Branch",
    latitude: 5.6219,
    longitude: -0.1742,
    geofenceRadiusMeters: 150,
    maxAcceptableAccuracyMeters: 100,
    geofenceEnabled: true,
  };

  it("fails if employee is not found", async () => {
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce(null);

    const result = await recordMobilePunch({
      employeeId: "emp_nonexistent",
      branchId: "branch_1",
      direction: AttendanceDirection.IN,
      coordinates: { latitude: 5.6219, longitude: -0.1742, accuracyMeters: 10 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("EMPLOYEE_NOT_FOUND");
    }
  });

  it("fails if employee is not assigned to the branch", async () => {
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
      id: "emp_1",
      status: "ACTIVE",
      branchAssignments: [], // Not assigned to branch_1
    } as never);

    const result = await recordMobilePunch({
      employeeId: "emp_1",
      branchId: "branch_1",
      direction: AttendanceDirection.IN,
      coordinates: { latitude: 5.6219, longitude: -0.1742, accuracyMeters: 10 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("BRANCH_NOT_ASSIGNED");
    }
  });

  it("rejects clock-in outside geofence without calling ingestEvent", async () => {
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce(validEmployee as never);
    vi.spyOn(prisma.branch, "findUnique").mockResolvedValueOnce(validBranch as never);
    const ingestSpy = vi.fn();

    // Coordinates 2km away from Accra Mall
    const result = await recordMobilePunch({
      employeeId: "emp_1",
      branchId: "branch_1",
      direction: AttendanceDirection.IN,
      coordinates: { latitude: 5.6022, longitude: -0.1738, accuracyMeters: 10 },
      _ingestFn: ingestSpy,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("OUTSIDE_GEOFENCE");
      expect(result.decision).toBe(GeofenceDecision.OUTSIDE);
      expect(result.distanceMeters).toBeGreaterThan(2000);
      expect(result.radiusMeters).toBe(150);
    }
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("accepts clock-in inside geofence and executes ingestEvent", async () => {
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce(validEmployee as never);
    vi.spyOn(prisma.branch, "findUnique").mockResolvedValueOnce(validBranch as never);

    const ingestSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      eventId: "event_mobile_1",
      replayed: false,
      direction: AttendanceDirection.IN,
      workDateKey: "2026-09-09",
      day: null,
    });

    const result = await recordMobilePunch({
      employeeId: "emp_1",
      branchId: "branch_1",
      direction: AttendanceDirection.IN,
      coordinates: { latitude: 5.622, longitude: -0.1742, accuracyMeters: 10 },
      _ingestFn: ingestSpy,
      skipScheduleCheck: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventId).toBe("event_mobile_1");
      expect(result.direction).toBe(AttendanceDirection.IN);
      expect(result.geofenceDecision).toBe(GeofenceDecision.INSIDE);
      expect(result.distanceMeters).toBeLessThan(50);
    }

    expect(ingestSpy).toHaveBeenCalledTimes(1);
    const command = ingestSpy.mock.calls[0][0];
    expect(command.providerType).toBe(ProviderType.MOBILE_APP);
    expect(command.evidence?.geofenceDecision).toBe(GeofenceDecision.INSIDE);
    expect(command.assurance?.location).toBe("GPS_VERIFIED");
  });

  it("accepts clock-out outside geofence with OUTSIDE_GEOFENCE flag", async () => {
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce(validEmployee as never);
    vi.spyOn(prisma.branch, "findUnique").mockResolvedValueOnce(validBranch as never);

    const ingestSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      eventId: "event_mobile_out_1",
      replayed: false,
      direction: AttendanceDirection.OUT,
      workDateKey: "2026-09-09",
      day: null,
    });

    // 2km away, but Clock-OUT (departure)
    const result = await recordMobilePunch({
      employeeId: "emp_1",
      branchId: "branch_1",
      direction: AttendanceDirection.OUT,
      coordinates: { latitude: 5.6022, longitude: -0.1738, accuracyMeters: 10 },
      _ingestFn: ingestSpy,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventId).toBe("event_mobile_out_1");
      expect(result.geofenceDecision).toBe(GeofenceDecision.OUTSIDE);
      expect(result.flags).toContain("OUTSIDE_GEOFENCE");
    }

    expect(ingestSpy).toHaveBeenCalledTimes(1);
    const command = ingestSpy.mock.calls[0][0];
    expect(command.assurance?.location).toBe("NONE");
    expect(command.evidence?.geofenceDecision).toBe(GeofenceDecision.OUTSIDE);
  });

  it("rejects clock-in when employee already completed today's shift", async () => {
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce(validEmployee as never);
    vi.spyOn(prisma.branch, "findUnique").mockResolvedValueOnce(validBranch as never);
    vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValueOnce({
      actualIn: new Date("2026-09-17T08:00:00.000Z"),
      actualOut: new Date("2026-09-17T16:00:00.000Z"),
    } as never);

    const result = await recordMobilePunch({
      employeeId: "emp_1",
      branchId: "branch_1",
      direction: AttendanceDirection.IN,
      coordinates: { latitude: 5.622, longitude: -0.1742, accuracyMeters: 10 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("SHIFT_ALREADY_COMPLETED");
      expect(result.message).toContain("already completed your shift");
    }
  });

  it("rejects clock-in when employee has no scheduled shift for today", async () => {
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce(validEmployee as never);
    vi.spyOn(prisma.branch, "findUnique").mockResolvedValueOnce(validBranch as never);
    vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValueOnce(null);
    vi.spyOn(prisma.shift, "findMany").mockResolvedValueOnce([]);
    vi.spyOn(prisma.employeeShiftAssignment, "findMany").mockResolvedValueOnce([]);
    vi.spyOn(prisma.scheduleException, "findMany").mockResolvedValueOnce([]);

    const result = await recordMobilePunch({
      employeeId: "emp_1",
      branchId: "branch_1",
      direction: AttendanceDirection.IN,
      coordinates: { latitude: 5.622, longitude: -0.1742, accuracyMeters: 10 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("NO_SCHEDULED_SHIFT");
      expect(result.message).toContain("do not have a shift scheduled");
    }
  });
});
