import { describe, expect, it } from "vitest";
import { BreakPolicy } from "@prisma/client";
import {
  FALLBACK_POLICY,
  POLICY_FIELDS,
  policyChanges,
  resolveFrom,
  type PolicyInput,
  type PolicyRow,
} from "@/lib/modules/attendance/policy";
import { attendancePolicySchema } from "@/lib/modules/attendance/validation";

/**
 * Resolution is pure, so effective-dating can be tested exhaustively from a
 * plain array. That matters: this decides what people are paid, and the
 * failure it guards against — a policy change silently recalculating already
 * settled attendance — is invisible until someone's wages are wrong.
 */

const BASE = {
  graceInMinutes: 5,
  graceOutMinutes: 5,
  overtimeThresholdMinutes: 10,
  breakPolicy: BreakPolicy.EXPLICIT_PUNCH,
  autoDeductMinutes: 30,
  autoDeductAfterMinutes: 300,
  roundingMinutes: 0,
  autoCloseGraceMinutes: 0,
  dedupWindowMinutes: 5,
  maxManualEntryDays: 7,
  isProvisional: true,
};

function row(overrides: Partial<PolicyRow> & Pick<PolicyRow, "id" | "validFrom">): PolicyRow {
  return { branchId: null, validTo: null, ...BASE, ...overrides };
}

const JAN = new Date("2026-01-01T00:00:00Z");
const FEB = new Date("2026-02-01T00:00:00Z");
const MAR = new Date("2026-03-01T00:00:00Z");

describe("fallback", () => {
  it("uses built-in values when no policy exists at all", () => {
    const resolved = resolveFrom([], null, FEB);
    expect(resolved).toEqual(FALLBACK_POLICY);
    expect(resolved.scope).toBe("fallback");
  });

  // A default that looks settled is how nobody ever chooses, and the
  // placeholder becomes company policy by accident.
  it("marks the fallback provisional", () => {
    expect(FALLBACK_POLICY.isProvisional).toBe(true);
  });

  // Rounding is a payroll decision, and rounding consistently downward is wage
  // theft in slow motion. It must never be on unless someone turned it on.
  it("disables rounding by default", () => {
    expect(FALLBACK_POLICY.roundingMinutes).toBe(0);
  });
});

describe("effective dating", () => {
  const rows = [
    row({ id: "p1", validFrom: JAN, validTo: FEB, overtimeThresholdMinutes: 10 }),
    row({ id: "p2", validFrom: FEB, overtimeThresholdMinutes: 30 }),
  ];

  // The whole point. Re-projecting January must use January's rules.
  it("resolves the version that applied at the given instant, not the latest", () => {
    expect(resolveFrom(rows, null, new Date("2026-01-15T00:00:00Z")).overtimeThresholdMinutes).toBe(10);
    expect(resolveFrom(rows, null, new Date("2026-02-15T00:00:00Z")).overtimeThresholdMinutes).toBe(30);
  });

  it("treats validTo as exclusive, so successive versions neither overlap nor gap", () => {
    // FEB is p1's validTo and p2's validFrom: exactly one row governs it.
    expect(resolveFrom(rows, null, FEB).sourcePolicyId).toBe("p2");
  });

  it("includes the instant a version starts", () => {
    expect(resolveFrom(rows, null, JAN).sourcePolicyId).toBe("p1");
  });

  it("falls back for an instant before any version existed", () => {
    expect(resolveFrom(rows, null, new Date("2025-12-31T23:59:59Z")).scope).toBe("fallback");
  });

  it("uses the open-ended version for any time after it starts", () => {
    expect(resolveFrom(rows, null, new Date("2030-01-01T00:00:00Z")).sourcePolicyId).toBe("p2");
  });

  it("picks the most recent when versions overlap, rather than an arbitrary one", () => {
    const overlapping = [
      row({ id: "old", validFrom: JAN }),
      row({ id: "new", validFrom: FEB, graceInMinutes: 15 }),
    ];
    const resolved = resolveFrom(overlapping, null, MAR);
    expect(resolved.sourcePolicyId).toBe("new");
    expect(resolved.graceInMinutes).toBe(15);
  });
});

describe("scope precedence", () => {
  const rows = [
    row({ id: "global", validFrom: JAN, graceInMinutes: 5 }),
    row({ id: "branchA", validFrom: JAN, branchId: "branch_a", graceInMinutes: 20 }),
  ];

  it("prefers a branch policy over the global one", () => {
    const resolved = resolveFrom(rows, "branch_a", FEB);
    expect(resolved.graceInMinutes).toBe(20);
    expect(resolved.scope).toBe("branch");
  });

  it("falls back to global for a branch with no policy of its own", () => {
    const resolved = resolveFrom(rows, "branch_b", FEB);
    expect(resolved.graceInMinutes).toBe(5);
    expect(resolved.scope).toBe("global");
  });

  it("ignores branch policies when resolving the global scope", () => {
    expect(resolveFrom(rows, null, FEB).graceInMinutes).toBe(5);
  });

  // An expired branch override must not strand the branch without any policy.
  it("falls back to global once a branch override has ended", () => {
    const expiring = [
      row({ id: "global", validFrom: JAN, graceInMinutes: 5 }),
      row({ id: "branchA", validFrom: JAN, validTo: FEB, branchId: "branch_a", graceInMinutes: 20 }),
    ];
    const resolved = resolveFrom(expiring, "branch_a", MAR);
    expect(resolved.graceInMinutes).toBe(5);
    expect(resolved.scope).toBe("global");
  });
});

describe("policyChanges", () => {
  const before: PolicyInput = { ...BASE };

  it("reports nothing when nothing moved", () => {
    expect(policyChanges(before, { ...before })).toEqual([]);
  });

  it("names each changed field with both values", () => {
    const changes = policyChanges(before, {
      ...before,
      overtimeThresholdMinutes: 30,
      roundingMinutes: 15,
    });

    expect(changes).toEqual(
      expect.arrayContaining([
        { field: "overtimeThresholdMinutes", before: 10, after: 30 },
        { field: "roundingMinutes", before: 0, after: 15 },
      ]),
    );
    expect(changes).toHaveLength(2);
  });

  // Confirming defaults is a real decision and has to be visible in the audit
  // trail, not silently absorbed.
  it("treats confirming a provisional policy as a change", () => {
    expect(policyChanges(before, { ...before, isProvisional: false })).toEqual([
      { field: "isProvisional", before: true, after: false },
    ]);
  });
});

/**
 * A policy version records who changed it and why. "Who" alone does not answer
 * the question a payroll query actually asks a year later, and a reason is
 * only useful if it cannot be skipped.
 */
describe("change reason", () => {
  const VALID = {
    ...BASE,
    isProvisional: false,
    changeReason: "Overtime threshold raised after the March review",
  };

  it("accepts a real explanation", () => {
    expect(attendancePolicySchema.safeParse(VALID).success).toBe(true);
  });

  it("refuses a blank reason", () => {
    expect(attendancePolicySchema.safeParse({ ...VALID, changeReason: "" }).success).toBe(false);
  });

  // The bar is the one corrections use where there is no reason code to lean
  // on. It stops the reflexive non-answers; it cannot stop a determined one,
  // and no length rule can — "changed it" is exactly ten characters and passes.
  // What catches that is the reason being permanently attached to the version
  // and read by whoever asks later, not the validator.
  it("refuses a token reason", () => {
    for (const reason of ["fix", ".", "update", "n/a", "asked to"]) {
      expect(attendancePolicySchema.safeParse({ ...VALID, changeReason: reason }).success).toBe(
        false,
      );
    }
  });

  it("does not let whitespace pad a reason to length", () => {
    expect(
      attendancePolicySchema.safeParse({ ...VALID, changeReason: "fix" + " ".repeat(20) }).success,
    ).toBe(false);
  });

  it("trims what it stores, so the reason is the text and not the padding", () => {
    const parsed = attendancePolicySchema.safeParse({
      ...VALID,
      changeReason: "  Raised after the March review  ",
    });
    expect(parsed.success && parsed.data.changeReason).toBe("Raised after the March review");
  });

  it("refuses an essay that would not fit the column", () => {
    expect(
      attendancePolicySchema.safeParse({ ...VALID, changeReason: "x".repeat(501) }).success,
    ).toBe(false);
  });

  // It describes the change, not the rules. If it leaked into the field list
  // it would take part in resolution and show up as a policy diff.
  it("is not a policy field", () => {
    expect(POLICY_FIELDS).not.toContain("changeReason");
    expect(
      policyChanges(
        { ...BASE, isProvisional: false } as PolicyInput,
        { ...BASE, isProvisional: false } as PolicyInput,
      ),
    ).toEqual([]);
  });
});
