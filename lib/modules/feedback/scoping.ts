import type { Prisma } from "@prisma/client";
import type { BranchScope } from "@/lib/modules/identity/authorization";

/**
 * Filters a reader may apply to the feedback list. Everything is optional
 * because everything arrives from a query string.
 */
export type FeedbackListFilters = {
  branchId?: string;
  rating?: number;
  from?: Date;
  to?: Date;
  search?: string;
};

/**
 * Combine what a reader is allowed to see with what they asked to see.
 *
 * Pure, and separate from the page, because the dangerous version of this is
 * one line shorter. Merging the filters over the scope —
 *
 *   { ...branchWhere(scope), ...(branchId ? { branchId } : {}) }
 *
 * — lets `?branchId=` REPLACE the scope's own clause, so the filter widens the
 * query rather than narrowing it and any branch is readable by editing the
 * URL. Intersecting cannot do that: a branch outside the scope matches
 * nothing. Being a pure function, the difference is testable instead of
 * merely commented.
 */
export function feedbackListWhere(
  scope: BranchScope,
  filters: FeedbackListFilters,
): Prisma.FeedbackSubmissionWhereInput {
  const clauses: Prisma.FeedbackSubmissionWhereInput[] = [];

  switch (scope.kind) {
    case "branches":
      clauses.push({ branchId: { in: scope.branchIds } });
      break;
    case "none":
      // Matches nothing, without the caller having to remember to skip the
      // query. An empty `in` is the honest encoding of "no branches at all";
      // returning `{}` here would return everything.
      clauses.push({ branchId: { in: [] } });
      break;
    case "all":
      break;
  }

  if (filters.search) {
    clauses.push({
      OR: [
        { id: { contains: filters.search, mode: "insensitive" } },
        { branch: { name: { contains: filters.search, mode: "insensitive" } } },
      ],
    });
  }
  if (filters.branchId) clauses.push({ branchId: filters.branchId });
  if (filters.rating !== undefined) {
    clauses.push({
      overallScore: { gte: filters.rating - 0.5, lt: filters.rating + 0.5 },
    });
  }
  if (filters.from || filters.to) {
    clauses.push({
      submittedAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}
