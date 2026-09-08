import { describe, expect, it } from "vitest";
import { feedbackListWhere } from "@/lib/modules/feedback/server";
import type { BranchScope } from "@/lib/modules/identity/authorization";

/**
 * The filter a reader supplies and the scope they are confined to arrive at the
 * same query, and the tempting way to combine them is to merge one over the
 * other. That version reads fine and is a data leak: the user's `branchId`
 * overwrites the scope's, so `?branchId=` widens the query instead of
 * narrowing it. These tests exist to make that difference visible.
 */

const ALL: BranchScope = { kind: "all" };
const TWO: BranchScope = { kind: "branches", branchIds: ["branch_a", "branch_b"] };
const NONE: BranchScope = { kind: "none" };

/** Every branch condition the query will apply, in order. */
function branchClauses(where: ReturnType<typeof feedbackListWhere>) {
  return (where.AND as Record<string, unknown>[] | undefined)?.filter((c) => "branchId" in c) ?? [];
}

describe("scope and filter are intersected, never merged", () => {
  it("keeps the scope when the reader filters to a branch inside it", () => {
    const clauses = branchClauses(feedbackListWhere(TWO, { branchId: "branch_a" }));

    // Both survive. The merged version would leave only the reader's choice.
    expect(clauses).toEqual([{ branchId: { in: ["branch_a", "branch_b"] } }, { branchId: "branch_a" }]);
  });

  // The attack in one line: ask for a branch you were never granted.
  it("returns nothing when the reader filters to a branch outside their scope", () => {
    const clauses = branchClauses(feedbackListWhere(TWO, { branchId: "branch_z" }));

    expect(clauses).toContainEqual({ branchId: { in: ["branch_a", "branch_b"] } });
    expect(clauses).toContainEqual({ branchId: "branch_z" });
    // Intersecting an id against a list it is absent from matches no rows.
    expect(clauses).toHaveLength(2);
  });

  it("lets a global reader filter freely", () => {
    expect(branchClauses(feedbackListWhere(ALL, { branchId: "branch_z" }))).toEqual([
      { branchId: "branch_z" },
    ]);
  });

  it("constrains a global reader to nothing when they filter to nothing", () => {
    expect(feedbackListWhere(ALL, {})).toEqual({});
  });
});

describe("a scope of none", () => {
  // The failure mode worth guarding: an empty object means "no conditions",
  // which is every row rather than no rows.
  it("matches nothing rather than everything", () => {
    const where = feedbackListWhere(NONE, {});
    expect(where).not.toEqual({});
    expect(branchClauses(where)).toEqual([{ branchId: { in: [] } }]);
  });

  it("cannot be escaped with a filter", () => {
    const clauses = branchClauses(feedbackListWhere(NONE, { branchId: "branch_a" }));
    expect(clauses).toContainEqual({ branchId: { in: [] } });
  });
});

describe("the other filters", () => {
  it("turns a star rating into a half-star band", () => {
    const where = feedbackListWhere(ALL, { rating: 4 });
    expect(where.AND).toEqual([{ overallScore: { gte: 3.5, lt: 4.5 } }]);
  });

  it("applies each end of a date range independently", () => {
    const from = new Date("2026-03-01T00:00:00Z");
    const to = new Date("2026-03-31T23:59:59Z");

    expect(feedbackListWhere(ALL, { from }).AND).toEqual([{ submittedAt: { gte: from } }]);
    expect(feedbackListWhere(ALL, { to }).AND).toEqual([{ submittedAt: { lte: to } }]);
    expect(feedbackListWhere(ALL, { from, to }).AND).toEqual([
      { submittedAt: { gte: from, lte: to } },
    ]);
  });

  it("carries scope and every filter together", () => {
    const where = feedbackListWhere(TWO, {
      branchId: "branch_a",
      rating: 5,
      from: new Date("2026-03-01T00:00:00Z"),
    });
    expect(where.AND).toHaveLength(4);
  });
});
