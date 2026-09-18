import { z } from "zod";
import { AptitudeQuestionKind, IdentityFieldMode } from "@prisma/client";
import {
  MAX_FREE_TEXT_LENGTH,
  MAX_OPTIONS_PER_QUESTION,
  MAX_TIME_LIMIT_MINUTES,
  MIN_OPTIONS_PER_QUESTION,
  MIN_TIME_LIMIT_MINUTES,
} from "./constants";

export const aptitudeTestDetailsSchema = z.object({
  title: z.string().trim().min(3, "Give it a title").max(200),
  description: z.string().trim().max(2000).optional(),
  /// Default off: a visible score turns a diagnostic into an exam.
  showScoreToCandidate: z.boolean(),
  passMarkPercent: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : val),
    z.coerce.number().int().min(0, "0 to 100").max(100, "0 to 100").optional(),
  ),
  invitationsExpire: z.boolean().optional(),
  invitationTtlHours: z.coerce.number().int().min(1).max(24 * 365).optional(),
  /// Minutes for the whole test. Blank clears it back to untimed, same
  /// "absent means the idea doesn't apply, not zero" reasoning as
  /// passMarkPercent.
  timeLimitMinutes: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : val),
    z.coerce.number().int().min(MIN_TIME_LIMIT_MINUTES).max(MAX_TIME_LIMIT_MINUTES).optional(),
  ),
});

export const publicLinkConfigSchema = z.object({
  enabled: z.boolean(),
  nameMode: z.nativeEnum(IdentityFieldMode),
  emailMode: z.nativeEnum(IdentityFieldMode),
});

export const sectionSchema = z.object({
  title: z.string().trim().min(1, "Give the section a title").max(200),
  description: z.string().trim().max(1000).optional(),
  timeLimitMinutes: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : val),
    z.coerce.number().int().min(1, "At least 1 minute").max(180, "At most 180 minutes").optional(),
  ),
});

const optionSchema = z.object({
  text: z.string().trim().min(1, "An option cannot be blank").max(500),
  isCorrect: z.boolean(),
});

export const questionSchema = z
  .object({
    sectionId: z.string().min(1),
    kind: z.nativeEnum(AptitudeQuestionKind),
    text: z.string().trim().min(3, "Write the question").max(1000),
    points: z.coerce.number().int().min(0).max(100),
    required: z.boolean(),
    options: z.array(optionSchema).max(MAX_OPTIONS_PER_QUESTION),
  })
  .superRefine((data, ctx) => {
    if (data.kind === AptitudeQuestionKind.FREE_TEXT) return;

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
    if (data.kind === AptitudeQuestionKind.SINGLE_CHOICE && correct > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Only one option can be correct, or change this to several correct answers",
      });
    }
  });

/**
 * A single candidate invitation, entered by HR directly (name + email, no
 * employee picker — candidates are never Employee rows).
 */
export const invitationSchema = z.object({
  testId: z.string().min(1),
  name: z.string().trim().min(1, "Give a name").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
});

/**
 * One line of a bulk "send by email" textarea: `Name <email>`, `Name, email`,
 * or a bare email with no name. Parsed leniently because HR is pasting this
 * from wherever the application actually arrived (a spreadsheet, an inbox).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseBulkCandidateLines(raw: string): { name: string; email: string }[] {
  const seen = new Set<string>();
  const rows: { name: string; email: string }[] = [];

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const angleMatch = line.match(/^(.*)<([^>]+)>$/);
    let name = "";
    let email = "";

    if (angleMatch) {
      name = angleMatch[1]!.trim();
      email = angleMatch[2]!.trim();
    } else if (line.includes(",")) {
      const [first, second] = line.split(",", 2).map((part) => part.trim());
      if (first && EMAIL_RE.test(first)) {
        email = first;
        name = second ?? "";
      } else {
        name = first ?? "";
        email = second ?? "";
      }
    } else {
      email = line;
    }

    email = email.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    rows.push({ name, email });
  }

  return rows;
}

/**
 * What the candidate types to identify themselves. Identical shape to
 * Assessments' `publicDeclarationSchema`; kept as a separate copy rather than
 * imported across modules, per the module-boundary convention (each module
 * reaches only its own files, or another module's public entry — importing
 * a sibling's `validation.ts` for one function is not worth the coupling).
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

export type AptitudeTestDetailsInput = z.infer<typeof aptitudeTestDetailsSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
