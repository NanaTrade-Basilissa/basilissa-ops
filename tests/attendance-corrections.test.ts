import { describe, expect, it } from "vitest";
import { CorrectionOperation, CorrectionReason } from "@prisma/client";
import {
  MATERIAL_AGE_DAYS,
  MATERIAL_MINUTES,
  checkCorrection,
  materialityReasons,
  voidedEventIds,
  type CorrectionContext,
} from "@/lib/modules/attendance/corrections";

/**
 * A correction changes what attendance MEANS, never what was recorded. These
 * rules decide who may make one and when someone else has to agree.
 */

const NOW = new Date("2026-03-10T12:00:00Z");

function context(overrides: Partial<CorrectionContext> = {}): CorrectionContext {
  return {
    operation: CorrectionOperation.ADJUST_TIME,
    actorUserId: "user_manager",
    actorEmployeeId: "emp_manager",
    targetEmployeeId: "emp_other",
    reasonCode: CorrectionReason.DEVICE_CLOCK_WRONG,
    reasonText: "Terminal clock had drifted 45 minutes",
    minutesDelta: -45,
    createsOvertime: false,
    workDate: new Date("2026-03-09T00:00:00Z"),
    now: NOW,
    ...overrides,
  };
}

describe("self-correction", () => {
  // The same fraud as manual self-entry wearing a different name.
  it("refuses a manager correcting their own attendance", () => {
    const result = checkCorrection(context({ targetEmployeeId: "emp_manager" }));
    expect(result.allowed === false && result.reason).toBe("SELF_CORRECTION_FORBIDDEN");
  });

  it("allows correcting someone else", () => {
    expect(checkCorrection(context()).allowed).toBe(true);
  });

  it("does not trip when the actor has no employee record", () => {
    expect(checkCorrection(context({ actorEmployeeId: null })).allowed).toBe(true);
  });
});

describe("reasons", () => {
  it("requires an explanation", () => {
    const result = checkCorrection(context({ reasonText: "" }));
    expect(result.allowed === false && result.reason).toBe("REASON_TEXT_REQUIRED");
  });

  // A code alone cannot answer "why this one".
  it("demands a fuller explanation for OTHER", () => {
    const short = checkCorrection(
      context({ reasonCode: CorrectionReason.OTHER, reasonText: "fixed" }),
    );
    expect(short.allowed === false && short.reason).toBe("REASON_TEXT_REQUIRED");

    const proper = checkCorrection(
      context({
        reasonCode: CorrectionReason.OTHER,
        reasonText: "Employee covered a shift recorded under the wrong branch",
      }),
    );
    expect(proper.allowed).toBe(true);
  });
});

/**
 * Requiring sign-off for every small fix only trains people to rubber-stamp,
 * which destroys the control. It is reserved for changes big enough, or old
 * enough, to be worth a second pair of eyes.
 */
describe("materiality", () => {
  it("treats a small, recent fix as ordinary housekeeping", () => {
    const result = checkCorrection(context({ minutesDelta: -10 }));
    expect(result.allowed && result.requiresApproval).toBe(false);
  });

  it("requires approval for a large change in either direction", () => {
    for (const delta of [MATERIAL_MINUTES + 1, -(MATERIAL_MINUTES + 1)]) {
      const result = checkCorrection(context({ minutesDelta: delta }));
      expect(result.allowed && result.requiresApproval).toBe(true);
    }
  });

  it("requires approval whenever payable overtime is created, however small", () => {
    const result = checkCorrection(context({ minutesDelta: 5, createsOvertime: true }));
    expect(result.allowed && result.requiresApproval).toBe(true);
    expect(result.allowed && result.reasons).toContain("creates payable overtime");
  });

  it("requires approval for a correction reaching into a reported period", () => {
    const result = checkCorrection(
      context({
        minutesDelta: 5,
        workDate: new Date(NOW.getTime() - (MATERIAL_AGE_DAYS + 2) * 86_400_000),
      }),
    );
    expect(result.allowed && result.requiresApproval).toBe(true);
  });

  // The reasons are shown to the approver, so they can see what they are
  // agreeing to rather than just that agreement is needed.
  it("names every reason it is material", () => {
    const reasons = materialityReasons(
      context({
        minutesDelta: 90,
        createsOvertime: true,
        workDate: new Date(NOW.getTime() - 30 * 86_400_000),
      }),
    );
    expect(reasons).toHaveLength(3);
    expect(reasons.some((r) => r.includes("90 minutes"))).toBe(true);
    expect(reasons).toContain("creates payable overtime");
  });

  it("lists nothing for an immaterial correction", () => {
    expect(materialityReasons(context({ minutesDelta: 5 }))).toEqual([]);
  });
});

describe("which events stop counting", () => {
  it("removes an explicitly voided event", () => {
    const voided = voidedEventIds([
      { operation: CorrectionOperation.VOID_EVENT, targetEventId: "e1" },
    ]);
    expect(voided.has("e1")).toBe(true);
  });

  // Adjusting replaces rather than edits, so the original must stop counting
  // the moment its replacement exists — otherwise the day counts both.
  it("removes the original when a time is adjusted", () => {
    const voided = voidedEventIds([
      { operation: CorrectionOperation.ADJUST_TIME, targetEventId: "e1" },
    ]);
    expect(voided.has("e1")).toBe(true);
  });

  it("removes the original when a branch is reassigned", () => {
    const voided = voidedEventIds([
      { operation: CorrectionOperation.REASSIGN_BRANCH, targetEventId: "e1" },
    ]);
    expect(voided.has("e1")).toBe(true);
  });

  it("removes nothing for an inserted event", () => {
    const voided = voidedEventIds([
      { operation: CorrectionOperation.INSERT_EVENT, targetEventId: null },
    ]);
    expect(voided.size).toBe(0);
  });

  it("accumulates across several corrections", () => {
    const voided = voidedEventIds([
      { operation: CorrectionOperation.VOID_EVENT, targetEventId: "e1" },
      { operation: CorrectionOperation.ADJUST_TIME, targetEventId: "e2" },
      { operation: CorrectionOperation.INSERT_EVENT, targetEventId: null },
    ]);
    expect([...voided].sort()).toEqual(["e1", "e2"]);
  });
});
