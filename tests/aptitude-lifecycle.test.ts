import { beforeEach, describe, expect, it, vi } from "vitest";
import { AptitudeQuestionKind, AptitudeTestStatus, IdentityFieldMode } from "@prisma/client";
import {
  duplicateAptitudeTest,
  reopenAptitudeTest,
  unpublishAptitudeTest,
} from "@/lib/modules/aptitude/server";
import type { AuditActor } from "@/lib/platform/audit";

const auditMock = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
vi.mock("@/lib/platform/audit", () => ({ recordAudit: auditMock.fn }));

type MockOption = { id: string; text: string; order: number; isCorrect: boolean };
type MockQuestion = {
  id: string;
  kind: AptitudeQuestionKind;
  text: string;
  order: number;
  points: number;
  required: boolean;
  options: MockOption[];
};
type MockSection = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  timeLimitMinutes: number | null;
  questions: MockQuestion[];
};

type MockTest = {
  id: string;
  title: string;
  description: string | null;
  status: AptitudeTestStatus;
  showScoreToCandidate: boolean;
  passMarkPercent: number | null;
  timeLimitMinutes: number | null;
  invitationsExpire: boolean;
  invitationTtlHours: number;
  publicLinkEnabled: boolean;
  publicLinkNameMode: IdentityFieldMode;
  publicLinkEmailMode: IdentityFieldMode;
  publishedAt: Date | null;
  closedAt: Date | null;
  deletedAt: Date | null;
  sections: MockSection[];
};

const store = vi.hoisted(() => ({
  tests: new Map<string, MockTest>(),
  attemptCounts: new Map<string, number>(),
  createdTests: [] as unknown[],
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    aptitudeTest: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const test = store.tests.get(where.id);
        if (!test) return null;
        return {
          id: test.id,
          title: test.title,
          description: test.description,
          status: test.status,
          showScoreToCandidate: test.showScoreToCandidate,
          passMarkPercent: test.passMarkPercent,
          timeLimitMinutes: test.timeLimitMinutes,
          invitationsExpire: test.invitationsExpire,
          invitationTtlHours: test.invitationTtlHours,
          publicLinkNameMode: test.publicLinkNameMode,
          publicLinkEmailMode: test.publicLinkEmailMode,
          deletedAt: test.deletedAt,
          sections: test.sections.map((s) => ({
            ...s,
            questions: s.questions.map((q) => ({
              ...q,
              options: q.options.map((o) => ({ ...o })),
            })),
          })),
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<MockTest>;
      }) => {
        const test = store.tests.get(where.id);
        if (!test) throw new Error("NotFound");
        const updated = { ...test, ...data };
        store.tests.set(where.id, updated);
        return updated;
      },
      create: async ({ data }: { data: unknown }) => {
        store.createdTests.push(data);
        const id = "test_dup_123";
        return { id };
      },
    },
    aptitudeAttempt: {
      count: async ({ where }: { where: { invitation: { testId: string } } }) => {
        return store.attemptCounts.get(where.invitation.testId) ?? 0;
      },
    },
  },
}));

const ACTOR: AuditActor = {
  userId: "usr_admin",
  email: "admin@basilissa.com",
  role: "SUPER_ADMIN",
};

describe("unpublishAptitudeTest", () => {
  beforeEach(() => {
    store.tests.clear();
    store.attemptCounts.clear();
    store.createdTests = [];
    auditMock.fn.mockClear();
  });

  it("fails if test does not exist or is deleted", async () => {
    const res = await unpublishAptitudeTest("non_existent", ACTOR);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NOT_FOUND");
  });

  it("fails if test is not PUBLISHED", async () => {
    store.tests.set("t1", {
      id: "t1",
      title: "Draft Test",
      description: null,
      status: AptitudeTestStatus.DRAFT,
      showScoreToCandidate: false,
      passMarkPercent: null,
      timeLimitMinutes: null,
      invitationsExpire: true,
      invitationTtlHours: 168,
      publicLinkEnabled: false,
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      publishedAt: null,
      closedAt: null,
      deletedAt: null,
      sections: [],
    });

    const res = await unpublishAptitudeTest("t1", ACTOR);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NOT_PUBLISHED");
  });

  it("fails if candidate attempts exist", async () => {
    store.tests.set("t1", {
      id: "t1",
      title: "Active Test",
      description: null,
      status: AptitudeTestStatus.PUBLISHED,
      showScoreToCandidate: false,
      passMarkPercent: null,
      timeLimitMinutes: 30,
      invitationsExpire: true,
      invitationTtlHours: 168,
      publicLinkEnabled: true,
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      publishedAt: new Date(),
      closedAt: null,
      deletedAt: null,
      sections: [],
    });
    store.attemptCounts.set("t1", 3);

    const res = await unpublishAptitudeTest("t1", ACTOR);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("HAS_ATTEMPTS");
      expect(res.message).toContain("3 candidate attempts have already been recorded");
    }
  });

  it("reverts test to DRAFT when attempts = 0 and records audit", async () => {
    store.tests.set("t1", {
      id: "t1",
      title: "Empty Published Test",
      description: null,
      status: AptitudeTestStatus.PUBLISHED,
      showScoreToCandidate: false,
      passMarkPercent: null,
      timeLimitMinutes: 30,
      invitationsExpire: true,
      invitationTtlHours: 168,
      publicLinkEnabled: true,
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      publishedAt: new Date(),
      closedAt: null,
      deletedAt: null,
      sections: [],
    });
    store.attemptCounts.set("t1", 0);

    const res = await unpublishAptitudeTest("t1", ACTOR);
    expect(res.ok).toBe(true);

    const updated = store.tests.get("t1");
    expect(updated?.status).toBe(AptitudeTestStatus.DRAFT);
    expect(updated?.publishedAt).toBeNull();
    expect(auditMock.fn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "aptitude.test_unpublished",
        entityId: "t1",
      }),
    );
  });
});

describe("reopenAptitudeTest", () => {
  beforeEach(() => {
    store.tests.clear();
    store.attemptCounts.clear();
    store.createdTests = [];
    auditMock.fn.mockClear();
  });

  it("fails if test is not CLOSED", async () => {
    store.tests.set("t1", {
      id: "t1",
      title: "Published Test",
      description: null,
      status: AptitudeTestStatus.PUBLISHED,
      showScoreToCandidate: false,
      passMarkPercent: null,
      timeLimitMinutes: null,
      invitationsExpire: true,
      invitationTtlHours: 168,
      publicLinkEnabled: false,
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      publishedAt: new Date(),
      closedAt: null,
      deletedAt: null,
      sections: [],
    });

    const res = await reopenAptitudeTest("t1", ACTOR);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NOT_CLOSED");
  });

  it("reopens CLOSED test to PUBLISHED and clears closedAt", async () => {
    store.tests.set("t1", {
      id: "t1",
      title: "Closed Test",
      description: null,
      status: AptitudeTestStatus.CLOSED,
      showScoreToCandidate: false,
      passMarkPercent: null,
      timeLimitMinutes: null,
      invitationsExpire: true,
      invitationTtlHours: 168,
      publicLinkEnabled: false,
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      publishedAt: new Date("2026-01-01"),
      closedAt: new Date("2026-02-01"),
      deletedAt: null,
      sections: [],
    });

    const res = await reopenAptitudeTest("t1", ACTOR);
    expect(res.ok).toBe(true);

    const updated = store.tests.get("t1");
    expect(updated?.status).toBe(AptitudeTestStatus.PUBLISHED);
    expect(updated?.closedAt).toBeNull();
    expect(auditMock.fn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "aptitude.test_reopened",
        entityId: "t1",
      }),
    );
  });
});

describe("duplicateAptitudeTest", () => {
  beforeEach(() => {
    store.tests.clear();
    store.attemptCounts.clear();
    store.createdTests = [];
    auditMock.fn.mockClear();
  });

  it("deep-clones test, sections, questions, and options into a new DRAFT test", async () => {
    store.tests.set("t1", {
      id: "t1",
      title: "Operations Screening",
      description: "Screening test for supervisors",
      status: AptitudeTestStatus.PUBLISHED,
      showScoreToCandidate: true,
      passMarkPercent: 75,
      timeLimitMinutes: 45,
      invitationsExpire: true,
      invitationTtlHours: 72,
      publicLinkEnabled: true,
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      publishedAt: new Date(),
      closedAt: null,
      deletedAt: null,
      sections: [
        {
          id: "s1",
          title: "Math",
          description: "Basic arithmetic",
          order: 0,
          timeLimitMinutes: 15,
          questions: [
            {
              id: "q1",
              kind: AptitudeQuestionKind.SINGLE_CHOICE,
              text: "What is 2 + 2?",
              order: 0,
              points: 2,
              required: true,
              options: [
                { id: "o1", text: "4", order: 0, isCorrect: true },
                { id: "o2", text: "5", order: 1, isCorrect: false },
              ],
            },
          ],
        },
      ],
    });

    const res = await duplicateAptitudeTest("t1", ACTOR);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.newTestId).toBe("test_dup_123");
    }

    expect(store.createdTests.length).toBe(1);
    const createdPayload = store.createdTests[0] as {
      title: string;
      description: string | null;
      status: AptitudeTestStatus;
      showScoreToCandidate: boolean;
      passMarkPercent: number | null;
      timeLimitMinutes: number | null;
      publicLinkEnabled: boolean;
      sections: {
        create: Array<{
          title: string;
          order: number;
          questions: {
            create: Array<{
              kind: AptitudeQuestionKind;
              text: string;
              points: number;
              options: {
                create: Array<{ text: string; isCorrect: boolean }>;
              };
            }>;
          };
        }>;
      };
    };

    expect(createdPayload.title).toBe("Operations Screening (Copy)");
    expect(createdPayload.status).toBe(AptitudeTestStatus.DRAFT);
    expect(createdPayload.publicLinkEnabled).toBe(false);
    expect(createdPayload.passMarkPercent).toBe(75);
    expect(createdPayload.sections.create[0]?.title).toBe("Math");
    expect(createdPayload.sections.create[0]?.questions.create[0]?.text).toBe("What is 2 + 2?");
    expect(createdPayload.sections.create[0]?.questions.create[0]?.points).toBe(2);
    expect(createdPayload.sections.create[0]?.questions.create[0]?.options.create[0]?.text).toBe("4");
    expect(createdPayload.sections.create[0]?.questions.create[0]?.options.create[0]?.isCorrect).toBe(true);

    expect(auditMock.fn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "aptitude.test_duplicated",
        entityId: "test_dup_123",
      }),
    );
  });
});
