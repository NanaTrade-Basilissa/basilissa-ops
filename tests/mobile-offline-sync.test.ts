import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as syncPunches } from "@/lib/../app/api/v1/attendance/punch/sync/route";
import * as attendanceServer from "@/lib/modules/attendance/server";
import { createDeviceToken } from "@/lib/modules/attendance/server";
import { GeofenceDecision } from "@prisma/client";

describe("POST /api/v1/attendance/punch/sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validToken = createDeviceToken({
    employeeId: "emp_100",
    deviceId: "device_kitchen_ipad",
    phone: "+233241234567",
  });

  it("returns 401 when device token is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/attendance/punch/sync", {
      method: "POST",
      body: JSON.stringify({ punches: [] }),
    });

    const res = await syncPunches(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when punches array is empty", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/attendance/punch/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${validToken}` },
      body: JSON.stringify({ punches: [] }),
    });

    const res = await syncPunches(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("VALIDATION_ERROR");
  });

  it("sorts punches chronologically and syncs them through recordMobilePunch", async () => {
    const processedTimes: string[] = [];

    vi.spyOn(attendanceServer, "recordMobilePunch").mockImplementation(async (input) => {
      processedTimes.push(input.occurredAt?.toISOString() ?? "");
      expect(input.isOffline).toBe(true);

      if (input.direction === "IN") {
        return {
          ok: true,
          eventId: "evt_in",
          replayed: false,
          direction: "IN",
          workDateKey: "2026-09-10",
          day: null,
          geofenceDecision: GeofenceDecision.INSIDE,
          distanceMeters: 45,
          flags: [],
        };
      } else {
        return {
          ok: true,
          eventId: "evt_out",
          replayed: false,
          direction: "OUT",
          workDateKey: "2026-09-10",
          day: null,
          geofenceDecision: GeofenceDecision.OUTSIDE,
          distanceMeters: 250,
          flags: ["OUTSIDE_GEOFENCE"],
        };
      }
    });

    // Deliberately unsorted in request: OUT punch (16:00) before IN punch (08:00)
    const punches = [
      {
        clientPunchId: "punch_out_1",
        branchId: "branch_accra",
        direction: "OUT",
        occurredAt: "2026-09-10T16:00:00.000Z",
        latitude: 5.622,
        longitude: -0.174,
        accuracyMeters: 15,
      },
      {
        clientPunchId: "punch_in_1",
        branchId: "branch_accra",
        direction: "IN",
        occurredAt: "2026-09-10T08:00:00.000Z",
        latitude: 5.6219,
        longitude: -0.1742,
        accuracyMeters: 10,
      },
    ];

    const req = new NextRequest("http://localhost:3000/api/v1/attendance/punch/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${validToken}` },
      body: JSON.stringify({ punches }),
    });

    const res = await syncPunches(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.total).toBe(2);
    expect(data.accepted).toBe(2);
    expect(data.rejected).toBe(0);

    // Verify chronological order of processing
    expect(processedTimes).toEqual([
      "2026-09-10T08:00:00.000Z",
      "2026-09-10T16:00:00.000Z",
    ]);

    expect(data.results[0].clientPunchId).toBe("punch_in_1");
    expect(data.results[0].status).toBe("ACCEPTED");
    expect(data.results[1].clientPunchId).toBe("punch_out_1");
    expect(data.results[1].status).toBe("ACCEPTED");
  });

  it("handles duplicate and rejected punches within the batch gracefully", async () => {
    vi.spyOn(attendanceServer, "recordMobilePunch")
      .mockResolvedValueOnce({
        ok: true,
        eventId: "evt_dup",
        replayed: true, // duplicate
        direction: "IN",
        workDateKey: "2026-09-10",
        day: null,
        geofenceDecision: GeofenceDecision.INSIDE,
        distanceMeters: 50,
        flags: [],
      })
      .mockResolvedValueOnce({
        ok: false,
        error: "OUTSIDE_GEOFENCE",
        message: "Clock-in rejected: 350m from branch",
      });

    const punches = [
      {
        clientPunchId: "p1",
        branchId: "branch_accra",
        direction: "IN",
        occurredAt: "2026-09-10T08:00:00.000Z",
        latitude: 5.6219,
        longitude: -0.1742,
        accuracyMeters: 10,
      },
      {
        clientPunchId: "p2",
        branchId: "branch_accra",
        direction: "IN",
        occurredAt: "2026-09-10T08:30:00.000Z",
        latitude: 5.7,
        longitude: -0.2,
        accuracyMeters: 10,
      },
    ];

    const req = new NextRequest("http://localhost:3000/api/v1/attendance/punch/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${validToken}` },
      body: JSON.stringify({ punches }),
    });

    const res = await syncPunches(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(2);
    expect(data.duplicates).toBe(1);
    expect(data.rejected).toBe(1);

    expect(data.results[0].status).toBe("DUPLICATE");
    expect(data.results[1].status).toBe("REJECTED");
    expect(data.results[1].error).toBe("OUTSIDE_GEOFENCE");
  });
});
