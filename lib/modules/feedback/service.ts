import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { enqueue } from "@/lib/platform/jobs";
import type { FeedbackSubmissionInput } from "./validation";
import { FEEDBACK_NOTIFY } from "./jobs";

/**
 * Feedback domain logic. Deliberately free of HTTP concerns — the route handler
 * owns status codes and the request/response shape, this file owns the rules.
 * Anything that needs to submit feedback (today the public API, tomorrow an
 * admin tool or a kiosk) goes through here.
 */

export type SubmitFeedbackFailure =
  | "BRANCH_NOT_FOUND"
  | "BRANCH_INACTIVE"
  | "QUESTION_SET_CHANGED";

export type SubmitFeedbackResult =
  | {
      ok: true;
      /** false when an existing submission was replayed via its idempotency token. */
      created: boolean;
      submission: { id: string; submittedAt: Date };
    }
  | { ok: false; reason: SubmitFeedbackFailure; message: string };

export async function submitFeedback(
  input: FeedbackSubmissionInput,
): Promise<SubmitFeedbackResult> {
  const { branchSlug, submissionToken, answers } = input;

  // Idempotent replay: a repeated click or a page refresh resubmits the same
  // token. Treat it as success without creating a second row.
  const existing = await prisma.feedbackSubmission.findUnique({
    where: { submissionToken },
    select: { id: true, submittedAt: true },
  });
  if (existing) {
    return { ok: true, created: false, submission: existing };
  }

  const branch = await prisma.branch.findUnique({
    where: { slug: branchSlug },
    select: { id: true, name: true, isActive: true },
  });

  if (!branch) {
    return { ok: false, reason: "BRANCH_NOT_FOUND", message: "Branch not found" };
  }
  if (!branch.isActive) {
    return {
      ok: false,
      reason: "BRANCH_INACTIVE",
      message: "This branch is not currently accepting feedback",
    };
  }

  const activeQuestions = await prisma.question.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, text: true, type: true, isRequired: true, ratingLabels: true },
  });

  const activeById = new Map(activeQuestions.map((q) => [q.id, q]));
  const answerByQuestionId = new Map(answers.map((a) => [a.questionId, a]));

  // Every submitted answer must belong to a currently active question.
  for (const submitted of answers) {
    if (!activeById.has(submitted.questionId)) {
      return {
        ok: false,
        reason: "QUESTION_SET_CHANGED",
        message: "The feedback questions have changed. Please reload and try again.",
      };
    }
  }

  // Validate each active question according to its type.
  const normalizedAnswers: { questionId: string; score: number | null; textResponse: string | null }[] = [];
  for (const question of activeQuestions) {
    const submitted = answerByQuestionId.get(question.id);
    if (question.type === "RATING") {
      if (!submitted || typeof submitted.score !== "number" || submitted.score < 1 || submitted.score > 5) {
        return {
          ok: false,
          reason: "QUESTION_SET_CHANGED",
          message: "The feedback questions have changed. Please reload and try again.",
        };
      }
      normalizedAnswers.push({
        questionId: question.id,
        score: submitted.score,
        textResponse: null,
      });
    } else {
      const trimmedText = submitted?.textResponse?.trim() || "";
      if (question.isRequired && trimmedText.length === 0) {
        return {
          ok: false,
          reason: "QUESTION_SET_CHANGED",
          message: "Please complete all required questions and try again.",
        };
      }
      normalizedAnswers.push({
        questionId: question.id,
        score: null,
        textResponse: trimmedText.length > 0 ? trimmedText : null,
      });
    }
  }

  // Compute overallScore strictly from RATING answers so open-ended questions
  // never skew branch or question ratings.
  const scoredAnswers = normalizedAnswers.filter((a): a is { questionId: string; score: number; textResponse: null } => a.score !== null);
  const overallScore =
    scoredAnswers.length > 0
      ? scoredAnswers.reduce((sum, a) => sum + a.score, 0) / scoredAnswers.length
      : 0;

  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.feedbackSubmission.create({
      data: { submissionToken, branchId: branch.id, overallScore },
    });

    await tx.feedbackAnswer.createMany({
      data: normalizedAnswers.map((a) => ({
        submissionId: created.id,
        questionId: a.questionId,
        score: a.score,
        textResponse: a.textResponse,
      })),
    });

    // Enqueued inside the transaction, so the notification exists if and only
    // if the submission does. Previously this was an awaited Resend call after
    // the commit: it could not fail the request, but it did put an external
    // HTTP round trip on the customer's critical path, and a crash between
    // commit and send lost the notification silently.
    await enqueue(FEEDBACK_NOTIFY, { submissionId: created.id }, {}, tx);

    return created;
  });

  return {
    ok: true,
    created: true,
    submission: { id: submission.id, submittedAt: submission.submittedAt },
  };
}

export type PublicFeedbackForm = {
  branches: { id: string; name: string; slug: string; location: string }[];
  questions: {
    id: string;
    text: string;
    type: "RATING" | "TEXT";
    isRequired: boolean;
    order: number;
    ratingLabels: string[];
  }[];
  preselectedBranch: { id: string; name: string; slug: string; location: string } | null;
  requestedBranchInactive: boolean;
};

/** Everything the public /feedback page needs, resolved in one place. */
export async function getPublicFeedbackForm(
  requestedSlug?: string,
): Promise<PublicFeedbackForm> {
  const [branches, requestedBranch, questions] = await Promise.all([
    prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, location: true },
    }),
    requestedSlug
      ? prisma.branch.findUnique({
          where: { slug: requestedSlug },
          select: { id: true, isActive: true },
        })
      : Promise.resolve(null),
    prisma.question.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, text: true, type: true, isRequired: true, order: true, ratingLabels: true },
    }),
  ]);

  const preselectedBranch =
    requestedBranch && requestedBranch.isActive
      ? branches.find((b) => b.id === requestedBranch.id) ?? null
      : null;

  return {
    branches,
    questions,
    preselectedBranch,
    requestedBranchInactive: Boolean(requestedBranch && !requestedBranch.isActive),
  };
}
