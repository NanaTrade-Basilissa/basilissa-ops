import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyWeeklyScheduleAction, bulkAssignShiftAction } from "@/lib/modules/attendance/actions";
import { prisma } from "@/lib/platform/prisma";
import * as identityModule from "@/lib/modules/identity/server";
import { ScheduleExceptionType, UserStatus } from "@prisma/client";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Schedule Copy Week & Bulk Assignment Actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock authorized actor
    vi.spyOn(identityModule, "requirePermission").mockResolvedValue({
      userId: "manager_1",
      name: "Branch Manager",
      email: "manager@basilissa.com",
      status: UserStatus.ACTIVE,
      assignments: [],
    } as never);
  });

  describe("copyWeeklyScheduleAction", () => {
    it("fails when source and target week starts are identical", async () => {
      const res = await copyWeeklyScheduleAction("2026-09-07", "2026-09-07", "branch_1");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("same week");
    });

    it("returns message when no source exceptions exist to copy", async () => {
      vi.spyOn(prisma.employeeBranchAssignment, "findMany").mockResolvedValueOnce([
        { employeeId: "emp_1" },
      ] as never);
      vi.spyOn(prisma.scheduleException, "findMany").mockResolvedValueOnce([]);

      const res = await copyWeeklyScheduleAction("2026-09-07", "2026-09-14", "branch_1");
      expect(res.ok).toBe(true);
      expect(res.copiedCount).toBe(0);
      expect(res.message).toContain("No custom shift overrides found");
    });

    it("copies exceptions from source week to target week with proper date arithmetic", async () => {
      vi.spyOn(prisma.employeeBranchAssignment, "findMany").mockResolvedValueOnce([
        { employeeId: "emp_1" },
      ] as never);

      // Source week has an exception on Tuesday (2026-09-08)
      vi.spyOn(prisma.scheduleException, "findMany").mockResolvedValueOnce([
        {
          id: "ex_1",
          employeeId: "emp_1",
          date: new Date("2026-09-08T00:00:00.000Z"),
          type: ScheduleExceptionType.SHIFT_CHANGE,
          shiftId: "shift_evening",
          reason: "Swapped with Sarah",
        },
      ] as never);

      const upsertSpy = vi.fn().mockResolvedValue({});
      const findUniqueSpy = vi.fn().mockResolvedValue(null);

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        return callback({
          scheduleException: {
            findUnique: findUniqueSpy,
            upsert: upsertSpy,
          },
          auditLog: { create: vi.fn() },
        } as never);
      });

      const res = await copyWeeklyScheduleAction("2026-09-07", "2026-09-14", "branch_1");
      expect(res.ok).toBe(true);
      expect(res.copiedCount).toBe(1);

      // Verify target date was shifted by 7 days to next Tuesday (2026-09-15)
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            employeeId_date: {
              employeeId: "emp_1",
              date: new Date("2026-09-15T00:00:00.000Z"),
            },
          },
          create: expect.objectContaining({
            shiftId: "shift_evening",
            type: ScheduleExceptionType.SHIFT_CHANGE,
          }),
        }),
      );
    });

    it("skips conflicting target days when overwriteExisting is false", async () => {
      vi.spyOn(prisma.employeeBranchAssignment, "findMany").mockResolvedValueOnce([
        { employeeId: "emp_1" },
      ] as never);

      vi.spyOn(prisma.scheduleException, "findMany").mockResolvedValueOnce([
        {
          id: "ex_1",
          employeeId: "emp_1",
          date: new Date("2026-09-08T00:00:00.000Z"),
          type: ScheduleExceptionType.DAY_OFF,
          shiftId: null,
          reason: "Off",
        },
      ] as never);

      const upsertSpy = vi.fn();
      // Target already has an exception
      const findUniqueSpy = vi.fn().mockResolvedValue({ id: "target_existing" });

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        return callback({
          scheduleException: {
            findUnique: findUniqueSpy,
            upsert: upsertSpy,
          },
          auditLog: { create: vi.fn() },
        } as never);
      });

      const res = await copyWeeklyScheduleAction("2026-09-07", "2026-09-14", "branch_1", false);
      expect(res.ok).toBe(true);
      expect(res.copiedCount).toBe(0);
      expect(res.skippedCount).toBe(1);
      expect(upsertSpy).not.toHaveBeenCalled();
    });
  });

  describe("bulkAssignShiftAction", () => {
    it("fails when no employees are selected", async () => {
      const res = await bulkAssignShiftAction({
        employeeIds: [],
        shiftId: "shift_m",
        daysOfWeek: [1, 2, 3],
        validFrom: "2026-09-10",
        branchId: "branch_1",
      });
      expect(res.ok).toBe(false);
      expect(res.error).toContain("at least one employee");
    });

    it("creates shift assignments for multiple selected employees", async () => {
      const createSpy = vi.fn().mockResolvedValue({});

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        return callback({
          employeeShiftAssignment: { create: createSpy },
          auditLog: { create: vi.fn() },
        } as never);
      });

      const res = await bulkAssignShiftAction({
        employeeIds: ["emp_1", "emp_2", "emp_3"],
        shiftId: "shift_m",
        daysOfWeek: [1, 2, 3, 4, 5],
        validFrom: "2026-09-14",
        validTo: "2026-10-31",
        branchId: "branch_1",
      });

      expect(res.ok).toBe(true);
      expect(res.count).toBe(3);
      expect(createSpy).toHaveBeenCalledTimes(3);
    });
  });
});
