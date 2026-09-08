import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Shared in-memory fake "database" the mocked prisma client reads/writes.
// vi.hoisted so it's initialized before vi.mock's factory (which is
// hoisted above imports) needs it.
const db = vi.hoisted(() => ({
  branches: [] as { id: string; slug: string; name: string; isActive: boolean }[],
  questions: [] as {
    id: string;
    text: string;
    order: number;
    isActive: boolean;
    ratingLabels: string[];
  }[],
  submissionsByToken: new Map<string, { id: string; submittedAt: Date; overallScore: number }>(),
  rateLimitCounts: new Map<string, number>(),
  created: [] as { branchId: string; overallScore: number; answers: { questionId: string; score: number }[] }[],
  jobs: [] as { type: string; payload: unknown }[],
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    // The route rate-limits before it does anything else, and the limiter
    // counts through $queryRaw. Without this the limiter fails open on every
    // request, so these tests would never notice if it started rejecting.
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const [key, windowStart] = values as [string, Date];
      const id = `${key}@${windowStart.getTime()}`;
      const next = (db.rateLimitCounts.get(id) ?? 0) + 1;
      db.rateLimitCounts.set(id, next);
      return [{ count: next }];
    },
    rateLimitCounter: {
      deleteMany: async () => ({ count: 0 }),
    },
    feedbackSubmission: {
      findUnique: async ({ where: { submissionToken } }: { where: { submissionToken: string } }) =>
        db.submissionsByToken.get(submissionToken) ?? null,
    },
    branch: {
      findUnique: async ({ where: { slug } }: { where: { slug: string } }) =>
        db.branches.find((b) => b.slug === slug) ?? null,
    },
    question: {
      findMany: async () => db.questions.filter((q) => q.isActive).sort((a, b) => a.order - b.order),
    },
    $transaction: async (
      fn: (tx: {
        feedbackSubmission: { create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>> };
        feedbackAnswer: { createMany: (args: { data: { questionId: string; score: number }[] }) => Promise<{ count: number }> };
        job: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> };
      }) => Promise<Record<string, unknown>>,
    ) => {
      let lastCreated: Record<string, unknown> | null = null;
      const tx = {
        feedbackSubmission: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const record = { id: `sub_${db.created.length + 1}`, submittedAt: new Date(), ...data };
            db.submissionsByToken.set(data.submissionToken as string, {
              id: record.id,
              submittedAt: record.submittedAt,
              overallScore: data.overallScore as number,
            });
            lastCreated = {
              branchId: data.branchId as string,
              overallScore: data.overallScore as number,
              answers: [] as { questionId: string; score: number }[],
            };
            db.created.push(lastCreated as (typeof db.created)[number]);
            return record;
          },
        },
        feedbackAnswer: {
          createMany: async ({ data }: { data: { questionId: string; score: number }[] }) => {
            (lastCreated!.answers as unknown[]).push(...data);
            return { count: data.length };
          },
        },
        // The notification is enqueued inside this transaction, so the mock has
        // to model it or the whole submission path fails.
        job: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            db.jobs.push({ type: data.type as string, payload: data.payload });
            return { id: `job_${db.jobs.length}` };
          },
        },
      };
      return fn(tx);
    },
  },
}));

vi.mock("@/lib/modules/feedback/notifications", () => ({
  sendFeedbackNotification: vi.fn(async () => {}),
}));

const { POST } = await import("@/app/api/feedback/route");
const { __resetInstanceCache } = await import("@/lib/platform/rate-limit");

let ipCounter = 0;
function makeRequest(body: unknown, ip?: string) {
  ipCounter += 1;
  return new NextRequest("http://localhost:3000/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip ?? `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

function validAnswers() {
  return [
    { questionId: "q1", score: 5 },
    { questionId: "q2", score: 4 },
    { questionId: "q3", score: 5 },
    { questionId: "q4", score: 3 },
    { questionId: "q5", score: 5 },
  ];
}

beforeEach(() => {
  db.branches.length = 0;
  db.questions.length = 0;
  db.submissionsByToken.clear();
  db.created.length = 0;
  db.jobs.length = 0;
  db.rateLimitCounts.clear();
  __resetInstanceCache();

  db.branches.push(
    { id: "branch-active", slug: "east-legon", name: "Basilissa East Legon", isActive: true },
    { id: "branch-inactive", slug: "closed-branch", name: "Basilissa Closed", isActive: false },
  );
  // ratingLabels is required: the notification builder reads
  // question.ratingLabels[score - 1] to label each answer.
  const labels = ["Very Poor", "Poor", "Average", "Good", "Excellent"];
  db.questions.push(
    { id: "q1", text: "Food?", order: 1, isActive: true, ratingLabels: labels },
    { id: "q2", text: "Service?", order: 2, isActive: true, ratingLabels: labels },
    { id: "q3", text: "Staff?", order: 3, isActive: true, ratingLabels: labels },
    { id: "q4", text: "Cleanliness?", order: 4, isActive: true, ratingLabels: labels },
    { id: "q5", text: "Return?", order: 5, isActive: true, ratingLabels: labels },
  );
});

describe("POST /api/feedback", () => {
  it("accepts a valid submission and computes the overall score", async () => {
    const token = crypto.randomUUID();
    const res = await POST(
      makeRequest({ branchSlug: "east-legon", submissionToken: token, answers: validAnswers() }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(db.created).toHaveLength(1);
    expect(db.created[0].overallScore).toBeCloseTo(4.4, 5);
    expect(db.created[0].answers).toHaveLength(5);
  });

  // The email moved off the request path onto the job queue. Enqueuing inside
  // the submission transaction is what makes the notification exist if and
  // only if the submission does.
  it("enqueues the notification instead of sending it inline", async () => {
    const token = crypto.randomUUID();
    const res = await POST(
      makeRequest({ branchSlug: "east-legon", submissionToken: token, answers: validAnswers() }),
    );

    expect(res.status).toBe(201);
    expect(db.jobs).toHaveLength(1);
    expect(db.jobs[0].type).toBe("feedback.notify");
    expect(db.jobs[0].payload).toEqual({ submissionId: (await res.json()).id });
  });

  it("does not enqueue a second notification for a replayed submission", async () => {
    const token = crypto.randomUUID();
    const ip = "10.0.7.7";
    await POST(makeRequest({ branchSlug: "east-legon", submissionToken: token, answers: validAnswers() }, ip));
    await POST(makeRequest({ branchSlug: "east-legon", submissionToken: token, answers: validAnswers() }, ip));

    expect(db.jobs).toHaveLength(1);
  });

  it("rejects incomplete answers", async () => {
    const token = crypto.randomUUID();
    const res = await POST(
      makeRequest({ branchSlug: "east-legon", submissionToken: token, answers: validAnswers().slice(0, 3) }),
    );
    expect(res.status).toBe(400);
    expect(db.created).toHaveLength(0);
  });

  it("rejects submissions to an inactive branch", async () => {
    const token = crypto.randomUUID();
    const res = await POST(
      makeRequest({ branchSlug: "closed-branch", submissionToken: token, answers: validAnswers() }),
    );
    expect(res.status).toBe(403);
    expect(db.created).toHaveLength(0);
  });

  it("rejects submissions to an unknown branch", async () => {
    const token = crypto.randomUUID();
    const res = await POST(
      makeRequest({ branchSlug: "does-not-exist", submissionToken: token, answers: validAnswers() }),
    );
    expect(res.status).toBe(404);
  });

  it("is idempotent for a repeated submissionToken (duplicate-submission protection)", async () => {
    const token = crypto.randomUUID();
    const ip = "10.0.9.9";
    const first = await POST(
      makeRequest({ branchSlug: "east-legon", submissionToken: token, answers: validAnswers() }, ip),
    );
    expect(first.status).toBe(201);
    const second = await POST(
      makeRequest({ branchSlug: "east-legon", submissionToken: token, answers: validAnswers() }, ip),
    );
    expect(second.status).toBe(200);
    expect(db.created).toHaveLength(1);

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.id).toBe(firstBody.id);
  });
});
