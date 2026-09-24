import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { PermanentJobError, type JobContext } from "@/lib/platform/jobs";
import { emailOptionsForJob } from "@/lib/platform/email";
import { sendFeedbackNotification } from "./notifications";

/**
 * Background work owned by the feedback module. Registered with the worker in
 * `worker/registry.ts`.
 */

export const FEEDBACK_NOTIFY = "feedback.notify";

/**
 * Only the id travels in the payload. The handler reloads everything it needs,
 * so a job cannot carry a stale copy of a record that changed between being
 * enqueued and being run — a branch renamed, a question's labels edited. It
 * also keeps the row small and means the payload schema barely changes.
 */
export const feedbackNotifyPayload = z.object({
  submissionId: z.string().min(1),
});

export async function handleFeedbackNotify(payload: unknown, job?: JobContext): Promise<void> {
  const { submissionId } = feedbackNotifyPayload.parse(payload);

  const submission = await prisma.feedbackSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      submittedAt: true,
      overallScore: true,
      branch: { select: { id: true, name: true } },
      answers: {
        select: {
          score: true,
          question: { select: { text: true, ratingLabels: true, order: true } },
        },
      },
    },
  });

  // Not an error worth retrying: the submission is gone, so there is nothing
  // to notify anyone about and no number of attempts will change that.
  if (!submission) {
    scoped("feedback.notify").warn("submission no longer exists, skipping", { submissionId });
    return;
  }

  const result = await sendFeedbackNotification({
    submissionId: submission.id,
    branchId: submission.branch.id,
    branchName: submission.branch.name,
    submittedAt: submission.submittedAt,
    overallScore: submission.overallScore,
    answers: [...submission.answers]
      .sort((a, b) => a.question.order - b.question.order)
      .map((answer) => ({
        questionText: answer.question.text,
        score: answer.score,
        label: answer.question.ratingLabels[answer.score - 1] ?? "",
      })),
  }, emailOptionsForJob(job));

  /*
    The job's outcome must reflect the send's outcome. Returning regardless
    marks the job SUCCEEDED while the notification is lost — the failure mode
    the queue was introduced to remove, and the worst kind, because the metric
    that would reveal it says everything is fine.
  */
  if (result.status === "failed") {
    const detail = result.error instanceof Error ? result.error.message : String(result.error);

    if (!result.retryable) {
      // Dies now rather than after five identical rejections, and stays as a
      // DEAD row because a message nobody can deliver needs a person.
      throw new PermanentJobError(`Notification rejected: ${detail}`, result.error);
    }
    throw new Error(`Notification failed, will retry: ${detail}`);
  }
}
