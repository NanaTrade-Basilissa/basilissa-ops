import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingExceptions } from "@/lib/modules/attendance/queries";
import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";

describe("listPendingExceptions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const ALL: BranchScope = { kind: "all" };
  const TWO_BRANCHES: BranchScope = { kind: "branches", branchIds: ["branch_1", "branch_2"] };
  const NONE: BranchScope = { kind: "none" };

  const mockDays = [
    {
      id: "day_1",
      employeeId: "emp_1",
      branchId: "branch_1",
      workDate: new Date("2026-09-08T00:00:00.000Z"),
      status: "NEEDS_REVIEW",
      shiftIdSnapshot: "shift_morning",
      scheduledStart: new Date("2026-09-08T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-08T16:00:00.000Z"),
      scheduledMinutes: 480,
      actualIn: new Date("2026-09-08T08:20:00.000Z"),
      actualOut: null,
      netWorkedMinutes: 0,
      overtimeMinutes: 0,
      payableOvertimeMinutes: 0,
      lateMinutes: 20,
      flags: ["MISSING_CLOCK_OUT", "LATE_ARRIVAL"],
    },
    {
      id: "day_2",
      employeeId: "emp_2",
      branchId: "branch_1",
      workDate: new Date("2026-09-08T00:00:00.000Z"),
      status: "NEEDS_REVIEW",
      shiftIdSnapshot: null,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledMinutes: 0,
      actualIn: new Date("2026-09-08T09:00:00.000Z"),
      actualOut: new Date("2026-09-08T19:00:00.000Z"),
      netWorkedMinutes: 600,
      overtimeMinutes: 120,
      payableOvertimeMinutes: 0,
      lateMinutes: 0,
      flags: ["OUTSIDE_GEOFENCE"],
    },
  ];

  const mockEmployees = [
    { id: "emp_1", employeeCode: "EMP-001", firstName: "Kofi", lastName: "Badu" },
    { id: "emp_2", employeeCode: "EMP-002", firstName: "Ama", lastName: "Serwaa" },
  ];

  const mockBranches = [
    { id: "branch_1", name: "Accra Mall Branch" },
  ];

  it("returns empty array immediately when scope is 'none'", async () => {
    const findManySpy = vi.spyOn(prisma.attendanceDay, "findMany");
    const result = await listPendingExceptions(NONE);
    expect(result).toEqual([]);
    expect(findManySpy).not.toHaveBeenCalled();
  });

  it("queries prisma with NEEDS_REVIEW status and maps exceptions correctly", async () => {
    vi.spyOn(prisma.attendanceDay, "findMany").mockResolvedValueOnce(mockDays as never);
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce(mockEmployees as never);
    vi.spyOn(prisma.branch, "findMany").mockResolvedValueOnce(mockBranches as never);

    const result = await listPendingExceptions(ALL);

    expect(result.length).toBe(2);

    // First item
    expect(result[0].employeeName).toBe("Kofi Badu");
    expect(result[0].employeeCode).toBe("EMP-001");
    expect(result[0].branchName).toBe("Accra Mall Branch");
    expect(result[0].workDate).toBe("2026-09-08");
    expect(result[0].shiftName).toBe("Scheduled Shift");
    expect(result[0].flags).toEqual(["MISSING_CLOCK_OUT", "LATE_ARRIVAL"]);
    expect(result[0].lateMinutes).toBe(20);

    // Second item
    expect(result[1].employeeName).toBe("Ama Serwaa");
    expect(result[1].employeeCode).toBe("EMP-002");
    expect(result[1].shiftName).toBe("Unscheduled");
    expect(result[1].overtimeMinutes).toBe(120);
    expect(result[1].flags).toEqual(["OUTSIDE_GEOFENCE"]);
  });

  it("filters results by search term matching employee name or code", async () => {
    vi.spyOn(prisma.attendanceDay, "findMany").mockResolvedValueOnce(mockDays as never);
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce(mockEmployees as never);
    vi.spyOn(prisma.branch, "findMany").mockResolvedValueOnce(mockBranches as never);

    const result = await listPendingExceptions(ALL, { search: "serwaa" });

    expect(result.length).toBe(1);
    expect(result[0].employeeName).toBe("Ama Serwaa");
  });

  it("filters results by employee code in search", async () => {
    vi.spyOn(prisma.attendanceDay, "findMany").mockResolvedValueOnce(mockDays as never);
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce(mockEmployees as never);
    vi.spyOn(prisma.branch, "findMany").mockResolvedValueOnce(mockBranches as never);

    const result = await listPendingExceptions(ALL, { search: "EMP-001" });

    expect(result.length).toBe(1);
    expect(result[0].employeeName).toBe("Kofi Badu");
  });

  it("enforces branch scoping and filters", async () => {
    const findManySpy = vi.spyOn(prisma.attendanceDay, "findMany").mockResolvedValueOnce([] as never);

    await listPendingExceptions(TWO_BRANCHES, {
      branchId: "branch_1",
      flag: "OUTSIDE_GEOFENCE",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { branchId: { in: ["branch_1", "branch_2"] } },
            { status: "NEEDS_REVIEW" },
            { branchId: "branch_1" },
            { flags: { has: "OUTSIDE_GEOFENCE" } },
          ]),
        },
      }),
    );
  });
});
