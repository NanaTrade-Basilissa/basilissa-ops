import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleExceptionType, UserStatus } from "@prisma/client";
import {
  patternDayFor,
  resolveScheduleForDate,
  shortRestDays,
  type PatternLike,
  type ScheduleInputs,
  type ShiftTemplate,
} from "@/lib/modules/attendance/schedule";
import { assignPatternAction, generatePatternWeekAction } from "@/lib/modules/attendance/actions";
import { prisma } from "@/lib/platform/prisma";
import * as identityModule from "@/lib/modules/identity/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * The pattern from the brief: three mornings, three evenings, then two days
 * off. Eight days long, so each week starts at a different point in the cycle,
 * which is what "last week you started on mornings, this week evenings" means.
 */

const TZ = "Africa/Accra";
const M = "morning";
const E = "evening";

const SHIFTS: ShiftTemplate[] = [
  { id: M, name: "Morning", startMinute: 7 * 60, endMinute: 15 * 60, unpaidBreakMinutes: 0, offOnPublicHolidays: false },
  { id: E, name: "Evening", startMinute: 15 * 60, endMinute: 23 * 60, unpaidBreakMinutes: 0, offOnPublicHolidays: false },
  { id: "office", name: "Day", startMinute: 8 * 60, endMinute: 17 * 60, unpaidBreakMinutes: 60, offOnPublicHolidays: true },
];

const CYCLE = [M, M, M, E, E, E, null, null];

const pattern = (overrides: Partial<PatternLike> = {}): PatternLike => ({
  anchorDateKey: "2026-10-05", // Monday
  cycle: CYCLE,
  validFrom: new Date("2026-10-05T00:00:00Z"),
  validTo: null,
  ...overrides,
});

function inputs(overrides: Partial<ScheduleInputs> = {}): ScheduleInputs {
  return {
    timeZone: TZ,
    shifts: SHIFTS,
    // The 8-5 default underneath, every weekday, as production has it.
    assignments: [{ shiftId: "office", daysOfWeek: [1, 2, 3, 4, 5], validFrom: new Date("2026-01-01T00:00:00Z"), validTo: null }],
    exceptions: [],
    holidays: new Set(),
    patterns: [pattern()],
    ...overrides,
  };
}

const week = (startKey: string) =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${startKey}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

const label = (key: string, i = inputs()) => {
  const r = resolveScheduleForDate(key, i);
  return r ? (r.shiftId === M ? "M" : r.shiftId === E ? "E" : r.shiftId) : "-";
};

describe("cycle position", () => {
  it("walks the cycle from the anchor and wraps", () => {
    const days = Array.from({ length: 10 }, (_, i) => {
      const d = new Date("2026-10-05T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      const id = patternDayFor(d.toISOString().slice(0, 10), pattern());
      return id === M ? "M" : id === E ? "E" : "-";
    });
    expect(days.join("")).toBe("MMMEEE--MM");
  });

  it("handles dates before the anchor without going negative", () => {
    expect(patternDayFor("2026-10-04", pattern())).toBeNull(); // last day of the previous cycle
    expect(patternDayFor("2026-09-28", pattern())).toBe(M); // 7 days earlier = day 1
  });
});

describe("patterns in schedule resolution", () => {
  it("rotates week to week with an 8-day cycle", () => {
    expect(week("2026-10-05").map((k) => label(k)).join("")).toBe("MMMEEE-");
    expect(week("2026-10-12").map((k) => label(k)).join("")).toBe("-MMMEEE");
    expect(week("2026-10-19").map((k) => label(k)).join("")).toBe("--MMMEE");
  });

  it("makes a pattern's day off final instead of falling back to 8-5", () => {
    // Monday 12 Oct is an off day in the cycle, and also a weekday the 8-5
    // default covers. The pattern wins.
    expect(resolveScheduleForDate("2026-10-12", inputs())).toBeNull();
  });

  it("falls back to the recurring schedule outside the pattern's dates", () => {
    const ended = inputs({ patterns: [pattern({ validTo: new Date("2026-10-10T00:00:00Z") })] });
    expect(resolveScheduleForDate("2026-10-12", ended)?.shiftId).toBe("office");
    expect(resolveScheduleForDate("2026-10-02", inputs())?.shiftId).toBe("office");
  });

  it("lets a one-day override beat the pattern", () => {
    const swapped = inputs({
      exceptions: [{ dateKey: "2026-10-05", type: ScheduleExceptionType.SHIFT_CHANGE, shiftId: E }],
    });
    expect(resolveScheduleForDate("2026-10-05", swapped)?.shiftId).toBe(E);
    expect(resolveScheduleForDate("2026-10-05", swapped)?.source).toBe("exception");
  });

  it("reports the source as the pattern", () => {
    expect(resolveScheduleForDate("2026-10-05", inputs())?.source).toBe("pattern");
  });

  it("keeps branch shifts running on a public holiday", () => {
    const holiday = inputs({ holidays: new Set(["2026-10-05"]) });
    expect(resolveScheduleForDate("2026-10-05", holiday)?.shiftId).toBe(M);
  });

  it("honours a pattern day on an office-hours template that stops on holidays", () => {
    const office = inputs({
      holidays: new Set(["2026-10-05"]),
      patterns: [pattern({ cycle: ["office", null] })],
    });
    expect(resolveScheduleForDate("2026-10-05", office)).toBeNull();
  });

  it("uses the most recently started pattern when two overlap", () => {
    const later = pattern({ cycle: [E], validFrom: new Date("2026-10-07T00:00:00Z") });
    expect(resolveScheduleForDate("2026-10-08", inputs({ patterns: [pattern(), later] }))?.shiftId).toBe(E);
  });
});

describe("short rest between shifts", () => {
  it("flags an evening followed by a morning", () => {
    expect(shortRestDays([E, M], SHIFTS)).toEqual([{ dayIndex: 1, restMinutes: 8 * 60 }]);
  });

  it("accepts the brief's pattern, which only steps from mornings to evenings", () => {
    expect(shortRestDays(CYCLE, SHIFTS)).toEqual([]);
  });

  it("checks the wrap from the last day back to the first", () => {
    expect(shortRestDays([M, E], SHIFTS)).toEqual([{ dayIndex: 0, restMinutes: 8 * 60 }]);
  });
});

describe("pattern actions", () => {
  const manager = { userId: "m1", name: "M", email: "m@basilissa.invalid", status: UserStatus.ACTIVE, assignments: [] };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(identityModule, "requirePermission").mockResolvedValue(manager as never);
  });

  it("refuses to put someone from another branch on this branch's pattern", async () => {
    vi.spyOn(prisma.branch, "findUnique").mockResolvedValue({ timezone: TZ } as never);
    vi.spyOn(prisma.shiftPattern, "findFirst").mockResolvedValue({ id: "p1" } as never);
    vi.spyOn(prisma.employeeBranchAssignment, "findMany").mockResolvedValue([] as never);
    const write = vi.spyOn(prisma, "$transaction");

    const result = await assignPatternAction({
      branchId: "dawhenya",
      patternId: "p1",
      employeeIds: ["someone_elsewhere"],
      startDateKey: "2026-10-05",
      staggerDays: 1,
    });

    expect(identityModule.requirePermission).toHaveBeenCalledWith("schedule:write", { branchId: "dawhenya" });
    expect(result.ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses to generate a week for a branch on Auto rota", async () => {
    vi.spyOn(prisma.branch, "findUnique").mockResolvedValue({ autoRota: true } as never);
    const result = await generatePatternWeekAction("dawhenya", "2026-10-05", false);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Auto rota/);
  });
});
