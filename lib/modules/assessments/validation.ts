import { z } from "zod";
import { AssessmentQuestionKind } from "@prisma/client";
import { MAX_FREE_TEXT_LENGTH, MAX_OPTIONS_PER_QUESTION, MIN_OPTIONS_PER_QUESTION } from "./constants";

export const assessmentDetailsSchema = z.object({
  title: z.string().trim().min(3, "Give it a title").max(200),
  description: z.string().trim().max(2000).optional(),
  /// Default off: a visible score turns a diagnostic into an exam.
  showScoreToTaker: z.boolean(),
  /**
   * Absent means "no pass mark," not zero — those are different claims. Zero
   * says everybody passes; absent says the idea of passing does not apply to
   * this assessment. An empty field (how the form clears one that was set)
   * and a field never sent (how the create form omits it entirely) both
   * normalise to `undefined` here, which the caller then writes as `null`.
   */
  passMarkPercent: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : val),
    z.coerce.number().int().min(0, "0 to 100").max(100, "0 to 100").optional(),
  ),
});

export const sectionSchema = z.object({
  title: z.string().trim().min(1, "Give the section a title").max(200),
  description: z.string().trim().max(1000).optional(),
});

const optionSchema = z.object({
  text: z.string().trim().min(1, "An option cannot be blank").max(500),
  isCorrect: z.boolean(),
});

/**
 * A scored question needs at least two options and at least one correct one.
 *
 * One option is not a question, and no correct option means nobody can answer
 * it correctly — which would silently drag every score down and cannot be
 * fixed after publishing without invalidating everyone who already sat it.
 */
export const questionSchema = z
  .object({
    sectionId: z.string().min(1),
    kind: z.nativeEnum(AssessmentQuestionKind),
    text: z.string().trim().min(3, "Write the question").max(1000),
    points: z.coerce.number().int().min(0).max(100),
    required: z.boolean(),
    options: z.array(optionSchema).max(MAX_OPTIONS_PER_QUESTION),
  })
  .superRefine((data, ctx) => {
    if (data.kind === AssessmentQuestionKind.FREE_TEXT) return;

    if (data.options.length < MIN_OPTIONS_PER_QUESTION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `Give at least ${MIN_OPTIONS_PER_QUESTION} options`,
      });
    }
    const correct = data.options.filter((o) => o.isCorrect).length;
    if (correct === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Mark at least one option as correct",
      });
    }
    // A single-answer question with two correct options cannot be answered
    // correctly at all, since only one may be chosen.
    if (data.kind === AssessmentQuestionKind.SINGLE_CHOICE && correct > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Only one option can be correct, or change this to several correct answers",
      });
    }
  });

export const invitationSchema = z
  .object({
    assessmentId: z.string().min(1),
    employeeId: z.string().trim().optional(),
    name: z.string().trim().max(200).optional(),
    email: z.string().trim().toLowerCase().max(200).optional(),
  })
  .refine((d) => Boolean(d.employeeId) || Boolean(d.name), {
    message: "Choose an employee, or type a name",
    path: ["name"],
  });

/**
 * What the taker types to identify themselves.
 *
 * The token already established who they are, so this is a declaration. Email
 * is optional because plenty of staff do not have a work address.
 */
export const declarationSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(200),
  email: z.string().trim().toLowerCase().max(200).optional(),
});

export const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).max(MAX_OPTIONS_PER_QUESTION).optional(),
  text: z.string().max(MAX_FREE_TEXT_LENGTH).optional(),
});

export type AssessmentDetailsInput = z.infer<typeof assessmentDetailsSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
