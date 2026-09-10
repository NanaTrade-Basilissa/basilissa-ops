import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  getDateRangeKeys,
  submitLeaveRequest,
  reviewLeaveRequest,
} from "@/lib/modules/attendance/server";
import { reviewLeaveRequestAction } from "@/lib/modules/attendance/actions";
import {
  POST as submitLeaveRoute,
  GET as getLeaveRoute,
} from "@/lib/../app/api/v1/attendance/leave-requests/route";
import { createDeviceToken } from "@/lib/modules/attendance/server";
import { prisma } from "@/lib/platform/prisma";
import * as pushModule from "@/lib/platform/push";
import * as identityModule from "@/lib/modules/identity/server";
import { LeaveStatus, LeaveType, ScheduleExceptionType, UserStatus } from "@prisma/client";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Employee Leave Requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validToken = createDeviceToken({
    employeeId: "emp_100",
    deviceId: "device_phone_1",
    phone: "+233241234567",
  });

  describe("getDateRangeKeys", () => {
    it("expands single day correctly", () => {
      const dates = getDateRangeKeys("2026-09-15", "2026-09-15");
      expect(dates).toEqual(["2026-09-15"]);
    });

    it("expands multi-day range inclusive", () => {
      const dates = getDateRangeKeys("2026-09-15", "2026-09-18");
      expect(dates).toEqual(["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
    });

    it("throws if start date is after end date", () => {
      expect(() => getDateRangeKeys("2026-09-20", "2026-09-15")).toThrow();
    });
  });

  describe("submitLeaveRequest", () => {
    it("creates a pending leave request with primary branch fallback", async () => {
      vi.spyOn(prisma.employeeBranchAssignment, "findFirst").mockResolvedValueOnce({
        branchId: "branch_primary",
      } as never);

      const createSpy = vi.spyOn(prisma.leaveRequest, "create").mockResolvedValueOnce({
        id: "leave_1",
        employeeId: "emp_100",
        branchId: "branch_primary",
        type: LeaveType.ANNUAL,
        startDate: new Date("2026-09-15T00:00:00.000Z"),
        endDate: new Date("2026-09-18T00:00:00.000Z"),
        reason: "Family trip",
        status: LeaveStatus.PENDING,
        createdAt: new Date(),
        employee: { id: "emp_100", firstName: "Kwame", lastName: "Mensah", employeeCode: "EMP-100" },
        branch: { id: "branch_primary", name: "Accra Mall" },
      } as never);

      const res = await submitLeaveRequest({
        employeeId: "emp_100",
        type: LeaveType.ANNUAL,
        startDate: "2026-09-15",
        endDate: "2026-09-18",
        reason: "Family trip",
      });

      expect(res.id).toBe("leave_1");
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: "emp_100",
            branchId: "branch_primary",
            status: LeaveStatus.PENDING,
          }),
        }),
      );
    });

    it("fails when reason is empty", async () => {
      await expect(
        submitLeaveRequest({
          employeeId: "emp_100",
          type: LeaveType.SICK,
          startDate: "2026-09-15",
          endDate: "2026-09-16",
          reason: "   ",
        }),
      ).rejects.toThrow("reason for leave is required");
    });
  });

  describe("reviewLeaveRequest", () => {
    it("approves leave request, creates DAY_OFF exceptions in transaction, and sends push notification", async () => {
      vi.spyOn(prisma.leaveRequest, "findUnique").mockResolvedValueOnce({
        id: "leave_1",
        employeeId: "emp_100",
        status: LeaveStatus.PENDING,
        type: LeaveType.ANNUAL,
        startDate: new Date("2026-09-15T00:00:00.000Z"),
        endDate: new Date("2026-09-16T00:00:00.000Z"),
        reason: "Vacation",
        employee: { id: "emp_100", firstName: "Kwame", lastName: "Mensah" },
        branch: { id: "branch_1", name: "Accra Mall" },
      } as never);

      const txUpdateSpy = vi.fn().mockResolvedValue({});
      const txUpsertSpy = vi.fn().mockResolvedValue({});

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: unknown) => {
        return (cb as (tx: unknown) => Promise<unknown>)({
          leaveRequest: { update: txUpdateSpy },
          scheduleException: { upsert: txUpsertSpy },
        });
      });

      const pushSpy = vi.spyOn(pushModule, "sendEmployeePushNotification").mockResolvedValueOnce({
        dispatched: 1,
        receipts: [],
      });

      const result = await reviewLeaveRequest({
        leaveRequestId: "leave_1",
        reviewerUserId: "user_manager_1",
        decision: "APPROVED",
        managerNotes: "Approved, enjoy!",
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe(LeaveStatus.APPROVED);

      // 2 dates: Sep 15 and Sep 16
      expect(txUpsertSpy).toHaveBeenCalledTimes(2);
      expect(txUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            type: ScheduleExceptionType.DAY_OFF,
            employeeId: "emp_100",
          }),
        }),
      );

      expect(pushSpy).toHaveBeenCalledWith(
        "emp_100",
        expect.objectContaining({
          title: "Leave Request Approved",
        }),
      );
    });

    it("rejects leave request and sends push notification with notes", async () => {
      vi.spyOn(prisma.leaveRequest, "findUnique").mockResolvedValueOnce({
        id: "leave_2",
        employeeId: "emp_100",
        status: LeaveStatus.PENDING,
        type: LeaveType.CASUAL,
        startDate: new Date("2026-09-15T00:00:00.000Z"),
        endDate: new Date("2026-09-15T00:00:00.000Z"),
        reason: "Personal",
        employee: { id: "emp_100", firstName: "Kwame", lastName: "Mensah" },
      } as never);

      vi.spyOn(prisma.leaveRequest, "update").mockResolvedValueOnce({} as never);
      const pushSpy = vi.spyOn(pushModule, "sendEmployeePushNotification").mockResolvedValueOnce({
        dispatched: 1,
        receipts: [],
      });

      const result = await reviewLeaveRequest({
        leaveRequestId: "leave_2",
        reviewerUserId: "user_manager_1",
        decision: "REJECTED",
        managerNotes: "Staff shortage on that day.",
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe(LeaveStatus.REJECTED);
      expect(pushSpy).toHaveBeenCalledWith(
        "emp_100",
        expect.objectContaining({
          title: "Leave Request Declined",
          body: expect.stringContaining("Staff shortage"),
        }),
      );
    });
  });

  describe("API Endpoints (/api/v1/attendance/leave-requests)", () => {
    it("returns 401 when device token is missing on POST", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/attendance/leave-requests", {
        method: "POST",
        body: JSON.stringify({
          type: "ANNUAL",
          startDate: "2026-09-15",
          endDate: "2026-09-16",
          reason: "Vacation",
        }),
      });

      const res = await submitLeaveRoute(req);
      expect(res.status).toBe(401);
    });

    it("returns 201 on valid submission with device token", async () => {
      vi.spyOn(prisma.employeeBranchAssignment, "findFirst").mockResolvedValueOnce({
        branchId: "branch_1",
      } as never);

      vi.spyOn(prisma.leaveRequest, "create").mockResolvedValueOnce({
        id: "leave_created",
        employeeId: "emp_100",
        branchId: "branch_1",
        type: LeaveType.ANNUAL,
        startDate: new Date("2026-09-15T00:00:00.000Z"),
        endDate: new Date("2026-09-16T00:00:00.000Z"),
        reason: "Vacation",
        status: LeaveStatus.PENDING,
        createdAt: new Date(),
        branch: { name: "Accra Mall" },
      } as never);

      const req = new NextRequest("http://localhost:3000/api/v1/attendance/leave-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}` },
        body: JSON.stringify({
          type: "ANNUAL",
          startDate: "2026-09-15",
          endDate: "2026-09-16",
          reason: "Vacation",
        }),
      });

      const res = await submitLeaveRoute(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.leaveRequest.id).toBe("leave_created");
      expect(data.leaveRequest.status).toBe("PENDING");
    });

    it("returns 200 with list of requests on GET", async () => {
      vi.spyOn(prisma.leaveRequest, "findMany").mockResolvedValueOnce([
        {
          id: "leave_1",
          type: LeaveType.ANNUAL,
          startDate: new Date("2026-09-15T00:00:00.000Z"),
          endDate: new Date("2026-09-16T00:00:00.000Z"),
          reason: "Vacation",
          status: LeaveStatus.APPROVED,
          branch: { id: "branch_1", name: "Accra Mall" },
          reviewer: { id: "u_1", name: "Manager" },
          reviewedAt: new Date(),
          managerNotes: "Approved",
          createdAt: new Date(),
        },
      ] as never);

      vi.spyOn(prisma.leaveRequest, "count").mockResolvedValueOnce(1);

      const req = new NextRequest("http://localhost:3000/api/v1/attendance/leave-requests", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getLeaveRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.total).toBe(1);
      expect(data.leaveRequests[0].id).toBe("leave_1");
    });
  });

  describe("reviewLeaveRequestAction", () => {
    it("successfully reviews leave request as an authorized manager", async () => {
      vi.spyOn(identityModule, "requirePermission").mockResolvedValueOnce({
        userId: "manager_1",
        name: "Branch Manager",
        email: "manager@basilissa.com",
        status: UserStatus.ACTIVE,
        assignments: [],
      } as never);

      vi.spyOn(prisma.leaveRequest, "findUnique")
        .mockResolvedValueOnce({
          id: "leave_1",
          branchId: "branch_1",
          employeeId: "emp_100",
        } as never)
        .mockResolvedValueOnce({
          id: "leave_1",
          employeeId: "emp_100",
          status: LeaveStatus.PENDING,
          type: LeaveType.ANNUAL,
          startDate: new Date("2026-09-15T00:00:00.000Z"),
          endDate: new Date("2026-09-16T00:00:00.000Z"),
          reason: "Vacation",
          employee: { id: "emp_100", firstName: "Kwame", lastName: "Mensah" },
          branch: { id: "branch_1", name: "Accra Mall" },
        } as never);

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: unknown) => {
        return (cb as (tx: unknown) => Promise<unknown>)({
          leaveRequest: { update: vi.fn().mockResolvedValue({}) },
          scheduleException: { upsert: vi.fn().mockResolvedValue({}) },
        });
      });

      vi.spyOn(pushModule, "sendEmployeePushNotification").mockResolvedValueOnce({
        dispatched: 1,
        receipts: [],
      });

      const result = await reviewLeaveRequestAction("leave_1", "APPROVED", "Enjoy your time off!");
      expect(result.ok).toBe(true);
      expect(result.message).toContain("approved");
    });
  });
});
