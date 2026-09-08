import { describe, expect, it } from "vitest";
import { dayWhere } from "@/lib/modules/attendance/queries";
import type { BranchScope } from "@/lib/modules/identity/authorization";

/**
 * Same failure this guards against as `feedback-scoping.test.ts`: a reader's
 * scope and their `?branchId=` filter arrive at the same query, and merging
 * one over the other lets the filter win — so a branch-scoped manager could
 * read another branch's attendance by editing the URL. `dayWhere` intersects
 * instead, via `AND`, so a branch outside the scope matches nothing.
 *
 * This was unreachable while every list page demanded a GLOBAL grant to load
 * at all; the any-branch gate is what makes it reachable, which is what makes
 * this worth pinning down now rather than after.
 */

const ALL: BranchScope = { kind: "all" };
const TWO: BranchScope = { kind: "branches", branchIds: ["branch_a", "branch_b"] };
const NONE: BranchScope = { kind: "none" };

const DATE = "2026-03-10";

function branchClauses(where: NonNullable<ReturnType<typeof dayWhere>>) {
  return (where.AND as Record<string, unknown>[]).filter((c) => "branchId" in c);
}

describe("scope and filter are intersected, never merged", () => {
  it("keeps the scope when the reader filters to a branch inside it", () => {
    const where = dayWhere(TWO, { date: DATE, branchId: "branch_a" });
    expect(branchClauses(where!)).toEqual([
      { branchId: { in: ["branch_a", "branch_b"] } },
      { branchId: "branch_a" },
    ]);
  });

  // The attack in one line: ask for a branch you were never granted.
  it("cannot be widened to a branch outside the scope", () => {
    const where = dayWhere(TWO, { date: DATE, branchId: "branch_z" });
    expect(branchClauses(where!)).toEqual([
      { branchId: { in: ["branch_a", "branch_b"] } },
      { branchId: "branch_z" },
    ]);
    // Intersecting an id against a list it is absent from matches no rows.
  });

  it("lets a global reader filter freely", () => {
    const where = dayWhere(ALL, { date: DATE, branchId: "branch_z" });
    expect(branchClauses(where!)).toEqual([{ branchId: "branch_z" }]);
  });
});

describe("a scope of none", () => {
  it("returns null rather than an unfiltered query", () => {
    expect(dayWhere(NONE, { date: DATE })).toBeNull();
  });

  it("stays null even with a branch filter supplied", () => {
    expect(dayWhere(NONE, { date: DATE, branchId: "branch_a" })).toBeNull();
  });
});

describe("the other filters", () => {
  it("always includes the work date", () => {
    const where = dayWhere(ALL, { date: DATE });
    expect(where!.AND).toContainEqual({ workDate: new Date(`${DATE}T00:00:00.000Z`) });
  });

  it("adds the exceptions-only clause only when asked", () => {
    expect(dayWhere(ALL, { date: DATE })!.AND).not.toContainEqual({ status: "NEEDS_REVIEW" });
    expect(dayWhere(ALL, { date: DATE, exceptionsOnly: true })!.AND).toContainEqual({
      status: "NEEDS_REVIEW",
    });
  });
});
