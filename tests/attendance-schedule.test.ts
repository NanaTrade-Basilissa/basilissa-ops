import { describe, expect, it } from "vitest";
import { ScheduleExceptionType } from "@prisma/client";
import {
  anchorWorkDate,
  crossesMidnight,
  resolveScheduleForDate,
  scheduledMinutes,
  type ScheduleInputs,
  type ShiftTemplate,
} from "@/lib/modules/attendance/schedule";

/**
 * Overnight shifts are the reason this is a separate, pure module. A 22:00–06:00
 * shift clocking out at 01:00 belongs to the day it *started*; anchoring it to
 * the calendar date would split one night across two work dates, and each half
 * would look like a missing punch.
 */

const TZ = "Africa/Accra"; // UTC+0, so instants read directly in these tests.

const DAY: ShiftTemplate = {
  id: "day",
  name: "Day",
  startMinute: 8 * 60,
  endMinute: 17 * 60,
  unpaidBreakMinutes: 30,
};

const NIGHT: ShiftTemplate = {
  id: "night",
  name: "Night",
  startMinute: 22 * 60,
  endMinute: 6 * 60,
  unpaidBreakMinutes: 0,
};

const EVENING: ShiftTemplate = {
  id: "evening",
  name: "Evening",
  startMinute: 16 * 60,
  endMinute: 23 * 60,
  unpaidBreakMinutes: 0,
};

const ALL_WEEK = [1, 2, 3, 4, 5, 6, 7];
const FROM_2026 = new Date("2026-01-01T00:00:00Z");

function inputs(overrides: Partial<ScheduleInputs> = {}): ScheduleInputs {
  return {
    timeZone: TZ,
    shifts: [DAY, NIGHT, EVENING],
    assignments: [{ shiftId: "day", daysOfWeek: ALL_WEEK, validFrom: FROM_2026, validTo: null }],
    exceptions: [],
    ...overrides,
  };
}

describe("shift arithmetic", () => {
  it("detects a shift that runs past midnight", () => {
    expect(crossesMidnight(DAY)).toBe(false);
    expect(crossesMidnight(NIGHT)).toBe(true);
  });

  it("measures length correctly across midnight", () => {
    expect(scheduledMinutes(DAY)).toBe(9 * 60);
    expect(scheduledMinutes(NIGHT)).toBe(8 * 60);
  });
});

describe("resolving a day's schedule", () => {
  it("uses the assignment for a covered weekday", () => {
    const resolved = resolveScheduleForDate("2026-03-02", inputs());

    expect(resolved?.shiftId).toBe("day");
    expect(resolved?.scheduledStart.toISOString()).toBe("2026-03-02T08:00:00.000Z");
    expect(resolved?.scheduledEnd.toISOString()).toBe("2026-03-02T17:00:00.000Z");
    expect(resolved?.source).toBe("assignment");
  });

  // The end lands on the next calendar date while the work date stays put.
  // That is what keeps a night shift as one day.
  it("ends an overnight shift on the following date, anchored to the start", () => {
    const resolved = resolveScheduleForDate(
      "2026-03-02",
      inputs({
        assignments: [{ shiftId: "night", daysOfWeek: ALL_WEEK, validFrom: FROM_2026, validTo: null }],
      }),
    );

    expect(resolved?.workDateKey).toBe("2026-03-02");
    expect(resolved?.scheduledStart.toISOString()).toBe("2026-03-02T22:00:00.000Z");
    expect(resolved?.scheduledEnd.toISOString()).toBe("2026-03-03T06:00:00.000Z");
    expect(resolved?.crossesMidnight).toBe(true);
  });

  it("returns nothing for a weekday the assignment does not cover", () => {
    // 2026-03-02 is a Monday, so a Tue-Fri assignment does not apply.
    const resolved = resolveScheduleForDate(
      "2026-03-02",
      inputs({
        assignments: [{ shiftId: "day", daysOfWeek: [2, 3, 4, 5], validFrom: FROM_2026, validTo: null }],
      }),
    );
    expect(resolved).toBeNull();
  });

  it("ignores an assignment that had not started or has ended", () => {
    const future = inputs({
      assignments: [
        { shiftId: "day", daysOfWeek: ALL_WEEK, validFrom: new Date("2026-06-01T00:00:00Z"), validTo: null },
      ],
    });
    expect(resolveScheduleForDate("2026-03-02", future)).toBeNull();

    const ended = inputs({
      assignments: [
        { shiftId: "day", daysOfWeek: ALL_WEEK, validFrom: FROM_2026, validTo: new Date("2026-02-01T00:00:00Z") },
      ],
    });
    expect(resolveScheduleForDate("2026-03-02", ended)).toBeNull();
  });

  it("prefers the most recently effective assignment when two overlap", () => {
    const resolved = resolveScheduleForDate(
      "2026-03-02",
      inputs({
        assignments: [
          { shiftId: "day", daysOfWeek: ALL_WEEK, validFrom: FROM_2026, validTo: null },
          {
            shiftId: "evening",
            daysOfWeek: ALL_WEEK,
            validFrom: new Date("2026-02-01T00:00:00Z"),
            validTo: null,
          },
        ],
      }),
    );
    expect(resolved?.shiftId).toBe("evening");
  });
});

describe("exceptions", () => {
  it("lets a shift change override the assignment", () => {
    const resolved = resolveScheduleForDate(
      "2026-03-02",
      inputs({
        exceptions: [
          { dateKey: "2026-03-02", type: ScheduleExceptionType.SHIFT_CHANGE, shiftId: "night" },
        ],
      }),
    );
    expect(resolved?.shiftId).toBe("night");
    expect(resolved?.source).toBe("exception");
  });

  it("unschedules the day for DAY_OFF", () => {
    const resolved = resolveScheduleForDate(
      "2026-03-02",
      inputs({
        exceptions: [{ dateKey: "2026-03-02", type: ScheduleExceptionType.DAY_OFF, shiftId: null }],
      }),
    );
    expect(resolved).toBeNull();
  });

  it("schedules an extra shift on an uncovered day", () => {
    const resolved = resolveScheduleForDate(
      "2026-03-07",
      inputs({
        assignments: [{ shiftId: "day", daysOfWeek: [1, 2, 3, 4, 5], validFrom: FROM_2026, validTo: null }],
        exceptions: [
          { dateKey: "2026-03-07", type: ScheduleExceptionType.EXTRA_SHIFT, shiftId: "evening" },
        ],
      }),
    );
    expect(resolved?.shiftId).toBe("evening");
  });

  it("only applies to its own date", () => {
    const withException = inputs({
      exceptions: [{ dateKey: "2026-03-02", type: ScheduleExceptionType.DAY_OFF, shiftId: null }],
    });
    expect(resolveScheduleForDate("2026-03-03", withException)?.shiftId).toBe("day");
  });

  // Bad data must not silently unschedule someone who is actually at work.
  it("falls through to the assignment when the exception names a missing shift", () => {
    const resolved = resolveScheduleForDate(
      "2026-03-02",
      inputs({
        exceptions: [
          { dateKey: "2026-03-02", type: ScheduleExceptionType.SHIFT_CHANGE, shiftId: "deleted" },
        ],
      }),
    );
    expect(resolved?.shiftId).toBe("day");
    expect(resolved?.source).toBe("assignment");
  });
});

describe("work-date anchoring", () => {
  const nights = inputs({
    assignments: [{ shiftId: "night", daysOfWeek: ALL_WEEK, validFrom: FROM_2026, validTo: null }],
  });

  it("anchors a normal day shift to its own date", () => {
    const anchored = anchorWorkDate(new Date("2026-03-02T08:03:00Z"), inputs());
    expect(anchored.workDateKey).toBe("2026-03-02");
    expect(anchored.schedule?.shiftId).toBe("day");
  });

  /**
   * The one that matters. Clocking out at 01:00 on Tuesday belongs to Monday's
   * night shift. Anchoring it to Tuesday would leave Monday with no clock-out
   * and Tuesday with no clock-in — two broken days instead of one whole night.
   */
  it("anchors an after-midnight clock-out to the day the shift started", () => {
    const anchored = anchorWorkDate(new Date("2026-03-03T01:00:00Z"), nights);
    expect(anchored.workDateKey).toBe("2026-03-02");
  });

  it("anchors the clock-in of the same night to the same work date", () => {
    const anchored = anchorWorkDate(new Date("2026-03-02T21:58:00Z"), nights);
    expect(anchored.workDateKey).toBe("2026-03-02");
  });

  it("keeps both ends of one night on a single work date", () => {
    const clockIn = anchorWorkDate(new Date("2026-03-02T22:00:00Z"), nights);
    const clockOut = anchorWorkDate(new Date("2026-03-03T06:02:00Z"), nights);
    expect(clockIn.workDateKey).toBe(clockOut.workDateKey);
  });

  it("anchors a punch just before midnight to the shift about to start", () => {
    // Shift starts 22:00; arriving at 21:45 on the 2nd is still the 2nd.
    expect(anchorWorkDate(new Date("2026-03-02T21:45:00Z"), nights).workDateKey).toBe("2026-03-02");
  });

  it("chooses the nearer shift when two are within reach", () => {
    // Consecutive nights: 03:00 on the 3rd is close to the 2nd's end and far
    // from the 3rd's start, so it belongs to the 2nd.
    expect(anchorWorkDate(new Date("2026-03-03T03:00:00Z"), nights).workDateKey).toBe("2026-03-02");
  });

  it("falls back to the calendar date when nothing is scheduled", () => {
    const anchored = anchorWorkDate(
      new Date("2026-03-02T11:00:00Z"),
      inputs({ assignments: [] }),
    );
    expect(anchored.workDateKey).toBe("2026-03-02");
    expect(anchored.schedule).toBeNull();
  });

  // A punch six hours after a night shift ended, with nothing else nearby, most
  // plausibly belongs to that shift as a very late clock-out. Anchoring it is
  // correct; my first instinct that it should fall back was wrong.
  it("anchors a late punch to the night that ended, not to nothing", () => {
    expect(anchorWorkDate(new Date("2026-03-02T11:00:00Z"), nights).workDateKey).toBe("2026-03-01");
  });

  it("falls back when no scheduled shift is within reach", () => {
    // Day shift Mon-Fri. Saturday noon is 19 hours after Friday's shift ended
    // and there is nothing on Saturday or Sunday.
    const weekdays = inputs({
      assignments: [{ shiftId: "day", daysOfWeek: [1, 2, 3, 4, 5], validFrom: FROM_2026, validTo: null }],
    });

    const anchored = anchorWorkDate(new Date("2026-03-07T12:00:00Z"), weekdays);
    expect(anchored.schedule).toBeNull();
    expect(anchored.workDateKey).toBe("2026-03-07");
  });

  // Overtime is the case the window has to accommodate: a clock-out hours
  // after the scheduled end still belongs to that shift.
  it("anchors a clock-out deep into overtime to the shift it belongs to", () => {
    const anchored = anchorWorkDate(new Date("2026-03-02T23:30:00Z"), inputs());
    expect(anchored.workDateKey).toBe("2026-03-02");
    expect(anchored.schedule?.shiftId).toBe("day");
  });
});

describe("non-UTC timezones", () => {
  // Africa/Accra happens to be UTC+0, so a bug in the offset handling would be
  // invisible in every other test here.
  it("resolves scheduled times against the branch timezone", () => {
    const lagos = resolveScheduleForDate("2026-03-02", inputs({ timeZone: "Africa/Lagos" }));
    expect(lagos?.scheduledStart.toISOString()).toBe("2026-03-02T07:00:00.000Z");
  });

  it("handles a zone observing daylight saving", () => {
    const winter = resolveScheduleForDate("2026-01-15", inputs({ timeZone: "Europe/London" }));
    const summer = resolveScheduleForDate("2026-07-15", inputs({ timeZone: "Europe/London" }));

    expect(winter?.scheduledStart.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(summer?.scheduledStart.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });
});
