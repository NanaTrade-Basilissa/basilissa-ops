import { z } from "zod";
import { FEEDBACK_QUESTION_COUNT } from "./constants";

// ---------------------------------------------------------------------------
// Public feedback submission
// ---------------------------------------------------------------------------

export const feedbackAnswerSchema = z.object({
  questionId: z.string().min(1, "questionId is required"),
  score: z
    .number({ invalid_type_error: "score must be a number" })
    .int("score must be a whole number")
    .min(1, "score must be between 1 and 5")
    .max(5, "score must be between 1 and 5"),
});

export const feedbackSubmissionSchema = z
  .object({
    branchSlug: z.string().min(1, "branchSlug is required").max(200),
    submissionToken: z.string().uuid("submissionToken must be a valid UUID"),
    answers: z
      .array(feedbackAnswerSchema)
      .length(
        FEEDBACK_QUESTION_COUNT,
        `Exactly ${FEEDBACK_QUESTION_COUNT} answers are required`,
      ),
  })
  .refine(
    (data) => new Set(data.answers.map((a) => a.questionId)).size === data.answers.length,
    { message: "Duplicate questionId in answers", path: ["answers"] },
  );

export type FeedbackSubmissionInput = z.infer<typeof feedbackSubmissionSchema>;

// ---------------------------------------------------------------------------
// Admin dashboard filters
// ---------------------------------------------------------------------------

export const dashboardFilterSchema = z.object({
  branchId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  questionId: z.string().optional(),
});

export type DashboardFilterInput = z.infer<typeof dashboardFilterSchema>;

// ---------------------------------------------------------------------------
// Admin feedback list filters
// ---------------------------------------------------------------------------

export const feedbackListFilterSchema = z.object({
  branchId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export type FeedbackListFilterInput = z.infer<typeof feedbackListFilterSchema>;
