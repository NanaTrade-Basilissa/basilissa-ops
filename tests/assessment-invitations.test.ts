import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuditActor } from "@/lib/platform/audit";

/**
 * Exercises the two decisions HANDOVER.md called out for resending an
 * assessment invitation:
 *
 *  - it must issue a genuinely new invitation, since only the old token's
 *    hash is stored and the original cannot be recovered;
 *  - it must issue that new one BEFORE revoking the old, so a failure partway
 *    (the assessment closed underneath it, say) never leaves the person with
 *    zero live links.
 *
 * The rest of `issueInvitation` — TTL math, employee lookups — is exercised
 * against a real database in the verification run; what matters here is
 * ordering and the failure paths, which do not need one.
 */

type AssessmentRow = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  invitationTtlHours: number;
  _count: { sections: number };
};

type InvitationRow = {
  id: string;
  assessmentId: string;
  employeeId: string | null;
  inviteeName: string;
  inviteeEmail: string | null;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  response: { submittedAt: Date | null } | null;
};

type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  userId: string | null;
};

const store = vi.hoisted(() => ({
  assessments: new Map<string, AssessmentRow>(),
  invitations: new Map<string, InvitationRow>(),
  employees: new Map<string, EmployeeRow>(),
  seq: 0,
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    assessment: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.assessments.get(where.id) ?? null,
    },
    assessmentQuestion: {
      count: async () => 1,
    },
    employee: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.employees.get(where.id) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => store.employees.get(id)).filter((e): e is EmployeeRow => Boolean(e)),
    },
    assessmentInvitation: {
      create: async ({ data }: { data: Omit<InvitationRow, "id" | "response" | "revokedAt"> }) => {
        store.seq += 1;
        const id = `inv_${store.seq}`;
        store.invitations.set(id, { id, ...data, revokedAt: null, response: null });
        return { id };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.invitations.get(where.id);
        return row ? { ...row } : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<InvitationRow>;
      }) => {
        const row = store.invitations.get(where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
    },
  },
}));

const recordAudit = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
vi.mock("@/lib/platform/audit", () => ({ recordAudit: recordAudit.fn }));

const { issueInvitation, issueInvitations, resendInvitation } = await import(
  "@/lib/modules/assessments/invitations"
);

const ACTOR: AuditActor = { userId: "u_hr", email: "hr@basilissa.gh", role: "HR" };

beforeEach(() => {
  store.assessments.clear();
  store.invitations.clear();
  store.employees.clear();
  store.seq = 0;
  recordAudit.fn.mockClear();

  store.assessments.set("a1", {
    id: "a1",
    title: "Till Operations",
    status: "PUBLISHED",
    invitationTtlHours: 168,
    _count: { sections: 1 },
  });
});

async function issue() {
  const outcome = await issueInvitation(
    { assessmentId: "a1", name: "Ama Mensah", email: "ama@x.gh" },
    ACTOR,
  );
  if (!outcome.ok) throw new Error("setup: issueInvitation failed");
  return outcome.invitation;
}

describe("resending an invitation", () => {
  it("issues a different token than the one it replaces", async () => {
    const original = await issue();
    const outcome = await resendInvitation(original.invitationId, ACTOR);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.invitation.token).not.toBe(original.token);
    expect(outcome.invitation.invitationId).not.toBe(original.invitationId);
  });

  it("carries the same invitee over to the new link", async () => {
    const original = await issue();
    const outcome = await resendInvitation(original.invitationId, ACTOR);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.invitation.inviteeName).toBe("Ama Mensah");
    expect(outcome.invitation.inviteeEmail).toBe("ama@x.gh");
  });

  it("withdraws the old invitation once the new one exists", async () => {
    const original = await issue();
    await resendInvitation(original.invitationId, ACTOR);

    const oldRow = store.invitations.get(original.invitationId)!;
    expect(oldRow.revokedAt).not.toBeNull();
  });

  it("refuses to resend an invitation that was already submitted", async () => {
    const original = await issue();
    store.invitations.get(original.invitationId)!.response = { submittedAt: new Date() };

    const outcome = await resendInvitation(original.invitationId, ACTOR);

    expect(outcome).toMatchObject({ ok: false, reason: "ALREADY_SUBMITTED" });
    // Neither withdrawn nor replaced — there was nothing to resend.
    expect(store.invitations.get(original.invitationId)!.revokedAt).toBeNull();
    expect(store.invitations.size).toBe(1);
  });

  it("refuses an unknown invitation", async () => {
    const outcome = await resendInvitation("nope", ACTOR);
    expect(outcome).toMatchObject({ ok: false, reason: "NOT_FOUND" });
  });

  // The ordering guarantee: issuing happens before revoking, so a failure
  // partway leaves the person with the link they already had, not none.
  it("leaves the old link live when issuing the new one fails", async () => {
    const original = await issue();
    store.assessments.get("a1")!.status = "CLOSED";

    const outcome = await resendInvitation(original.invitationId, ACTOR);

    expect(outcome).toMatchObject({ ok: false, reason: "NOT_PUBLISHED" });
    const oldRow = store.invitations.get(original.invitationId)!;
    expect(oldRow.revokedAt).toBeNull();
  });

  it("does not double-revoke, and still returns the fresh link, if called on an already-withdrawn invitation", async () => {
    const original = await issue();
    store.invitations.get(original.invitationId)!.revokedAt = new Date("2026-01-01T00:00:00Z");

    const outcome = await resendInvitation(original.invitationId, ACTOR);

    expect(outcome.ok).toBe(true);
    // No fresh audit entry for a revoke that had already happened.
    expect(recordAudit.fn).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "assessment.invitation_revoked" }),
    );
  });
});

describe("issuing invitations in bulk", () => {
  beforeEach(() => {
    store.employees.set("e1", {
      id: "e1",
      firstName: "Kwame",
      lastName: "Osei",
      email: "kwame@x.gh",
      userId: null,
    });
    store.employees.set("e2", {
      id: "e2",
      firstName: "Ama",
      lastName: "Mensah",
      email: "ama@x.gh",
      userId: null,
    });
    store.employees.set("e3", { id: "e3", firstName: "No", lastName: "Email", email: null, userId: null });
  });

  it("issues one invitation per employee", async () => {
    const result = await issueInvitations("a1", ["e1", "e2", "e3"], ACTOR);

    expect(result.invitations).toHaveLength(3);
    expect(result.failures).toHaveLength(0);
    expect(result.invitations.map((i) => i.inviteeName).sort()).toEqual(["Ama Mensah", "Kwame Osei", "No Email"]);
  });

  // One employee's failure must not cost the rest of a large batch their links.
  it("keeps going past one failure and reports it by name", async () => {
    const result = await issueInvitations("a1", ["e1", "unknown-id", "e2"], ACTOR);

    expect(result.invitations).toHaveLength(2);
    expect(result.failures).toEqual([{ name: "unknown-id", message: "No such employee." }]);
  });

  it("fails every entry the same way when the assessment itself cannot take invitations", async () => {
    store.assessments.get("a1")!.status = "DRAFT";

    const result = await issueInvitations("a1", ["e1", "e2"], ACTOR);

    expect(result.invitations).toHaveLength(0);
    expect(result.failures.map((f) => f.name).sort()).toEqual(["Ama Mensah", "Kwame Osei"]);
    expect(result.failures.every((f) => f.message.includes("Publish"))).toBe(true);
  });

  it("carries each employee's own email onto their invitation", async () => {
    const result = await issueInvitations("a1", ["e1", "e2"], ACTOR);

    const byName = new Map(result.invitations.map((i) => [i.inviteeName, i.inviteeEmail]));
    expect(byName.get("Kwame Osei")).toBe("kwame@x.gh");
    expect(byName.get("Ama Mensah")).toBe("ama@x.gh");
  });

  it("resolves an unknown id to itself when there is no employee record to name it from", async () => {
    const result = await issueInvitations("a1", ["ghost"], ACTOR);
    expect(result.failures).toEqual([{ name: "ghost", message: "No such employee." }]);
  });
});
