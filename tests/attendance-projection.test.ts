import { describe, expect, it } from "vitest";
import {
  AttendanceDirection,
  BreakPolicy,
  IdentityAssurance,
  LocationAssurance,
  ProviderType,
  TimeAssurance,
} from "@prisma/client";
import { PROVIDER_BASELINE } from "@/lib/modules/attendance/assurance";
import { FALLBACK_POLICY, type ResolvedPolicy } from "@/lib/modules/attendance/policy";
import type { ResolvedSchedule } from "@/lib/modules/attendance/schedule";
import { projectDay, type ProjectionEvent } from "@/lib/modules/attendance/projection";

/**
 * The projection is a pure function, which is the property everything else
 * leans on: days are recomputed from immutable events rather than edited, so a
 * calculation bug is fixed by replaying and a correction six months later is
 * tractable. These tests exercise it the way payroll will.
 */

const WORK_DATE = "2026-03-02";
const TZ_UTC = (iso: string) => new Date(`2026-03-02T${iso}:00Z`);
const NEXT_DAY = (iso: string) => new Date(`2026-03-03T${iso}:00Z`);

const DAY_SHIFT: ResolvedSchedule = {
  workDateKey: WORK_DATE,
  shiftId: "day",
  shiftName: "Day",
  scheduledStart: TZ_UTC("08:00"),
  scheduledEnd: TZ_UTC("17:00"),
  unpaidBreakMinutes: 30,
  crossesMidnight: false,
  source: "assignment",
};

const NIGHT_SHIFT: ResolvedSchedule = {
  workDateKey: WORK_DATE,
  shiftId: "night",
  shiftName: "Night",
  scheduledStart: TZ_UTC("22:00"),
  scheduledEnd: NEXT_DAY("06:00"),
  unpaidBreakMinutes: 0,
  crossesMidnight: true,
  source: "assignment",
};

const policy = (overrides: Partial<ResolvedPolicy> = {}): ResolvedPolicy => ({
  ...FALLBACK_POLICY,
  ...overrides,
});

let seq = 0;
function ev(
  direction: AttendanceDirection,
  occurredAt: Date,
  provider: ProviderType = ProviderType.FINGERPRINT,
): ProjectionEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    direction,
    occurredAt,
    providerType: provider,
    assurance: PROVIDER_BASELINE[provider],
  };
}

/** After the shift ended, so days settle rather than sitting PENDING. */
const AFTER = new Date("2026-03-04T00:00:00Z");

describe("a straightforward day", () => {
  it("computes worked time, and settles when nothing is flagged", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("17:00"))],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });

    expect(day.grossMinutes).toBe(540);
    expect(day.netWorkedMinutes).toBe(540);
    expect(day.regularMinutes).toBe(540);
    expect(day.overtimeMinutes).toBe(0);
    expect(day.lateMinutes).toBe(0);
    expect(day.status).toBe("SETTLED");
    expect(day.flags).toEqual([]);
  });

  it("stays PENDING while the shift is still running", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00"))],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: TZ_UTC("12:00"),
    });
    // Mid-shift there is no clock-out yet, which is normal, not a problem.
    expect(day.status).toBe("NEEDS_REVIEW");
    expect(day.flags).toContain("MISSING_CLOCK_OUT");
  });
});

describe("lateness and early departure", () => {
  it("forgives arrival inside the grace period", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:05")), ev(AttendanceDirection.OUT, TZ_UTC("17:00"))],
      schedule: DAY_SHIFT,
      policy: policy({ graceInMinutes: 5 }),
      asOf: AFTER,
    });
    expect(day.lateMinutes).toBe(0);
  });

  it("counts only the minutes beyond the grace period", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:20")), ev(AttendanceDirection.OUT, TZ_UTC("17:00"))],
      schedule: DAY_SHIFT,
      policy: policy({ graceInMinutes: 5 }),
      asOf: AFTER,
    });
    expect(day.lateMinutes).toBe(15);
  });

  it("never reports negative lateness for an early arrival", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("07:30")), ev(AttendanceDirection.OUT, TZ_UTC("17:00"))],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.lateMinutes).toBe(0);
  });

  it("measures early departure past its own grace", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("16:30"))],
      schedule: DAY_SHIFT,
      policy: policy({ graceOutMinutes: 5 }),
      asOf: AFTER,
    });
    expect(day.earlyDepartureMinutes).toBe(25);
  });
});

/**
 * The threshold GATES overtime rather than being deducted from it. Deducting
 * would shave it off every claim forever — the rounding-down problem wearing a
 * different hat. The architecture assessment originally wrote the deducting
 * formula; this is the corrected behaviour.
 */
describe("overtime", () => {
  it("ignores time under the threshold entirely", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("17:08"))],
      schedule: DAY_SHIFT,
      policy: policy({ overtimeThresholdMinutes: 10 }),
      asOf: AFTER,
    });
    expect(day.overtimeMinutes).toBe(0);
  });

  it("counts all of it once the threshold is passed, not the excess over it", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("18:00"))],
      schedule: DAY_SHIFT,
      policy: policy({ overtimeThresholdMinutes: 10 }),
      asOf: AFTER,
    });
    expect(day.overtimeMinutes).toBe(60);
    expect(day.regularMinutes).toBe(540);
  });

  it("computes no overtime at all without a schedule to exceed", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("20:00"))],
      schedule: null,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.overtimeMinutes).toBe(0);
    expect(day.lateMinutes).toBe(0);
    expect(day.regularMinutes).toBe(720);
    expect(day.flags).toContain("UNSCHEDULED");
  });
});

describe("breaks", () => {
  it("subtracts punched breaks", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00")),
        ev(AttendanceDirection.BREAK_START, TZ_UTC("12:00")),
        ev(AttendanceDirection.BREAK_END, TZ_UTC("12:30")),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00")),
      ],
      schedule: DAY_SHIFT,
      policy: policy({ breakPolicy: BreakPolicy.EXPLICIT_PUNCH }),
      asOf: AFTER,
    });
    expect(day.breakMinutes).toBe(30);
    expect(day.netWorkedMinutes).toBe(510);
  });

  it("flags a break that was started but never ended", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00")),
        ev(AttendanceDirection.BREAK_START, TZ_UTC("12:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00")),
      ],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.flags).toContain("UNPAIRED_BREAK");
    expect(day.status).toBe("NEEDS_REVIEW");
  });

  it("auto-deducts once the shift is long enough", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("17:00"))],
      schedule: DAY_SHIFT,
      policy: policy({
        breakPolicy: BreakPolicy.AUTO_DEDUCT,
        autoDeductMinutes: 30,
        autoDeductAfterMinutes: 300,
      }),
      asOf: AFTER,
    });
    expect(day.breakMinutes).toBe(30);
    expect(day.netWorkedMinutes).toBe(510);
  });

  it("does not auto-deduct from a short shift", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("11:00"))],
      schedule: DAY_SHIFT,
      policy: policy({
        breakPolicy: BreakPolicy.AUTO_DEDUCT,
        autoDeductMinutes: 30,
        autoDeductAfterMinutes: 300,
      }),
      asOf: AFTER,
    });
    expect(day.breakMinutes).toBe(0);
  });

  it("ignores punched breaks when the policy auto-deducts", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00")),
        ev(AttendanceDirection.BREAK_START, TZ_UTC("12:00")),
        ev(AttendanceDirection.BREAK_END, TZ_UTC("13:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00")),
      ],
      schedule: DAY_SHIFT,
      policy: policy({ breakPolicy: BreakPolicy.AUTO_DEDUCT, autoDeductMinutes: 30 }),
      asOf: AFTER,
    });
    expect(day.breakMinutes).toBe(30);
  });
});

describe("split shifts", () => {
  // First-in to last-out would pay for the three-hour gap.
  it("sums worked segments rather than measuring end to end", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("12:00")),
        ev(AttendanceDirection.IN, TZ_UTC("15:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("19:00")),
      ],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.grossMinutes).toBe(480);
    expect(day.flags).toContain("MULTIPLE_SEGMENTS");
  });
});

describe("overnight shifts", () => {
  it("computes a night that crosses midnight as one day", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("22:00")),
        ev(AttendanceDirection.OUT, NEXT_DAY("06:00")),
      ],
      schedule: NIGHT_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.scheduledMinutes).toBe(480);
    expect(day.netWorkedMinutes).toBe(480);
    expect(day.overtimeMinutes).toBe(0);
    expect(day.status).toBe("SETTLED");
  });
});

describe("broken days", () => {
  it("flags a missing clock-out and records no worked time for it", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00"))],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.flags).toContain("MISSING_CLOCK_OUT");
    // Crucially zero, not "until now" — auto-awarding time for a missing punch
    // is the primary fraud vector.
    expect(day.netWorkedMinutes).toBe(0);
    expect(day.overtimeMinutes).toBe(0);
    expect(day.status).toBe("NEEDS_REVIEW");
  });

  it("flags a clock-out with no clock-in", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.OUT, TZ_UTC("17:00"))],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.flags).toContain("MISSING_CLOCK_IN");
  });

  it("keeps the first of two clock-ins and flags the day", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00")),
        ev(AttendanceDirection.IN, TZ_UTC("09:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00")),
      ],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.flags).toContain("DUPLICATE_CLOCK_IN");
    expect(day.grossMinutes).toBe(540);
  });

  /**
   * A clock-out recorded before its clock-in — only reachable through a
   * correction or manual entry. Events are walked chronologically, so it sorts
   * ahead of the clock-in and surfaces as both halves missing. No time is
   * credited and the day needs review, which is the right outcome; there is no
   * separate negative-duration case to handle.
   */
  it("credits no time when a clock-out predates its clock-in", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("17:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("08:00")),
      ],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.grossMinutes).toBe(0);
    expect(day.flags).toContain("MISSING_CLOCK_IN");
    expect(day.flags).toContain("MISSING_CLOCK_OUT");
    expect(day.status).toBe("NEEDS_REVIEW");
  });
});

/**
 * An auto-closed shift never earns overtime, even when the arithmetic says
 * otherwise. Nobody recorded leaving, so the end is an assumption — and someone
 * who clocked in early would otherwise be credited overtime purely for
 * forgetting to clock out. Auto-awarding time for a missing punch is the
 * primary fraud vector.
 */
describe("auto-closed shifts", () => {
  it("earns no overtime even when the clock-in was early", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        // In an hour early, closed at the scheduled end: ten hours worked
        // against a nine-hour shift.
        ev(AttendanceDirection.IN, TZ_UTC("07:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00"), ProviderType.SYSTEM_AUTO_CLOSE),
      ],
      schedule: DAY_SHIFT,
      policy: policy({ overtimeThresholdMinutes: 10 }),
      asOf: AFTER,
    });

    expect(day.netWorkedMinutes).toBe(600);
    expect(day.overtimeMinutes).toBe(0);
    expect(day.flags).toContain("AUTO_CLOSED");
    // Still needs a person: the end was assumed, not observed.
    expect(day.status).toBe("NEEDS_REVIEW");
  });

  it("still credits the worked time so the day is not left empty", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00"), ProviderType.SYSTEM_AUTO_CLOSE),
      ],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });

    // The alternative is zero, which would look like they never worked.
    expect(day.netWorkedMinutes).toBe(540);
  });

  it("does not suppress overtime for an ordinary clock-out", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("07:00")),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00")),
      ],
      schedule: DAY_SHIFT,
      policy: policy({ overtimeThresholdMinutes: 10 }),
      asOf: AFTER,
    });
    expect(day.overtimeMinutes).toBe(60);
  });
});

describe("provenance forces review", () => {
  it("flags a day containing a manual entry", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00"), ProviderType.MANAGER_MANUAL),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00"), ProviderType.MANAGER_MANUAL),
      ],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.flags).toContain("MANUAL_ENTRY");
    expect(day.flags).toContain("LOW_IDENTITY_ASSURANCE");
    expect(day.status).toBe("NEEDS_REVIEW");
  });

  it("reports the weakest assurance across a mixed day", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00"), ProviderType.FINGERPRINT),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00"), ProviderType.MANAGER_MANUAL),
      ],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.lowestAssurance?.identity).toBe(IdentityAssurance.NONE);
  });
});

describe("rounding", () => {
  it("does nothing when rounding is off, which is the default", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("17:07"))],
      schedule: DAY_SHIFT,
      policy: policy({ roundingMinutes: 0 }),
      asOf: AFTER,
    });
    expect(day.netWorkedMinutes).toBe(547);
  });

  // Nearest, never down. Rounding down consistently shaves minutes off every
  // shift forever.
  it("rounds to nearest, including upward", () => {
    const up = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("17:08"))],
      schedule: DAY_SHIFT,
      policy: policy({ roundingMinutes: 15 }),
      asOf: AFTER,
    });
    expect(up.netWorkedMinutes).toBe(555);
  });
});

/**
 * The guarantee the whole design rests on. Days are recomputed rather than
 * edited, so the same inputs must always produce byte-identical output —
 * otherwise replaying the event log after a bug fix would silently change
 * figures that were already paid.
 */
describe("determinism", () => {
  it("produces identical output for identical input, regardless of event order", () => {
    const events = [
      ev(AttendanceDirection.IN, TZ_UTC("08:00")),
      ev(AttendanceDirection.BREAK_START, TZ_UTC("12:00")),
      ev(AttendanceDirection.BREAK_END, TZ_UTC("12:30")),
      ev(AttendanceDirection.OUT, TZ_UTC("17:45")),
    ];
    const args = { workDateKey: WORK_DATE, schedule: DAY_SHIFT, policy: policy(), asOf: AFTER };

    const first = projectDay({ ...args, events });
    const shuffled = projectDay({ ...args, events: [...events].reverse() });

    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(first));
  });

  it("snapshots the policy it used, so a later change cannot rewrite the day", () => {
    const used = policy({ overtimeThresholdMinutes: 10, graceInMinutes: 5 });
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:00")), ev(AttendanceDirection.OUT, TZ_UTC("17:00"))],
      schedule: DAY_SHIFT,
      policy: used,
      asOf: AFTER,
    });

    expect(day.policySnapshot.overtimeThresholdMinutes).toBe(10);
    expect(day.policySnapshot.graceInMinutes).toBe(5);
  });

  it("keeps every duration an integer", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [ev(AttendanceDirection.IN, TZ_UTC("08:07")), ev(AttendanceDirection.OUT, TZ_UTC("17:23"))],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });

    for (const value of [
      day.grossMinutes,
      day.netWorkedMinutes,
      day.regularMinutes,
      day.overtimeMinutes,
      day.lateMinutes,
      day.earlyDepartureMinutes,
      day.breakMinutes,
      day.scheduledMinutes,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("assurance-driven review", () => {
  it("does not flag a fully verified day", () => {
    const day = projectDay({
      workDateKey: WORK_DATE,
      events: [
        ev(AttendanceDirection.IN, TZ_UTC("08:00"), ProviderType.MOBILE_APP),
        ev(AttendanceDirection.OUT, TZ_UTC("17:00"), ProviderType.MOBILE_APP),
      ],
      schedule: DAY_SHIFT,
      policy: policy(),
      asOf: AFTER,
    });
    expect(day.flags).not.toContain("LOW_IDENTITY_ASSURANCE");
    expect(day.lowestAssurance).toEqual({
      identity: IdentityAssurance.DEVICE_BOUND,
      location: LocationAssurance.GPS_VERIFIED,
      time: TimeAssurance.SERVER,
    });
  });
});
