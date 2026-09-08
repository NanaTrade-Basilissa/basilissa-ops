import { describe, expect, it, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  failNext: false,
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (store.failNext) {
          store.failNext = false;
          throw new Error("connection refused");
        }
        store.rows.push(data);
        return { id: `audit_${store.rows.length}`, ...data };
      },
    },
  },
}));

const { recordAudit, recordAuditBestEffort, auditSnapshot, SYSTEM_ACTOR } = await import(
  "@/lib/platform/audit"
);

const ACTOR = { userId: "user_1", email: "admin@basilissa.gh", role: "SUPER_ADMIN" };

beforeEach(() => {
  store.rows.length = 0;
  store.failNext = false;
});

describe("recordAudit", () => {
  it("writes the actor, action and entity", async () => {
    await recordAudit({
      actor: ACTOR,
      action: "branch.updated",
      entityType: "Branch",
      entityId: "branch_a",
      before: { name: "Old" },
      after: { name: "New" },
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      actorUserId: "user_1",
      actorEmail: "admin@basilissa.gh",
      actorRole: "SUPER_ADMIN",
      action: "branch.updated",
      entityType: "Branch",
      entityId: "branch_a",
      before: { name: "Old" },
      after: { name: "New" },
    });
  });

  it("supports a null actor for system actions", async () => {
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: "attendance.auto_closed",
      entityType: "AttendanceDay",
      entityId: "day_1",
    });

    expect(store.rows[0]).toMatchObject({ actorUserId: null, actorRole: "SYSTEM" });
  });

  /**
   * The contract most likely to be "helpfully" changed later, so it is pinned
   * here with the reason.
   *
   * Email swallows failures because a Resend outage must not fail a customer's
   * feedback. Audit is the opposite: this data will feed payroll, and "we
   * changed your hours but there is no record of who" is unrecoverable, where
   * a failed write is a retry. So it throws, and inside a transaction it rolls
   * the business change back with it.
   */
  it("THROWS when the write fails, so the audited change rolls back with it", async () => {
    store.failNext = true;

    await expect(
      recordAudit({
        actor: ACTOR,
        action: "branch.updated",
        entityType: "Branch",
        entityId: "branch_a",
      }),
    ).rejects.toThrow("connection refused");
  });

  it("writes through a transaction client when one is given", async () => {
    const txRows: Record<string, unknown>[] = [];
    const tx = {
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          txRows.push(data);
          return { id: "audit_tx", ...data };
        },
      },
    } as never;

    await recordAudit(
      { actor: ACTOR, action: "branch.created", entityType: "Branch", entityId: "branch_b" },
      tx,
    );

    expect(txRows).toHaveLength(1);
    // Must not have gone to the non-transactional client, or the entry would
    // survive a rollback of the change it describes.
    expect(store.rows).toHaveLength(0);
  });
});

describe("recordAuditBestEffort", () => {
  it("swallows failures so an observed flow is never broken by its own logging", async () => {
    store.failNext = true;

    await expect(
      recordAuditBestEffort({
        actor: ACTOR,
        action: "user.sign_in_failed",
        entityType: "User",
        entityId: "unknown",
      }),
    ).resolves.toBeUndefined();
  });

  it("still writes on the happy path", async () => {
    await recordAuditBestEffort({
      actor: ACTOR,
      action: "user.signed_out",
      entityType: "User",
      entityId: "user_1",
    });

    expect(store.rows).toHaveLength(1);
  });
});

describe("auditSnapshot", () => {
  it("keeps only the named fields", () => {
    const branch = {
      id: "branch_a",
      name: "Accra Mall",
      slug: "accra-mall",
      isActive: true,
      updatedAt: new Date(),
      createdAt: new Date(),
    };

    expect(auditSnapshot(branch, ["name", "slug", "isActive"])).toEqual({
      name: "Accra Mall",
      slug: "accra-mall",
      isActive: true,
    });
  });

  it("normalises undefined to null so a diff shows the field, not a gap", () => {
    expect(auditSnapshot({ a: undefined } as Record<string, unknown>, ["a"])).toEqual({ a: null });
  });
});
