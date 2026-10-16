import { isSuperAdmin, type Actor } from "@/lib/modules/identity/authorization";
import type { ResolvedPolicy } from "./policy";

/**
 * Determines whether an actor has authority to authorize payable overtime for an employee/branch.
 *
 * Rules:
 * 1. SUPER_ADMIN and ADMINISTRATOR can always authorize company-wide.
 * 2. Actors holding roles with attendance approval permissions can authorize.
 * 3. AREA_MANAGER can authorize for any branch they hold an assignment for (the company default).
 * 4. BRANCH_MANAGER can authorize ONLY if the policy has branchManagerCanAuthorizeOvertime enabled.
 * 5. All other roles cannot authorize overtime.
 */
export function canAuthorizeOvertime(
  actor: Actor,
  branchId: string,
  policy: ResolvedPolicy,
): boolean {
  if (isSuperAdmin(actor)) {
    return true;
  }

  if (actor.customRole?.permissions?.length) {
    const hasApprove =
      actor.customRole.permissions.includes("attendance:approve") ||
      actor.customRole.permissions.includes("attendance:write") ||
      actor.customRole.permissions.includes("attendance:manual_entry");
    if (hasApprove) {
      return true;
    }
  }

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
