import { describe, expect, it } from "vitest";
import { timesheetWhere, classifyLiveFloorStatus } from "@/lib/modules/attendance/queries";
import type { BranchScope } from "@/lib/modules/identity/authorization";

const ALL: BranchScope = { kind: "all" };
const TWO_BRANCHES: BranchScope = { kind: "branches", branchIds: ["branch_a", "branch_b"] };
const NONE: BranchScope = { kind: "none" };

describe("timesheetWhere scoping and date filtering", () => {
  it("intersects scope and branchId when reader has access to the branch", () => {
    const where = timesheetWhere(TWO_BRANCHES, {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      branchId: "branch_a",
    });

    expect(where).not.toBeNull();
    const andClauses = where!.AND as Record<string, unknown>[];
    expect(andClauses).toContainEqual({ branchId: { in: ["branch_a", "branch_b"] } });
    expect(andClauses).toContainEqual({ branchId: "branch_a" });
    expect(andClauses).toContainEqual({
      workDate: {
        gte: new Date("2026-09-01T00:00:00.000Z"),
        lte: new Date("2026-09-07T00:00:00.000Z"),
      },
    });
  });

  it("returns null when reader tries to access an unauthorized branch outside their scope", () => {
    const where = timesheetWhere(TWO_BRANCHES, {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      branchId: "branch_c",
    });

    expect(where).toBeNull();
  });

  it("returns null for scope with kind 'none'", () => {
    const where = timesheetWhere(NONE, {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
    });

    expect(where).toBeNull();
  });

  it("allows global reader to filter to any branch or all branches", () => {
    const whereBranch = timesheetWhere(ALL, {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      branchId: "branch_xyz",
    });
    expect(whereBranch).not.toBeNull();
    const andClauses = whereBranch!.AND as Record<string, unknown>[];
    expect(andClauses).toContainEqual({});
    expect(andClauses).toContainEqual({ branchId: "branch_xyz" });

    const whereAll = timesheetWhere(ALL, {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
    });
    expect(whereAll).not.toBeNull();
  });

  it("sanitizes reversed start and end dates", () => {
    const where = timesheetWhere(ALL, {
      startDate: "2026-09-30",
      endDate: "2026-09-01",
    });

    expect(where).not.toBeNull();
    const andClauses = where!.AND as Record<string, unknown>[];
    expect(andClauses).toContainEqual({
      workDate: {
        gte: new Date("2026-09-01T00:00:00.000Z"),
        lte: new Date("2026-09-30T00:00:00.000Z"),
      },
    });
  });
});

describe("classifyLiveFloorStatus", () => {
  const baseTime = new Date("2026-09-09T10:00:00.000Z");

  it("classifies employee as ON_DUTY when clocked in without clock-out", () => {
    const actualIn = new Date("2026-09-09T08:00:00.000Z");
    const result = classifyLiveFloorStatus({
      now: baseTime,
      actualIn,
      actualOut: null,
      scheduledStart: new Date("2026-09-09T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-09T16:00:00.000Z"),
    });

    expect(result.status).toBe("ON_DUTY");
    expect(result.onDutyMinutes).toBe(120); // 2 hours = 120 minutes
  });

  it("classifies employee as COMPLETED when both in and out punches exist", () => {
    const actualIn = new Date("2026-09-09T07:00:00.000Z");
    const actualOut = new Date("2026-09-09T15:00:00.000Z");
    const result = classifyLiveFloorStatus({
      now: new Date("2026-09-09T16:00:00.000Z"),
      actualIn,
      actualOut,
      scheduledStart: new Date("2026-09-09T07:00:00.000Z"),
      scheduledEnd: new Date("2026-09-09T15:00:00.000Z"),
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.onDutyMinutes).toBe(0);
  });

  it("classifies employee as SCHEDULED_AWAITING before shift start", () => {
    const result = classifyLiveFloorStatus({
      now: new Date("2026-09-09T07:30:00.000Z"),
      actualIn: null,
      actualOut: null,
      scheduledStart: new Date("2026-09-09T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-09T16:00:00.000Z"),
    });

    expect(result.status).toBe("SCHEDULED_AWAITING");
    expect(result.onDutyMinutes).toBe(0);
  });

  it("classifies employee as SCHEDULED_AWAITING within 15 min grace period", () => {
    const result = classifyLiveFloorStatus({
      now: new Date("2026-09-09T08:10:00.000Z"), // 10 minutes past start
      actualIn: null,
      actualOut: null,
      scheduledStart: new Date("2026-09-09T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-09T16:00:00.000Z"),
    });

    expect(result.status).toBe("SCHEDULED_AWAITING");
  });

  it("classifies employee as SCHEDULED_LATE when >15 mins past start without clocking in", () => {
    const result = classifyLiveFloorStatus({
      now: new Date("2026-09-09T08:20:00.000Z"), // 20 minutes past start
      actualIn: null,
      actualOut: null,
      scheduledStart: new Date("2026-09-09T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-09T16:00:00.000Z"),
    });

    expect(result.status).toBe("SCHEDULED_LATE");
    expect(result.onDutyMinutes).toBe(0);
  });

  it("classifies employee as ABSENT when shift has ended and no punch occurred", () => {
    const result = classifyLiveFloorStatus({
      now: new Date("2026-09-09T17:00:00.000Z"), // 1 hour past scheduled end
      actualIn: null,
      actualOut: null,
      scheduledStart: new Date("2026-09-09T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-09T16:00:00.000Z"),
    });

    expect(result.status).toBe("ABSENT");
  });

  it("classifies employee as OFF_DUTY when not scheduled today and no punches exist", () => {
    const result = classifyLiveFloorStatus({
      now: baseTime,
      actualIn: null,
      actualOut: null,
      scheduledStart: null,
      scheduledEnd: null,
    });

    expect(result.status).toBe("OFF_DUTY");
  });
});
