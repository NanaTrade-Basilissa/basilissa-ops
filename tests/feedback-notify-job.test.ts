import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SendEmailResult } from "@/lib/platform/email";

/**
 * The job's outcome must reflect the send's outcome.
 *
 * Returning regardless — which is what this did — marks the job SUCCEEDED
 * while the notification is lost. That is the worst shape of failure, because
 * the only signal anyone watches reports success.
 */

type NotifyPayload = { answers: { questionText: string; score: number; label: string }[] };
const send = vi.hoisted(() =>
  ({ fn: vi.fn<(payload: NotifyPayload) => Promise<SendEmailResult>>() }),
);
const db = vi.hoisted(() => ({ submission: null as unknown }));

vi.mock("@/lib/modules/feedback/notifications", () => ({
  sendFeedbackNotification: send.fn,
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: { feedbackSubmission: { findUnique: async () => db.submission } },
}));

const { handleFeedbackNotify } = await import("@/lib/modules/feedback/jobs");
const { PermanentJobError } = await import("@/lib/platform/jobs");

const PAYLOAD = { submissionId: "sub_1" };

beforeEach(() => {
  send.fn.mockReset();
  send.fn.mockResolvedValue({ status: "sent", id: "msg_1" });
  db.submission = {
    id: "sub_1",
    submittedAt: new Date("2026-03-10T12:00:00Z"),
    overallScore: 4.5,
    branch: { id: "branch_a", name: "Accra Mall" },
    answers: [
      { score: 5, question: { text: "Food?", ratingLabels: ["1", "2", "3", "4", "5"], order: 1 } },
    ],
  };
});

describe("when the send works", () => {
  it("completes, so the queue records success", async () => {
    await expect(handleFeedbackNotify(PAYLOAD)).resolves.toBeUndefined();
  });

  it("sorts answers by question order and resolves each label", async () => {
    db.submission = {
      ...(db.submission as Record<string, unknown>),
      answers: [
        { score: 2, question: { text: "Service?", ratingLabels: ["a", "b"], order: 2 } },
        { score: 1, question: { text: "Food?", ratingLabels: ["x", "y"], order: 1 } },
      ],
    };
    await handleFeedbackNotify(PAYLOAD);

    expect(send.fn.mock.calls[0]![0]).toMatchObject({
      answers: [
        { questionText: "Food?", score: 1, label: "x" },
        { questionText: "Service?", score: 2, label: "b" },
      ],
    });
  });
});

describe("when the send fails", () => {
  it("throws on a retryable failure, so the queue tries again", async () => {
    send.fn.mockResolvedValue({ status: "failed", retryable: true, error: new Error("503") });

    await expect(handleFeedbackNotify(PAYLOAD)).rejects.toThrow(/will retry/);
    // An ordinary Error, so the queue applies its normal backoff.
    await expect(handleFeedbackNotify(PAYLOAD)).rejects.not.toBeInstanceOf(PermanentJobError);
  });

  it("throws PermanentJobError on a rejection no retry can fix", async () => {
    send.fn.mockResolvedValue({
      status: "failed",
      retryable: false,
      error: new Error("not an address"),
    });

    await expect(handleFeedbackNotify(PAYLOAD)).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("carries the reason into the message, so the dead row explains itself", async () => {
    send.fn.mockResolvedValue({
      status: "failed",
      retryable: false,
      error: new Error("recipient domain does not exist"),
    });

    await expect(handleFeedbackNotify(PAYLOAD)).rejects.toThrow(/recipient domain does not exist/);
  });
});

describe("when there is nothing to send", () => {
  // Not a failure: running without a Resend account is supported, and no
  // number of retries would make a notification appear.
  it("completes when email is not configured", async () => {
    send.fn.mockResolvedValue({ status: "skipped", reason: "not_configured" });
    await expect(handleFeedbackNotify(PAYLOAD)).resolves.toBeUndefined();
  });

  it("completes when nobody is configured to receive it", async () => {
    send.fn.mockResolvedValue({ status: "skipped", reason: "no_recipients" });
    await expect(handleFeedbackNotify(PAYLOAD)).resolves.toBeUndefined();
  });

  // Retrying cannot resurrect a deleted submission, and there is nobody to
  // notify about it.
  it("completes when the submission has since been deleted", async () => {
    db.submission = null;
    await expect(handleFeedbackNotify(PAYLOAD)).resolves.toBeUndefined();
    expect(send.fn).not.toHaveBeenCalled();
  });
});

describe("the payload", () => {
  it("is rejected when it is not a submission id", async () => {
    await expect(handleFeedbackNotify({})).rejects.toThrow();
    await expect(handleFeedbackNotify({ submissionId: "" })).rejects.toThrow();
  });
});
