import { describe, expect, it, vi, beforeEach } from "vitest";
import { getAttendanceDay } from "@/lib/modules/attendance/queries";
import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";

describe("getAttendanceDay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const scopeAll: BranchScope = { kind: "all" };
  const scopeBranch1: BranchScope = { kind: "branches", branchIds: ["branch_1"] };
  const scopeBranch2: BranchScope = { kind: "branches", branchIds: ["branch_2"] };

  it("returns null for invalid date format", async () => {
    const result = await getAttendanceDay(scopeAll, "emp_1", "invalid-date");
    expect(result).toBeNull();
  });

  it("returns existing attendance day with isRecorded true", async () => {
    vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValueOnce({
      id: "day_1",
      employeeId: "emp_1",
      branchId: "branch_1",
      workDate: new Date("2026-09-09T00:00:00.000Z"),
      status: "SETTLED",
      shiftIdSnapshot: null,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledMinutes: 480,
      actualIn: new Date("2026-09-09T08:00:00.000Z"),
      actualOut: new Date("2026-09-09T17:00:00.000Z"),
      breakMinutes: 60,
      grossMinutes: 540,
      netWorkedMinutes: 480,
      regularMinutes: 480,
      overtimeMinutes: 0,
      payableOvertimeMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      lowestIdentityAssurance: null,
      lowestLocationAssurance: null,
      lowestTimeAssurance: null,
      flags: [],
      policySnapshot: null,
      settledAt: new Date("2026-09-09T17:00:00.000Z"),
      projectionVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
      id: "emp_1",
      employeeCode: "EMP001",
      firstName: "Kofi",
      lastName: "Mensah",
    } as never);

    vi.spyOn(prisma.branch, "findUnique").mockResolvedValueOnce({
      name: "Osu Main",
    } as never);

    vi.spyOn(prisma.attendanceCorrection, "findMany").mockResolvedValueOnce([]);
    vi.spyOn(prisma.attendanceEvent, "findMany").mockResolvedValueOnce([]);

    const result = await getAttendanceDay(scopeAll, "emp_1", "2026-09-09");
    expect(result).not.toBeNull();
    expect(result?.isRecorded).toBe(true);
    expect(result?.day.id).toBe("day_1");
    expect(result?.employee?.firstName).toBe("Kofi");
    expect(result?.branchName).toBe("Osu Main");
  });

  it("synthesizes an unrecorded day without returning null when employee exists in scope", async () => {
    vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValueOnce(null);

    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
      id: "emp_1",
      employeeCode: "EMP001",
      firstName: "Ama",
      lastName: "Owusu",
      branchAssignments: [
        {
          branchId: "branch_1",
          branch: { id: "branch_1", name: "Airport Residential", timezone: "Africa/Accra" },
        },
      ],
    } as never);

    vi.spyOn(prisma.shift, "findMany").mockResolvedValueOnce([]);
    vi.spyOn(prisma.employeeShiftAssignment, "findMany").mockResolvedValueOnce([]);
    vi.spyOn(prisma.scheduleException, "findMany").mockResolvedValueOnce([]);
    vi.spyOn(prisma.attendanceCorrection, "findMany").mockResolvedValueOnce([]);
    vi.spyOn(prisma.attendanceEvent, "findMany").mockResolvedValueOnce([]);

    const result = await getAttendanceDay(scopeBranch1, "emp_1", "2026-09-09");
    expect(result).not.toBeNull();
    expect(result?.isRecorded).toBe(false);
    expect(result?.day.status).toBe("PENDING");
    expect(result?.day.netWorkedMinutes).toBe(0);
    expect(result?.day.branchId).toBe("branch_1");
    expect(result?.branchName).toBe("Airport Residential");
    expect(result?.employee?.firstName).toBe("Ama");
  });

  it("returns null when employee is out of the reader's branch scope", async () => {
    vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValueOnce(null);

    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
      id: "emp_1",
      employeeCode: "EMP001",
      firstName: "Ama",
      lastName: "Owusu",
      branchAssignments: [
        {
          branchId: "branch_1",
          branch: { id: "branch_1", name: "Airport Residential", timezone: "Africa/Accra" },
        },
      ],
    } as never);

    // scopeBranch2 only has access to branch_2, but employee is in branch_1
    const result = await getAttendanceDay(scopeBranch2, "emp_1", "2026-09-09");
    expect(result).toBeNull();
  });
});
