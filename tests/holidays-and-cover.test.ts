import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleExceptionType, UserStatus } from "@prisma/client";
import {
  anchorWorkDate,
  punchFallsInCoverShift,
  resolveScheduleForDate,
  type ScheduleInputs,
  type ShiftTemplate,
} from "@/lib/modules/attendance/schedule";
import { ghanaCalendarHolidays } from "@/lib/modules/attendance/server";
import { assignCoverShiftAction } from "@/lib/modules/attendance/actions";
import { prisma } from "@/lib/platform/prisma";
import * as identityModule from "@/lib/modules/identity/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * Holidays stop office hours and nothing else. The Sep 21 example drove the
 * design: Head Office was off, branches traded as usual, and HR staff worked at
 * branches they are not assigned to.
 */

const TZ = "Africa/Accra";
const ALL_WEEK = [1, 2, 3, 4, 5, 6, 7];
const FROM = new Date("2026-01-01T00:00:00Z");
const HOLIDAY = "2026-09-21"; // Monday

const OFFICE: ShiftTemplate = {
  id: "office",
  name: "Day (08:00-17:00)",
  startMinute: 8 * 60,
  endMinute: 17 * 60,
  unpaidBreakMinutes: 60,
  offOnPublicHolidays: true,
};

const MORNING: ShiftTemplate = {
  id: "morning",
  name: "Morning (07:00-15:00)",
  startMinute: 7 * 60,
  endMinute: 15 * 60,
  unpaidBreakMinutes: 0,
  offOnPublicHolidays: false,
};

const NIGHT: ShiftTemplate = {
  id: "night",
  name: "Night",
  startMinute: 22 * 60,
  endMinute: 6 * 60,
  unpaidBreakMinutes: 0,
  offOnPublicHolidays: false,
};

function inputs(shiftId: string, overrides: Partial<ScheduleInputs> = {}): ScheduleInputs {
  return {
    timeZone: TZ,
    shifts: [OFFICE, MORNING, NIGHT],
    assignments: [{ shiftId, daysOfWeek: ALL_WEEK, validFrom: FROM, validTo: null }],
    exceptions: [],
    holidays: new Set([HOLIDAY]),
    patterns: [],
    ...overrides,
  };
}

describe("public holidays in schedule resolution", () => {
  it("takes office hours off on a holiday", () => {
    expect(resolveScheduleForDate(HOLIDAY, inputs("office"))).toBeNull();
  });

  it("leaves office hours alone on the days around it", () => {
    expect(resolveScheduleForDate("2026-09-22", inputs("office"))?.shiftId).toBe("office");
    expect(resolveScheduleForDate("2026-09-18", inputs("office"))?.shiftId).toBe("office");
  });

  it("keeps a branch shift running on a holiday", () => {
    expect(resolveScheduleForDate(HOLIDAY, inputs("morning"))?.shiftId).toBe("morning");
  });

  it("applies a one-day override on a holiday, even one naming office hours", () => {
    const rostered = inputs("office", {
      exceptions: [{ dateKey: HOLIDAY, type: ScheduleExceptionType.EXTRA_SHIFT, shiftId: "office" }],
    });
    expect(resolveScheduleForDate(HOLIDAY, rostered)?.source).toBe("exception");
  });

  it("reports the branch of a cover shift", () => {
    const cover = inputs("office", {
      exceptions: [
        { dateKey: HOLIDAY, type: ScheduleExceptionType.EXTRA_SHIFT, shiftId: "morning", branchId: "west-hills" },
      ],
    });
    const resolved = resolveScheduleForDate(HOLIDAY, cover);
    expect(resolved?.shiftId).toBe("morning");
    expect(resolved?.coverBranchId).toBe("west-hills");
  });

  it("still honours a day off on a holiday", () => {
    const off = inputs("morning", {
      exceptions: [{ dateKey: HOLIDAY, type: ScheduleExceptionType.DAY_OFF, shiftId: null }],
    });
    expect(resolveScheduleForDate(HOLIDAY, off)).toBeNull();
  });

  it("anchors a holiday punch from office staff to the calendar date, unscheduled", () => {
    const anchor = anchorWorkDate(new Date(`${HOLIDAY}T09:00:00Z`), inputs("office"));
    expect(anchor.workDateKey).toBe(HOLIDAY);
    expect(anchor.schedule).toBeNull();
  });
});

describe("cover shift window", () => {
  const cover = { dateKey: HOLIDAY, shift: MORNING }; // 07:00-15:00
  const at = (iso: string) => new Date(iso);

  it("accepts a punch during the shift", () => {
    expect(punchFallsInCoverShift(at(`${HOLIDAY}T07:02:00Z`), cover, TZ)).toBe(true);
    expect(punchFallsInCoverShift(at(`${HOLIDAY}T15:10:00Z`), cover, TZ)).toBe(true);
  });

  it("accepts arriving up to four hours early and leaving up to eight hours late", () => {
    expect(punchFallsInCoverShift(at(`${HOLIDAY}T03:00:00Z`), cover, TZ)).toBe(true);
    expect(punchFallsInCoverShift(at(`${HOLIDAY}T23:00:00Z`), cover, TZ)).toBe(true);
  });

  it("refuses punches outside that window", () => {
    expect(punchFallsInCoverShift(at(`${HOLIDAY}T02:59:00Z`), cover, TZ)).toBe(false);
    expect(punchFallsInCoverShift(at(`${HOLIDAY}T23:01:00Z`), cover, TZ)).toBe(false);
    expect(punchFallsInCoverShift(at("2026-09-22T10:00:00Z"), cover, TZ)).toBe(false);
  });

  it("covers an overnight shift's clock-out on the next calendar day", () => {
    const night = { dateKey: HOLIDAY, shift: NIGHT }; // 22:00-06:00
    expect(punchFallsInCoverShift(at("2026-09-22T06:05:00Z"), night, TZ)).toBe(true);
  });
});

describe("Ghana calendar pre-fill", () => {
  const holidays2026 = ghanaCalendarHolidays(2026);
  const byDate = new Map(holidays2026.map((h) => [h.dateKey, h]));

  it("includes the fixed national holidays", () => {
    for (const date of ["2026-01-01", "2026-01-07", "2026-03-06", "2026-05-01", "2026-09-21", "2026-12-25"]) {
      expect(byDate.has(date), date).toBe(true);
    }
  });

  it("leaves out observances such as Easter Sunday", () => {
    expect(byDate.has("2026-04-05")).toBe(false);
    expect(byDate.has("2026-04-03")).toBe(true); // Good Friday
  });

  it("flags Islamic-calendar dates as estimates and nothing else", () => {
    const estimated = holidays2026.filter((h) => h.estimated).map((h) => h.name);
    expect(estimated).toHaveLength(2);
    expect(estimated.join(" ")).toMatch(/Fitr/);
    expect(estimated.join(" ")).toMatch(/Adha/);
  });

  it("keeps weekend substitutes and never repeats a date", () => {
    expect(byDate.has("2026-12-28")).toBe(true);
    expect(byDate.size).toBe(holidays2026.length);
  });
});

describe("assignCoverShiftAction permissions", () => {
  const manager = {
    userId: "manager_west_hills",
    name: "West Hills manager",
    email: "wh@basilissa.invalid",
    status: UserStatus.ACTIVE,
    assignments: [],
  };

  const input = {
    branchId: "west-hills",
    dateKey: HOLIDAY,
    shiftId: "morning",
    employeeIds: ["it_person"],
    reason: "Holiday cover",
    overwrite: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(identityModule, "requirePermission").mockResolvedValue(manager as never);
    vi.spyOn(prisma.shift, "findFirst").mockResolvedValue({ id: "morning" } as never);
    vi.spyOn(prisma.employee, "findMany").mockResolvedValue([
      {
        id: "it_person",
        firstName: "Prince",
        lastName: "Hammond",
        branchAssignments: [{ branchId: "head-office" }],
      },
    ] as never);
  });

  it("needs the receiving branch's permission", async () => {
    await assignCoverShiftAction(input);
    expect(identityModule.requirePermission).toHaveBeenCalledWith("schedule:write", { branchId: "west-hills" });
  });

  it("refuses to take someone from a branch the manager does not schedule", async () => {
    const write = vi.spyOn(prisma, "$transaction");
    // `can` is pure: with no grants, this manager holds nothing at Head Office.
    const result = await assignCoverShiftAction(input);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Prince Hammond");
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses an empty selection before touching anything", async () => {
    const result = await assignCoverShiftAction({ ...input, employeeIds: [] });
    expect(result.ok).toBe(false);
    expect(identityModule.requirePermission).not.toHaveBeenCalled();
  });
});
