import { describe, expect, it } from "vitest";
import { ScheduleExceptionType } from "@prisma/client";
import {
  resolveScheduleForDate,
  type ShiftTemplate,
  type ScheduleInputs,
} from "@/lib/modules/attendance/schedule";
import { shiftDateKey } from "@/lib/platform/date";

describe("weekly schedule resolution logic", () => {
  const morningShift: ShiftTemplate = {
    id: "shift_morning",
    name: "Morning",
    startMinute: 420, // 07:00
    endMinute: 900, // 15:00
    unpaidBreakMinutes: 0,
  };

  const eveningShift: ShiftTemplate = {
    id: "shift_evening",
    name: "Evening",
    startMinute: 900, // 15:00
    endMinute: 1380, // 23:00
    unpaidBreakMinutes: 0,
  };

  const shifts = [morningShift, eveningShift];

  it("resolves recurring day-of-week shift assignments across Monday to Sunday", () => {
    const monday = "2026-09-07"; // Monday (ISO weekday 1)
    const inputs: ScheduleInputs = {
      timeZone: "Africa/Accra",
      shifts,
      assignments: [
        {
          shiftId: "shift_morning",
          daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
          validFrom: new Date("2026-09-01T00:00:00Z"),
          validTo: null,
        },
      ],
      exceptions: [],
    };

    // Monday to Friday should be Morning
    for (let i = 0; i < 5; i++) {
      const dateKey = shiftDateKey(monday, i);
      const res = resolveScheduleForDate(dateKey, inputs);
      expect(res).not.toBeNull();
      expect(res?.shiftId).toBe("shift_morning");
      expect(res?.source).toBe("assignment");
    }

    // Saturday and Sunday should be null (Unscheduled / Off)
    const satKey = shiftDateKey(monday, 5);
    const sunKey = shiftDateKey(monday, 6);
    expect(resolveScheduleForDate(satKey, inputs)).toBeNull();
    expect(resolveScheduleForDate(sunKey, inputs)).toBeNull();
  });

  it("overrides recurring schedule with a DAY_OFF exception", () => {
    const monday = "2026-09-07";
    const wednesday = shiftDateKey(monday, 2); // 2026-09-09

    const inputs: ScheduleInputs = {
      timeZone: "Africa/Accra",
      shifts,
      assignments: [
        {
          shiftId: "shift_morning",
          daysOfWeek: [1, 2, 3, 4, 5],
          validFrom: new Date("2026-09-01T00:00:00Z"),
          validTo: null,
        },
      ],
      exceptions: [
        {
          dateKey: wednesday,
          type: ScheduleExceptionType.DAY_OFF,
          shiftId: null,
        },
      ],
    };

    // Wednesday should resolve to null because DAY_OFF wins over assignment
    expect(resolveScheduleForDate(wednesday, inputs)).toBeNull();

    // Tuesday still Morning
    const tuesday = shiftDateKey(monday, 1);
    expect(resolveScheduleForDate(tuesday, inputs)?.shiftId).toBe("shift_morning");
  });

  it("overrides recurring schedule with a SHIFT_CHANGE exception", () => {
    const monday = "2026-09-07";
    const friday = shiftDateKey(monday, 4); // 2026-09-11

    const inputs: ScheduleInputs = {
      timeZone: "Africa/Accra",
      shifts,
      assignments: [
        {
          shiftId: "shift_morning",
          daysOfWeek: [1, 2, 3, 4, 5],
          validFrom: new Date("2026-09-01T00:00:00Z"),
          validTo: null,
        },
      ],
      exceptions: [
        {
          dateKey: friday,
          type: ScheduleExceptionType.SHIFT_CHANGE,
          shiftId: "shift_evening",
        },
      ],
    };

    const res = resolveScheduleForDate(friday, inputs);
    expect(res).not.toBeNull();
    expect(res?.shiftId).toBe("shift_evening");
    expect(res?.source).toBe("exception");
  });

  it("adds an EXTRA_SHIFT on a non-working day", () => {
    const monday = "2026-09-07";
    const saturday = shiftDateKey(monday, 5); // 2026-09-12

    const inputs: ScheduleInputs = {
      timeZone: "Africa/Accra",
      shifts,
      assignments: [
        {
          shiftId: "shift_morning",
          daysOfWeek: [1, 2, 3, 4, 5],
          validFrom: new Date("2026-09-01T00:00:00Z"),
          validTo: null,
        },
      ],
      exceptions: [
        {
          dateKey: saturday,
          type: ScheduleExceptionType.EXTRA_SHIFT,
          shiftId: "shift_evening",
        },
      ],
    };

    const res = resolveScheduleForDate(saturday, inputs);
    expect(res).not.toBeNull();
    expect(res?.shiftId).toBe("shift_evening");
    expect(res?.source).toBe("exception");
  });
});
