import type { Actor } from "@/lib/modules/identity/authorization";
import type { ResolvedPolicy } from "./policy";

/**
 * Determines whether an actor has authority to authorize payable overtime for an employee/branch.
 *
 * Rules:
 * 1. SUPER_ADMIN and ADMINISTRATOR can always authorize company-wide.
 * 2. AREA_MANAGER can authorize for any branch they hold an assignment for (the company default).
 * 3. BRANCH_MANAGER can authorize ONLY if the policy has branchManagerCanAuthorizeOvertime enabled.
 * 4. All other roles cannot authorize overtime.
 */
export function canAuthorizeOvertime(
  actor: Actor,
  branchId: string,
  policy: ResolvedPolicy,
): boolean {
  for (const assignment of actor.assignments) {
    if (assignment.role === "SUPER_ADMIN" || assignment.role === "ADMINISTRATOR") {
      return true;
    }

    if (assignment.role === "AREA_MANAGER") {
      if (
        assignment.scopeType === "GLOBAL" ||
        (assignment.scopeType === "BRANCH" && assignment.scopeId === branchId)
      ) {
        return true;
      }
    }

    if (assignment.role === "BRANCH_MANAGER") {
      if (
        policy.branchManagerCanAuthorizeOvertime &&
        (assignment.scopeType === "GLOBAL" ||
          (assignment.scopeType === "BRANCH" && assignment.scopeId === branchId))
      ) {
        return true;
      }
    }
  }

  return false;
}
