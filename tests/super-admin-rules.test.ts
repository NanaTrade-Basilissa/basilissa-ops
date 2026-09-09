import { describe, expect, it, vi, beforeEach } from "vitest";
import { Role, ScopeType, UserStatus } from "@prisma/client";
import type { AuditActor } from "@/lib/platform/audit";

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCount = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockUserCreate = vi.fn();

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
    roleAssignment: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      count: (...args: unknown[]) => mockCount(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    branch: {
      findUnique: vi.fn().mockResolvedValue({ id: "b1" }),
    },
  },
}));

vi.mock("@/lib/platform/audit", () => ({
  recordAudit: vi.fn(),
  recordAuditBestEffort: vi.fn(),
}));

vi.mock("@/lib/modules/identity/session", () => ({
  bumpSessionVersion: vi.fn(),
}));

const { grantRole, revokeRole, setUserStatus } = await import(
  "@/lib/modules/identity/user-admin"
);

const superAdminActor: AuditActor = {
  userId: "super_1",
  email: "super@basilissa.gh",
  role: "SUPER_ADMIN",
};

const adminActor: AuditActor = {
  userId: "admin_1",
  email: "admin@basilissa.gh",
  role: "ADMINISTRATOR",
};

describe("Single Super Admin Rule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a branch-scoped grant for SUPER_ADMIN", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "user_2", email: "target@basilissa.gh" });

    const result = await grantRole(
      { userId: "user_2", role: Role.SUPER_ADMIN, scopeType: ScopeType.BRANCH, branchId: "b1" },
      superAdminActor,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("SINGLE_SUPER_ADMIN_ONLY");
      expect(result.message).toContain("company-wide");
    }
  });

  it("blocks granting SUPER_ADMIN if an active super admin already exists", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "user_2", email: "target@basilissa.gh" });
    mockFindFirst.mockResolvedValueOnce({
      user: { email: "existing-super@basilissa.gh" },
    });

    const result = await grantRole(
      { userId: "user_2", role: Role.SUPER_ADMIN, scopeType: ScopeType.GLOBAL },
      superAdminActor,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("SINGLE_SUPER_ADMIN_ONLY");
      expect(result.message).toContain("Only one super admin account is allowed");
      expect(result.message).toContain("existing-super@basilissa.gh");
    }
  });

  it("blocks non-super-admin from granting the SUPER_ADMIN role", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "user_2", email: "target@basilissa.gh" });
    mockFindFirst.mockResolvedValueOnce(null); // No other super admin
    mockCount.mockResolvedValueOnce(0); // target is not super admin
    mockCount.mockResolvedValueOnce(0); // actor is not super admin

    const result = await grantRole(
      { userId: "user_2", role: Role.SUPER_ADMIN, scopeType: ScopeType.GLOBAL },
      adminActor,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("SUPER_ADMIN_PROTECTED");
    }
  });
});

describe("Super Admin Protection Boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks non-super-admin from modifying roles on a Super Admin account", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "super_target", email: "super@basilissa.gh" });
    // isTargetSuperAdmin returns 1
    mockCount.mockResolvedValueOnce(1);
    // isActorSuperAdmin returns 0
    mockCount.mockResolvedValueOnce(0);

    const result = await grantRole(
      { userId: "super_target", role: Role.HR, scopeType: ScopeType.GLOBAL },
      adminActor,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("SUPER_ADMIN_PROTECTED");
    }
  });

  it("blocks non-super-admin from revoking a role on a Super Admin account", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "assign_1",
      userId: "super_target",
      role: Role.HR,
      scopeType: ScopeType.GLOBAL,
      scopeId: "",
      validTo: null,
      user: { email: "super@basilissa.gh" },
    });
    // isTargetSuperAdmin returns 1
    mockCount.mockResolvedValueOnce(1);
    // isActorSuperAdmin returns 0
    mockCount.mockResolvedValueOnce(0);

    const result = await revokeRole("assign_1", adminActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("SUPER_ADMIN_PROTECTED");
    }
  });

  it("blocks non-super-admin from changing the status of a Super Admin account", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "super_target",
      email: "super@basilissa.gh",
      status: UserStatus.ACTIVE,
    });
    // isTargetSuperAdmin returns 1
    mockCount.mockResolvedValueOnce(1);
    // isActorSuperAdmin returns 0
    mockCount.mockResolvedValueOnce(0);

    const result = await setUserStatus("super_target", UserStatus.SUSPENDED, adminActor);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("SUPER_ADMIN_PROTECTED");
    }
  });

  it("allows a Super Admin to change the status of an Administrator account", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "admin_target",
      email: "admin@basilissa.gh",
      status: UserStatus.ACTIVE,
    });
    // isTargetSuperAdmin returns 0 (target is not super admin)
    mockCount.mockResolvedValueOnce(0);
    // remaining super admins count for LAST_SUPER_ADMIN check
    mockCount.mockResolvedValueOnce(1);
    mockCount.mockResolvedValueOnce(0);
    mockUpdate.mockResolvedValueOnce({});

    const result = await setUserStatus("admin_target", UserStatus.SUSPENDED, superAdminActor);

    expect(result.ok).toBe(true);
  });
});

describe("Self-Action Prevention", () => {
  it("blocks a logged-in user from changing their own status", async () => {
    const result = await setUserStatus("user_me", UserStatus.SUSPENDED, {
      userId: "user_me",
      email: "me@basilissa.gh",
      role: "ADMINISTRATOR",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("SELF_ACTION_FORBIDDEN");
      expect(result.message).toContain("own account status");
    }
  });
});
