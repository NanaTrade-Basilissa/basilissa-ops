import { describe, expect, it } from "vitest";
import {
  AttendanceDirection,
  IdentityAssurance,
  LocationAssurance,
  ProviderType,
  TimeAssurance,
} from "@prisma/client";
import {
  PROVIDER_BASELINE,
  compareAssurance,
  meetsAssurance,
  weakestAxis,
  type AssuranceProfile,
} from "@/lib/modules/attendance/assurance";
import {
  canonicalEvents,
  deriveDirection,
  deriveStatus,
  directionForIncoming,
  resolveDuplicate,
  type EventLike,
} from "@/lib/modules/attendance/events";

const at = (iso: string) => new Date(`2026-03-02T${iso}:00Z`);

function event(overrides: Partial<EventLike> & Pick<EventLike, "id" | "occurredAt">): EventLike {
  return {
    direction: AttendanceDirection.IN,
    supersedesEventId: null,
    supersededByEventId: null,
    ...overrides,
  };
}

describe("assurance ordering", () => {
  // Easy to get backwards, and getting it backwards misdirects investment:
  // the terminal is stronger than the phone on identity and location, and
  // weaker only on time. "Fallback" is the wrong word for it.
  it("ranks a fixed terminal above a phone on identity and location", () => {
    const terminal = PROVIDER_BASELINE[ProviderType.FINGERPRINT];
    const mobile = PROVIDER_BASELINE[ProviderType.MOBILE_APP];

    expect(compareAssurance(terminal, mobile)).toBeGreaterThan(0);
    expect(terminal.location).toBe(LocationAssurance.PHYSICALLY_PRESENT);
  });

  it("ranks a phone above a terminal on time alone", () => {
    expect(PROVIDER_BASELINE[ProviderType.MOBILE_APP].time).toBe(TimeAssurance.SERVER);
    expect(PROVIDER_BASELINE[ProviderType.FINGERPRINT].time).toBe(
      TimeAssurance.DEVICE_UNVERIFIED,
    );
  });

  it("puts manual entry at the bottom of every axis", () => {
    const manual = PROVIDER_BASELINE[ProviderType.MANAGER_MANUAL];
    expect(manual.identity).toBe(IdentityAssurance.NONE);
    expect(manual.location).toBe(LocationAssurance.NONE);

    for (const provider of [ProviderType.FINGERPRINT, ProviderType.MOBILE_APP]) {
      expect(compareAssurance(PROVIDER_BASELINE[provider], manual)).toBeGreaterThan(0);
    }
  });

  // Identity outranks the rest because a wrong person is unrecoverable, while
  // a wrong minute is correctable.
  it("weighs identity ahead of location and time", () => {
    const strongIdentity: AssuranceProfile = {
      identity: IdentityAssurance.BIOMETRIC,
      location: LocationAssurance.NONE,
      time: TimeAssurance.HUMAN_ASSERTED,
    };
    const everythingElse: AssuranceProfile = {
      identity: IdentityAssurance.ASSERTED,
      location: LocationAssurance.PHYSICALLY_PRESENT,
      time: TimeAssurance.SERVER,
    };

    expect(compareAssurance(strongIdentity, everythingElse)).toBeGreaterThan(0);
  });

  it("reports the weakest axis, which is what should drive review", () => {
    expect(weakestAxis(PROVIDER_BASELINE[ProviderType.FINGERPRINT])).toBe("time");
    expect(
      weakestAxis({
        identity: IdentityAssurance.NONE,
        location: LocationAssurance.PHYSICALLY_PRESENT,
        time: TimeAssurance.SERVER,
      }),
    ).toBe("identity");
  });

  // Policy written against levels survives adding a provider; policy written
  // against provider names does not.
  it("checks a bar expressed in levels rather than provider names", () => {
    const bar = { identity: IdentityAssurance.DEVICE_BOUND };

    expect(meetsAssurance(PROVIDER_BASELINE[ProviderType.MOBILE_APP], bar)).toBe(true);
    expect(meetsAssurance(PROVIDER_BASELINE[ProviderType.FINGERPRINT], bar)).toBe(true);
    expect(meetsAssurance(PROVIDER_BASELINE[ProviderType.MANAGER_MANUAL], bar)).toBe(false);
  });
});

describe("derived status", () => {
  it("counts an ordinary event", () => {
    const e = event({ id: "e1", occurredAt: at("08:00") });
    expect(deriveStatus(e, [e])).toBe("CANONICAL");
  });

  it("excludes an event that recorded losing to an existing one", () => {
    const loser = event({ id: "e1", occurredAt: at("08:00"), supersededByEventId: "e2" });
    expect(deriveStatus(loser, [loser])).toBe("SUPERSEDED");
  });

  // The other direction: nothing was written on the older row, because it is
  // immutable. The newer row points back at it.
  it("excludes an event that a later one recorded superseding", () => {
    const older = event({ id: "e1", occurredAt: at("08:00") });
    const newer = event({ id: "e2", occurredAt: at("08:01"), supersedesEventId: "e1" });

    expect(deriveStatus(older, [older, newer])).toBe("SUPERSEDED");
    expect(deriveStatus(newer, [older, newer])).toBe("CANONICAL");
  });

  it("excludes an event voided by a correction", () => {
    const e = event({ id: "e1", occurredAt: at("08:00") });
    expect(deriveStatus(e, [e], new Set(["e1"]))).toBe("VOIDED");
  });

  it("returns only the events that count, in order", () => {
    const all = [
      event({ id: "e3", occurredAt: at("17:00") }),
      event({ id: "e1", occurredAt: at("08:00") }),
      event({ id: "e2", occurredAt: at("08:01"), supersededByEventId: "e1" }),
    ];

    expect(canonicalEvents(all).map((e) => e.id)).toEqual(["e1", "e3"]);
  });
});

describe("direction derivation", () => {
  it("starts a day with a clock-in", () => {
    expect(deriveDirection({ priorEvents: [] }).direction).toBe(AttendanceDirection.IN);
  });

  it("follows IN with OUT", () => {
    const prior = [event({ id: "e1", occurredAt: at("08:00"), direction: AttendanceDirection.IN })];
    expect(deriveDirection({ priorEvents: prior }).direction).toBe(AttendanceDirection.OUT);
  });

  it("closes a break before allowing anything else", () => {
    const prior = [
      event({ id: "e1", occurredAt: at("08:00"), direction: AttendanceDirection.IN }),
      event({ id: "e2", occurredAt: at("12:00"), direction: AttendanceDirection.BREAK_START }),
    ];
    expect(deriveDirection({ priorEvents: prior }).direction).toBe(AttendanceDirection.BREAK_END);
  });

  it("returns to work after a break, then clocks out", () => {
    const prior = [
      event({ id: "e1", occurredAt: at("08:00"), direction: AttendanceDirection.IN }),
      event({ id: "e2", occurredAt: at("12:00"), direction: AttendanceDirection.BREAK_START }),
      event({ id: "e3", occurredAt: at("12:30"), direction: AttendanceDirection.BREAK_END }),
    ];
    expect(deriveDirection({ priorEvents: prior }).direction).toBe(AttendanceDirection.OUT);
  });

  it("allows a second shift on the same day", () => {
    const prior = [
      event({ id: "e1", occurredAt: at("08:00"), direction: AttendanceDirection.IN }),
      event({ id: "e2", occurredAt: at("12:00"), direction: AttendanceDirection.OUT }),
    ];
    expect(deriveDirection({ priorEvents: prior }).direction).toBe(AttendanceDirection.IN);
  });

  it("uses the latest event, not the last one it was handed", () => {
    const prior = [
      event({ id: "e2", occurredAt: at("12:00"), direction: AttendanceDirection.OUT }),
      event({ id: "e1", occurredAt: at("08:00"), direction: AttendanceDirection.IN }),
    ];
    expect(deriveDirection({ priorEvents: prior }).direction).toBe(AttendanceDirection.IN);
  });

  /**
   * The load-bearing one. Terminal in/out buttons are routinely ignored by
   * staff, so a wrong hint must be recorded and overruled — never obeyed.
   */
  it("overrules a wrong provider hint and records the disagreement", () => {
    const prior = [event({ id: "e1", occurredAt: at("08:00"), direction: AttendanceDirection.IN })];

    const result = deriveDirection({ hint: AttendanceDirection.IN, priorEvents: prior });

    expect(result.direction).toBe(AttendanceDirection.OUT);
    expect(result.hintMismatch).toBe(true);
  });

  it("records agreement when the hint was right", () => {
    const result = deriveDirection({ hint: AttendanceDirection.IN, priorEvents: [] });
    expect(result.hintMismatch).toBe(false);
  });
});

describe("cross-provider deduplication", () => {
  const terminal = PROVIDER_BASELINE[ProviderType.FINGERPRINT];
  const mobile = PROVIDER_BASELINE[ProviderType.MOBILE_APP];

  function candidate(id: string, iso: string, assurance: AssuranceProfile) {
    return { ...event({ id, occurredAt: at(iso) }), assurance };
  }

  it("treats a lone event as unique", () => {
    const outcome = resolveDuplicate(
      { direction: AttendanceDirection.IN, occurredAt: at("08:00"), assurance: mobile },
      [],
      5,
    );
    expect(outcome.kind).toBe("unique");
  });

  it("ignores an event outside the window", () => {
    const outcome = resolveDuplicate(
      { direction: AttendanceDirection.IN, occurredAt: at("08:20"), assurance: mobile },
      [candidate("e1", "08:00", terminal)],
      5,
    );
    expect(outcome.kind).toBe("unique");
  });

  it("ignores an event going the other way", () => {
    const outcome = resolveDuplicate(
      { direction: AttendanceDirection.OUT, occurredAt: at("08:01"), assurance: mobile },
      [candidate("e1", "08:00", terminal)],
      5,
    );
    expect(outcome.kind).toBe("unique");
  });

  // Punching the terminal and also opening the app is ordinary behaviour.
  // The terminal wins on identity and location.
  it("lets the higher-assurance record win", () => {
    const outcome = resolveDuplicate(
      { direction: AttendanceDirection.IN, occurredAt: at("08:02"), assurance: mobile },
      [candidate("e1", "08:00", terminal)],
      5,
    );
    expect(outcome).toEqual({ kind: "superseded_by", eventId: "e1" });
  });

  it("lets a stronger incoming event supersede a weaker existing one", () => {
    const manual = PROVIDER_BASELINE[ProviderType.MANAGER_MANUAL];
    const outcome = resolveDuplicate(
      { direction: AttendanceDirection.IN, occurredAt: at("08:02"), assurance: terminal },
      [candidate("e1", "08:00", manual)],
      5,
    );
    expect(outcome).toEqual({ kind: "supersedes", eventId: "e1" });
  });

  it("breaks an assurance tie toward the earlier event", () => {
    const later = resolveDuplicate(
      { direction: AttendanceDirection.IN, occurredAt: at("08:03"), assurance: terminal },
      [candidate("e1", "08:00", terminal)],
      5,
    );
    expect(later).toEqual({ kind: "superseded_by", eventId: "e1" });

    const earlier = resolveDuplicate(
      { direction: AttendanceDirection.IN, occurredAt: at("07:58"), assurance: terminal },
      [candidate("e1", "08:00", terminal)],
      5,
    );
    expect(earlier).toEqual({ kind: "supersedes", eventId: "e1" });
  });

  it("compares against the strongest of several overlapping events", () => {
    const manual = PROVIDER_BASELINE[ProviderType.MANAGER_MANUAL];
    const outcome = resolveDuplicate(
      { direction: AttendanceDirection.IN, occurredAt: at("08:02"), assurance: mobile },
      [candidate("weak", "08:01", manual), candidate("strong", "08:00", terminal)],
      5,
    );
    expect(outcome).toEqual({ kind: "superseded_by", eventId: "strong" });
  });

  it("respects the configured window rather than a fixed one", () => {
    const incoming = {
      direction: AttendanceDirection.IN,
      occurredAt: at("08:09"),
      assurance: mobile,
    };
    const existing = [candidate("e1", "08:00", terminal)];

    expect(resolveDuplicate(incoming, existing, 5).kind).toBe("unique");
    expect(resolveDuplicate(incoming, existing, 15).kind).toBe("superseded_by");
  });
});

/**
 * Regression cover for a bug that mocked tests missed and only an end-to-end
 * run exposed.
 *
 * Direction used to be derived before deduplication. After a clock-out, the
 * state machine says the next event is a clock-in — so a mirrored punch from a
 * second provider was stored as a fresh clock-in, never matched on direction,
 * never deduplicated, and left the day with an unclosed shift and a missing
 * clock-out that never happened.
 */
describe("direction for an incoming event", () => {
  const priorOut = [
    event({ id: "e1", occurredAt: at("17:45"), direction: AttendanceDirection.OUT }),
  ];

  it("inherits the direction of a punch inside the dedup window", () => {
    const result = directionForIncoming(at("17:47"), priorOut, null, 5);
    expect(result.direction).toBe(AttendanceDirection.OUT);
  });

  it("advances the sequence for a punch outside the window", () => {
    const result = directionForIncoming(at("18:30"), priorOut, null, 5);
    expect(result.direction).toBe(AttendanceDirection.IN);
  });

  it("respects the configured window rather than a fixed one", () => {
    expect(directionForIncoming(at("17:52"), priorOut, null, 5).direction).toBe(
      AttendanceDirection.IN,
    );
    expect(directionForIncoming(at("17:52"), priorOut, null, 15).direction).toBe(
      AttendanceDirection.OUT,
    );
  });

  it("starts a day with a clock-in when nothing precedes it", () => {
    expect(directionForIncoming(at("08:00"), [], null, 5).direction).toBe(AttendanceDirection.IN);
  });

  it("still records a hint disagreeing with an inherited direction", () => {
    const result = directionForIncoming(at("17:47"), priorOut, AttendanceDirection.IN, 5);
    expect(result.direction).toBe(AttendanceDirection.OUT);
    expect(result.hintMismatch).toBe(true);
  });

  /**
   * Only reachable once a manager can insert a punch into the middle of a day,
   * which is exactly what the manual-entry UI allows. Reading the latest event
   * overall would follow the 17:00 clock-out and record a second clock-in,
   * leaving the day with an unclosed shift that never existed.
   */
  it("follows the punch before it, not the latest one of the day", () => {
    const prior = [
      event({ id: "e1", occurredAt: at("08:00"), direction: AttendanceDirection.IN }),
      event({ id: "e2", occurredAt: at("17:00"), direction: AttendanceDirection.OUT }),
    ];

    expect(directionForIncoming(at("12:00"), prior, null, 5).direction).toBe(
      AttendanceDirection.OUT,
    );
  });

  it("still starts a day with a clock-in when inserted before everything", () => {
    const prior = [
      event({ id: "e1", occurredAt: at("12:00"), direction: AttendanceDirection.IN }),
    ];
    expect(directionForIncoming(at("08:00"), prior, null, 5).direction).toBe(
      AttendanceDirection.IN,
    );
  });

  it("takes the nearest of several punches inside the window", () => {
    const prior = [
      event({ id: "e1", occurredAt: at("17:40"), direction: AttendanceDirection.IN }),
      event({ id: "e2", occurredAt: at("17:45"), direction: AttendanceDirection.OUT }),
    ];
    expect(directionForIncoming(at("17:46"), prior, null, 10).direction).toBe(
      AttendanceDirection.OUT,
    );
  });
});
