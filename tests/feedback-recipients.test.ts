import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/modules/identity/authorization";

const mockPrisma = vi.hoisted(() => ({
  branchFeedbackRecipient: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback(mockPrisma);
  }),
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: mockPrisma,
}));

const {
  getFeedbackRecipientsForBranch,
  listConfigurableRecipientsForBranch,
  saveBranchFeedbackRecipients,
} = await import("@/lib/modules/feedback/server");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFeedbackRecipientsForBranch", () => {
  it("returns enabled configured recipients when custom rows exist", async () => {
    mockPrisma.branchFeedbackRecipient.findMany.mockResolvedValue([
      { email: "manager@basilissa.gh", enabled: true },
      { email: "disabled@basilissa.gh", enabled: false },
      { email: "ops@basilissa.gh", enabled: true },
    ]);

    const recipients = await getFeedbackRecipientsForBranch("branch_1");

    expect(recipients).toEqual(["manager@basilissa.gh", "ops@basilissa.gh"]);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("defaults to active branch manager and area manager when no custom rows exist", async () => {
    mockPrisma.branchFeedbackRecipient.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([
      { email: "bm@basilissa.gh" },
      { email: "am@basilissa.gh" },
    ]);

    const recipients = await getFeedbackRecipientsForBranch("branch_1");

    expect(recipients).toEqual(["bm@basilissa.gh", "am@basilissa.gh"]);
    expect(mockPrisma.user.findMany).toHaveBeenCalled();
  });
});

describe("listConfigurableRecipientsForBranch", () => {
  it("marks active managers as default managers with enabled true on first load", async () => {
    mockPrisma.branchFeedbackRecipient.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "user_bm",
        name: "Branch Manager",
        email: "bm@basilissa.gh",
        roleAssignments: [{ role: "BRANCH_MANAGER", scopeType: "BRANCH", scopeId: "branch_1" }],
      },
      {
        id: "user_am",
        name: "Area Manager",
        email: "am@basilissa.gh",
        roleAssignments: [{ role: "AREA_MANAGER", scopeType: "GLOBAL", scopeId: null }],
      },
    ]);

    const list = await listConfigurableRecipientsForBranch("branch_1");

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      email: "bm@basilissa.gh",
      name: "Branch Manager",
      roleLabel: "Branch Manager",
      enabled: true,
      isDefaultManager: true,
    });
    expect(list[1]).toMatchObject({
      email: "am@basilissa.gh",
      name: "Area Manager",
      roleLabel: "Area Manager",
      enabled: true,
      isDefaultManager: true,
    });
  });
});

describe("saveBranchFeedbackRecipients", () => {
  it("upserts recipients and deletes removed custom recipients", async () => {
    mockPrisma.branchFeedbackRecipient.findMany.mockResolvedValue([
      { id: "rec_old", email: "old@basilissa.gh" },
    ]);

    await saveBranchFeedbackRecipients(
      "branch_1",
      [
        { email: "new@basilissa.gh", name: "New", roleLabel: "Custom", enabled: true },
      ],
      {
        userId: "user_admin",
        name: "Admin User",
        email: "admin@basilissa.gh",
        status: "ACTIVE",
        assignments: [{ role: "SUPER_ADMIN", scopeType: "GLOBAL", scopeId: "" }],
      } satisfies Actor,
    );

    expect(mockPrisma.branchFeedbackRecipient.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["rec_old"] } },
    });
    expect(mockPrisma.branchFeedbackRecipient.upsert).toHaveBeenCalledWith({
      where: {
        branchId_email: { branchId: "branch_1", email: "new@basilissa.gh" },
      },
      create: {
        branchId: "branch_1",
        email: "new@basilissa.gh",
        name: "New",
        roleLabel: "Custom",
        userId: null,
        enabled: true,
      },
      update: {
        name: "New",
        roleLabel: "Custom",
        userId: null,
        enabled: true,
      },
    });
  });
});
