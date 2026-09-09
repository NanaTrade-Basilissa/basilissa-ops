import { describe, expect, it } from "vitest";
import { Role, ScopeType, UserStatus } from "@prisma/client";
import { canAuthorizeOvertime } from "@/lib/modules/attendance/server";
import { FALLBACK_POLICY, type ResolvedPolicy } from "@/lib/modules/attendance/policy";

import type { Actor } from "@/lib/modules/identity/authorization";

function makeActor(role: Role, branchId?: string): Actor {
  return {
    userId: `user-${role.toLowerCase()}`,
    name: `Test ${role}`,
    email: `${role.toLowerCase()}@basilissa.com`,
    status: UserStatus.ACTIVE,
    assignments: [
      {
        role,
        scopeType: branchId ? ScopeType.BRANCH : ScopeType.GLOBAL,
        scopeId: branchId ?? "global",
      },
    ],
  };
}

describe("canAuthorizeOvertime", () => {
  const defaultPolicy: ResolvedPolicy = {
    ...FALLBACK_POLICY,
    branchManagerCanAuthorizeOvertime: false,
  };

  const bmAuthorizedPolicy: ResolvedPolicy = {
    ...FALLBACK_POLICY,
    branchManagerCanAuthorizeOvertime: true,
  };

  it("always allows Super Admin to authorize payable overtime", () => {
    const superAdmin = makeActor(Role.SUPER_ADMIN);
    expect(canAuthorizeOvertime(superAdmin, "branch-1", defaultPolicy)).toBe(true);
    expect(canAuthorizeOvertime(superAdmin, "branch-2", defaultPolicy)).toBe(true);
  });

  it("always allows Administrator to authorize payable overtime", () => {
    const admin = makeActor(Role.ADMINISTRATOR);
    expect(canAuthorizeOvertime(admin, "branch-1", defaultPolicy)).toBe(true);
    expect(canAuthorizeOvertime(admin, "branch-2", defaultPolicy)).toBe(true);
  });

  it("allows Area Manager to authorize payable overtime for their assigned branches by default", () => {
    const areaManager = makeActor(Role.AREA_MANAGER, "branch-1");
    // Allowed for their branch
    expect(canAuthorizeOvertime(areaManager, "branch-1", defaultPolicy)).toBe(true);
    // Denied for an unassigned branch
    expect(canAuthorizeOvertime(areaManager, "branch-2", defaultPolicy)).toBe(false);
  });

  it("denies Branch Manager by default when branchManagerCanAuthorizeOvertime is false", () => {
    const branchManager = makeActor(Role.BRANCH_MANAGER, "branch-1");
    expect(canAuthorizeOvertime(branchManager, "branch-1", defaultPolicy)).toBe(false);
    expect(canAuthorizeOvertime(branchManager, "branch-2", defaultPolicy)).toBe(false);
  });

  it("allows Branch Manager to authorize payable overtime when configured by admin in policy", () => {
    const branchManager = makeActor(Role.BRANCH_MANAGER, "branch-1");
    // Allowed for their assigned branch when policy permits
    expect(canAuthorizeOvertime(branchManager, "branch-1", bmAuthorizedPolicy)).toBe(true);
    // Still denied for other branches they do not manage
    expect(canAuthorizeOvertime(branchManager, "branch-2", bmAuthorizedPolicy)).toBe(false);
  });

  it("denies Shift Supervisors and Employees even if policy is true", () => {
    const supervisor = makeActor(Role.SHIFT_SUPERVISOR, "branch-1");
    const employee = makeActor(Role.EMPLOYEE, "branch-1");

    expect(canAuthorizeOvertime(supervisor, "branch-1", bmAuthorizedPolicy)).toBe(false);
    expect(canAuthorizeOvertime(employee, "branch-1", bmAuthorizedPolicy)).toBe(false);
  });
});
