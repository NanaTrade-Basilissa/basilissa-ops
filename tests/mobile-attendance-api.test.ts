import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getStatus } from "@/lib/../app/api/v1/attendance/status/route";
import { GET as getHistory } from "@/lib/../app/api/v1/attendance/history/route";
import { createDeviceToken } from "@/lib/modules/attendance/server";
import { prisma } from "@/lib/platform/prisma";
import { AttendanceDirection } from "@prisma/client";

describe("Mobile Attendance APIs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validToken = createDeviceToken({
    employeeId: "emp_100",
    deviceId: "device_abc",
    phone: "+233241234567",
  });

  describe("GET /api/v1/attendance/status", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/attendance/status");
      const res = await getStatus(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("returns 401 when token is invalid or corrupted", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/attendance/status", {
        headers: { Authorization: "Bearer invalid-garbage-token" },
      });
      const res = await getStatus(req);
      expect(res.status).toBe(401);
    });

    it("returns 200 with live status, last punch, and branch geofences", async () => {
      // Mock employee
      vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
        id: "emp_100",
        firstName: "Kwame",
        lastName: "Mensah",
        employeeCode: "EMP-100",
        jobTitle: "Sous Chef",
        status: "ACTIVE",
        branchAssignments: [
          {
            branch: {
              id: "branch_1",
              name: "Accra Mall",
              slug: "accra-mall",
              latitude: 5.6219,
              longitude: -0.1742,
              geofenceRadiusMeters: 150,
              geofenceEnabled: true,
              timezone: "Africa/Accra",
            },
          },
        ],
      } as never);

      // Mock today's AttendanceDay
      vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValueOnce({
        id: "day_today",
        employeeId: "emp_100",
        workDate: new Date("2026-09-10T00:00:00.000Z"),
        branchId: "branch_1",
        branch: { id: "branch_1", name: "Accra Mall" },
        actualIn: new Date("2026-09-10T08:05:00.000Z"),
        actualOut: null,
        netWorkedMinutes: 120,
        regularMinutes: 120,
        overtimeMinutes: 0,
        lateMinutes: 5,
        status: "OPEN",
        flags: ["LATE_ARRIVAL"],
      } as never);

      // Mock last AttendanceEvent and Corrections
      vi.spyOn(prisma.attendanceEvent, "findMany").mockResolvedValueOnce([
        {
          id: "evt_1",
          direction: AttendanceDirection.IN,
          occurredAt: new Date("2026-09-10T08:05:00.000Z"),
          branchId: "branch_1",
        },
      ] as never);
      vi.spyOn(prisma.attendanceCorrection, "findMany").mockResolvedValueOnce([] as never);

      // Mock shifts, shiftAssignments, exceptions, branchMapRecords
      vi.spyOn(prisma.shift, "findMany").mockResolvedValueOnce([
        { id: "shift_m", name: "Morning", startMinute: 480, endMinute: 960, unpaidBreakMinutes: 60 },
      ] as never);
      vi.spyOn(prisma.employeeShiftAssignment, "findMany").mockResolvedValueOnce([] as never);
      vi.spyOn(prisma.scheduleException, "findMany").mockResolvedValueOnce([] as never);
      vi.spyOn(prisma.branch, "findMany").mockResolvedValueOnce([
        { id: "branch_1", name: "Accra Mall" },
      ] as never);
      vi.spyOn(prisma.leaveRequest, "findMany").mockResolvedValueOnce([] as never);

      const req = new NextRequest("http://localhost:3000/api/v1/attendance/status", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getStatus(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.currentStatus).toBe("CLOCKED_IN");
      expect(data.canClockIn).toBe(false);
      expect(data.canClockOut).toBe(true);
      expect(data.clockInDisabledReason).toBe("ALREADY_ON_DUTY");
      expect(data.employee.name).toBe("Kwame Mensah");
      expect(data.employee.employeeCode).toBe("EMP-100");
      expect(data.lastPunch.direction).toBe("IN");
      expect(data.lastPunch.branchName).toBe("Accra Mall");
      expect(data.todayRecord.actualInTime).toBe("08:05");
      expect(data.todayRecord.lateMinutes).toBe(5);
      expect(data.assignedBranches.length).toBe(1);
      expect(data.assignedBranches[0].geofenceRadiusMeters).toBe(150);
    });

    it("returns currentStatus COMPLETED and disables clock-in when shift is completed today", async () => {
      vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
        id: "emp_100",
        firstName: "Kwame",
        lastName: "Mensah",
        employeeCode: "EMP-100",
        jobTitle: "Sous Chef",
        status: "ACTIVE",
        branchAssignments: [
          {
            branch: {
              id: "branch_1",
              name: "Accra Mall",
              slug: "accra-mall",
              latitude: 5.6219,
              longitude: -0.1742,
              geofenceRadiusMeters: 150,
              geofenceEnabled: true,
              timezone: "Africa/Accra",
            },
          },
        ],
      } as never);

      // Completed shift (actualIn and actualOut populated)
      vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValueOnce({
        id: "day_completed",
        employeeId: "emp_100",
        workDate: new Date("2026-09-10T00:00:00.000Z"),
        branchId: "branch_1",
        actualIn: new Date("2026-09-10T08:00:00.000Z"),
        actualOut: new Date("2026-09-10T16:00:00.000Z"),
        status: "SETTLED",
        flags: [],
      } as never);

      vi.spyOn(prisma.attendanceEvent, "findMany").mockResolvedValueOnce([
        {
          id: "evt_2",
          direction: AttendanceDirection.OUT,
          occurredAt: new Date("2026-09-10T16:00:00.000Z"),
          branchId: "branch_1",
        },
      ] as never);
      vi.spyOn(prisma.attendanceCorrection, "findMany").mockResolvedValueOnce([] as never);
      vi.spyOn(prisma.shift, "findMany").mockResolvedValueOnce([]);
      vi.spyOn(prisma.employeeShiftAssignment, "findMany").mockResolvedValueOnce([]);
      vi.spyOn(prisma.scheduleException, "findMany").mockResolvedValueOnce([]);
      vi.spyOn(prisma.branch, "findMany").mockResolvedValueOnce([{ id: "branch_1", name: "Accra Mall" }] as never);
      vi.spyOn(prisma.leaveRequest, "findMany").mockResolvedValueOnce([] as never);

      const req = new NextRequest("http://localhost:3000/api/v1/attendance/status", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getStatus(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.currentStatus).toBe("COMPLETED");
      expect(data.dutyStatus).toBe("COMPLETED");
      expect(data.canClockIn).toBe(false);
      expect(data.canClockOut).toBe(false);
      expect(data.clockInDisabledReason).toBe("SHIFT_COMPLETED");
      expect(data.clockInDisabledMessage).toContain("Shift completed for today");
    });

    it("returns canClockIn false with NO_SHIFT_SCHEDULED when employee has no scheduled shift", async () => {
      vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
        id: "emp_100",
        firstName: "Kwame",
        lastName: "Mensah",
        employeeCode: "EMP-100",
        status: "ACTIVE",
        branchAssignments: [
          {
            branch: {
              id: "branch_1",
              name: "Accra Mall",
              slug: "accra-mall",
              latitude: 5.6219,
              longitude: -0.1742,
              geofenceRadiusMeters: 150,
              geofenceEnabled: true,
              timezone: "Africa/Accra",
            },
          },
        ],
      } as never);

      vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValueOnce(null);
      vi.spyOn(prisma.attendanceEvent, "findMany").mockResolvedValueOnce([] as never);
      vi.spyOn(prisma.attendanceCorrection, "findMany").mockResolvedValueOnce([] as never);
      vi.spyOn(prisma.shift, "findMany").mockResolvedValueOnce([]);
      vi.spyOn(prisma.employeeShiftAssignment, "findMany").mockResolvedValueOnce([]);
      vi.spyOn(prisma.scheduleException, "findMany").mockResolvedValueOnce([]);
      vi.spyOn(prisma.branch, "findMany").mockResolvedValueOnce([]);
      vi.spyOn(prisma.leaveRequest, "findMany").mockResolvedValueOnce([] as never);

      const req = new NextRequest("http://localhost:3000/api/v1/attendance/status", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getStatus(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.currentStatus).toBe("CLOCKED_OUT");
      expect(data.canClockIn).toBe(false);
      expect(data.canClockOut).toBe(false);
      expect(data.clockInDisabledReason).toBe("NO_SHIFT_SCHEDULED");
      expect(data.clockInDisabledMessage).toContain("No shift scheduled for you today");
    });
  });

  describe("GET /api/v1/attendance/history", () => {
    it("returns 401 when token is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/attendance/history");
      const res = await getHistory(req);
      expect(res.status).toBe(401);
    });

    it("returns 200 with chronological history and calculated summary", async () => {
      const mockDays = [
        {
          id: "day_1",
          workDate: new Date("2026-09-09T00:00:00.000Z"),
          branchId: "branch_1",
          shiftIdSnapshot: "shift_m",
          scheduledStart: new Date("2026-09-09T08:00:00.000Z"),
          scheduledEnd: new Date("2026-09-09T16:00:00.000Z"),
          scheduledMinutes: 480,
          actualIn: new Date("2026-09-09T08:00:00.000Z"),
          actualOut: new Date("2026-09-09T17:00:00.000Z"),
          grossMinutes: 540,
          netWorkedMinutes: 540,
          regularMinutes: 480,
          overtimeMinutes: 60,
          payableOvertimeMinutes: 60,
          lateMinutes: 0,
          earlyDepartureMinutes: 0,
          status: "SETTLED",
          flags: [],
        },
        {
          id: "day_2",
          workDate: new Date("2026-09-08T00:00:00.000Z"),
          branchId: "branch_1",
          shiftIdSnapshot: "shift_m",
          scheduledStart: new Date("2026-09-08T08:00:00.000Z"),
          scheduledEnd: new Date("2026-09-08T16:00:00.000Z"),
          scheduledMinutes: 480,
          actualIn: new Date("2026-09-08T08:15:00.000Z"),
          actualOut: new Date("2026-09-08T16:00:00.000Z"),
          grossMinutes: 465,
          netWorkedMinutes: 465,
          regularMinutes: 465,
          overtimeMinutes: 0,
          payableOvertimeMinutes: 0,
          lateMinutes: 15,
          earlyDepartureMinutes: 0,
          status: "SETTLED",
          flags: ["LATE_ARRIVAL"],
        },
      ];

      vi.spyOn(prisma.attendanceDay, "findMany").mockResolvedValueOnce(mockDays as never);
      vi.spyOn(prisma.branch, "findMany").mockResolvedValueOnce([
        { id: "branch_1", name: "Accra Mall Branch" },
      ] as never);

      const req = new NextRequest("http://localhost:3000/api/v1/attendance/history?limit=7", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getHistory(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.summary.totalDaysWorked).toBe(2);
      expect(data.summary.totalWorkedMinutes).toBe(1005); // 540 + 465
      expect(data.summary.totalOvertimeMinutes).toBe(60);
      expect(data.summary.totalLateMinutes).toBe(15);
      expect(data.days.length).toBe(2);
      expect(data.days[0].workDate).toBe("2026-09-09");
      expect(data.days[0].branchName).toBe("Accra Mall Branch");
      expect(data.days[0].overtimeMinutes).toBe(60);

      expect(data.history).toBeDefined();
      expect(data.history.length).toBe(2);
      expect(data.history[0].date).toBe("2026-09-09");
      expect(data.history[0].inTime).toBeDefined();
      expect(data.history[0].outTime).toBeDefined();
      expect(data.history[0].workedMinutes).toBe(540);
    });
  });
});
