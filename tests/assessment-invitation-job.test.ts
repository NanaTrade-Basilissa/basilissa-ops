import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SendEmailResult } from "@/lib/platform/email";

/**
 * Mirrors `feedback-notify-job.test.ts`: the job's outcome must reflect the
 * send's outcome, and the two failure kinds must be told apart so the queue
 * retries what might work and dead-letters what never will.
 */

const send = vi.hoisted(() => ({ fn: vi.fn<(...args: unknown[]) => Promise<SendEmailResult>>() }));

vi.mock("@/lib/platform/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/email")>();
  return { ...actual, sendEmail: send.fn };
});

vi.mock("@/lib/platform/env", () => ({
  getEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.example" }),
}));

const deleteMany = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/platform/prisma", () => ({
  prisma: { job: { deleteMany: deleteMany.fn } },
}));

const { handleAssessmentInvitationSend, purgeSentInvitationJobs } = await import(
  "@/lib/modules/assessments/jobs"
);
const { PermanentJobError } = await import("@/lib/platform/jobs");

function payload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    email: "ama@x.gh",
    token: "tok_abc123",
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    assessmentTitle: "Till Operations",
    inviteeName: "Ama Mensah",
    ...overrides,
  };
}

beforeEach(() => {
  send.fn.mockReset();
  send.fn.mockResolvedValue({ status: "sent", id: "msg_1" });
});

describe("when the send works", () => {
  it("completes, so the queue records success", async () => {
    await expect(handleAssessmentInvitationSend(payload())).resolves.toBeUndefined();
  });

  it("builds a link to the token, and never logs or otherwise exposes it outside that link", async () => {
    await handleAssessmentInvitationSend(payload({ token: "tok_secret" }));

    const call = send.fn.mock.calls[0]![0] as { html: string; subject: string; context?: unknown };
    expect(call.html).toContain("/assessment/tok_secret");
    expect(call.subject).not.toContain("tok_secret");
    // The identity job passes no `context` for the same reason: the logger
    // would record it alongside the subject, and the token must appear in no
    // log line.
    expect(call.context).toBeUndefined();
  });

  it("names the assessment in the subject", async () => {
    await handleAssessmentInvitationSend(payload({ assessmentTitle: "Till Operations" }));
    expect(send.fn.mock.calls[0]![0]).toMatchObject({ subject: expect.stringContaining("Till Operations") });
  });
});

describe("when the send fails", () => {
  it("throws on a retryable failure, so the queue tries again", async () => {
    send.fn.mockResolvedValue({ status: "failed", retryable: true, error: new Error("503") });

    await expect(handleAssessmentInvitationSend(payload())).rejects.toThrow(/will retry/);
    await expect(handleAssessmentInvitationSend(payload())).rejects.not.toBeInstanceOf(
      PermanentJobError,
    );
  });

  it("throws PermanentJobError on a rejection no retry can fix, naming the assessment", async () => {
    send.fn.mockResolvedValue({
      status: "failed",
      retryable: false,
      error: new Error("not an address"),
    });

    await expect(
      handleAssessmentInvitationSend(payload({ assessmentTitle: "Till Operations" })),
    ).rejects.toMatchObject({
      name: "PermanentJobError",
      message: expect.stringContaining("Till Operations"),
    });
  });
});

describe("when email is not configured", () => {
  // Unlike the feedback notification, this job was only ever enqueued because
  // an address WAS on file — so "not configured" here means somebody is
  // expecting a link that will never come, and that has to surface as a dead
  // job rather than a quiet success.
  it("dead-letters, naming the assessment, rather than completing silently", async () => {
    send.fn.mockResolvedValue({ status: "skipped", reason: "not_configured" });

    await expect(
      handleAssessmentInvitationSend(payload({ assessmentTitle: "Till Operations" })),
    ).rejects.toMatchObject({
      name: "PermanentJobError",
      message: expect.stringContaining("Till Operations"),
    });
  });
});

describe("an invitation that expired before it could be sent", () => {
  it("drops it rather than sending a link that no longer works", async () => {
    await handleAssessmentInvitationSend(
      payload({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    expect(send.fn).not.toHaveBeenCalled();
  });
});

describe("the payload", () => {
  it("is rejected when required fields are missing or malformed", async () => {
    await expect(handleAssessmentInvitationSend({})).rejects.toThrow();
    await expect(handleAssessmentInvitationSend(payload({ email: "not-an-address" }))).rejects.toThrow();
    await expect(handleAssessmentInvitationSend(payload({ token: "" }))).rejects.toThrow();
    await expect(handleAssessmentInvitationSend(payload({ expiresAt: "not-a-date" }))).rejects.toThrow();
  });
});

describe("purgeSentInvitationJobs", () => {
  beforeEach(() => {
    deleteMany.fn.mockReset();
    deleteMany.fn.mockResolvedValue({ count: 0 });
  });

  // A SUCCEEDED job's payload still carries the raw token, and by the time it
  // succeeded that token has already gone out in the email — keeping the row
  // around adds exposure for no benefit, so it is swept regardless of age.
  it("sweeps every SUCCEEDED job, with no age filter", async () => {
    await purgeSentInvitationJobs(new Date("2026-09-14T00:00:00Z"));

    const succeededCall = deleteMany.fn.mock.calls.find(
      ([args]) => args.where.status === "SUCCEEDED",
    );
    expect(succeededCall![0].where).toEqual({
      type: "assessments.invitation_send",
      status: "SUCCEEDED",
    });
  });

  // A DEAD job is the one a human needs to see, so it is kept — but only
  // until the invitation it carried would have expired anyway. A week is the
  // bound, not forever, because the raw token is still sitting in the row.
  it("only sweeps DEAD jobs once they are older than the invitation TTL", async () => {
    const now = new Date("2026-09-14T00:00:00Z");
    await purgeSentInvitationJobs(now);

    const deadCall = deleteMany.fn.mock.calls.find(([args]) => args.where.status === "DEAD");
    const cutoff = deadCall![0].where.createdAt.lt as Date;
    expect(now.getTime() - cutoff.getTime()).toBe(168 * 60 * 60_000);
  });

  it("reports how many of each it removed", async () => {
    deleteMany.fn.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 1 });
    await expect(purgeSentInvitationJobs(new Date())).resolves.toEqual({ succeeded: 3, dead: 1 });
  });
});
