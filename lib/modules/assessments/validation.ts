import { z } from "zod";
import { AssessmentQuestionKind, IdentityFieldMode } from "@prisma/client";
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
  /// HR's call, per assessment: does an issued link expire on its own, or
  /// only when the person submits it? Optional so the create form (which
  /// does not show this yet — see AssessmentDetailsForm) can omit it and
  /// keep the schema default (true).
  invitationsExpire: z.boolean().optional(),
  /// Read only when `invitationsExpire` is true.
  invitationTtlHours: z.coerce.number().int().min(1).max(24 * 365).optional(),
});

/**
 * The public link's identity step, HR's choice per assessment. Independent
 * per field: requiring a name while hiding email (or the reverse) is a
 * legitimate combination, not just required/optional/hidden applied
 * uniformly.
 */
export const publicLinkConfigSchema = z.object({
  enabled: z.boolean(),
  nameMode: z.nativeEnum(IdentityFieldMode),
  emailMode: z.nativeEnum(IdentityFieldMode),
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
 * What the taker types to identify themselves, built for the modes an
 * invitation actually uses. A personal, HR-issued invitation always calls
 * this with `(REQUIRED, OPTIONAL)` — name required, email optional — which is
 * the shape this used to be hardcoded as. A public-link attempt calls it with
 * whatever `Assessment.publicLinkNameMode`/`publicLinkEmailMode` says.
 *
 * A field's resolved value is `""`, never `null`, whenever the declaration
 * step has genuinely completed — hidden or left blank both mean "nothing
 * given," not "not yet asked." `declaredName === null` is what gates whether
 * the taker still sees the declaration step at all (`app/assessment/[token]/
 * page.tsx`), so a `HIDDEN` or blank-`OPTIONAL` name resolving to `null`
 * would show that step again on every reload — `""` is what actually marks
 * it done. Whatever a `HIDDEN` field's raw input is, it's ignored: the form
 * never rendered it, so nothing submitted for it should be trusted anyway.
 */
export function publicDeclarationSchema(nameMode: IdentityFieldMode, emailMode: IdentityFieldMode) {
  const field = (mode: IdentityFieldMode, label: string) => {
    if (mode === "HIDDEN") return z.any().transform(() => "");
    const base = label === "email" ? z.string().trim().toLowerCase().max(200) : z.string().trim().max(200);
    return mode === "REQUIRED"
      ? base.min(label === "email" ? 3 : 2, `Enter your ${label}`)
      : base.optional().transform((v) => v ?? "");
  };

  return z.object({
    name: field(nameMode, "name"),
    email: field(emailMode, "email"),
  });
}

export const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).max(MAX_OPTIONS_PER_QUESTION).optional(),
  text: z.string().max(MAX_FREE_TEXT_LENGTH).optional(),
});

export type AssessmentDetailsInput = z.infer<typeof assessmentDetailsSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
