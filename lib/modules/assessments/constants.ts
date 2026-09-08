import { AssessmentQuestionKind, AssessmentStatus } from "@prisma/client";

/** Client-safe labels and limits. No server-only imports. */

export const QUESTION_KIND_LABEL: Record<AssessmentQuestionKind, string> = {
  SINGLE_CHOICE: "One correct answer",
  MULTI_CHOICE: "Several correct answers",
  FREE_TEXT: "Written answer (not scored)",
};

export const STATUS_LABEL: Record<AssessmentStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Closed",
};

/** Bounds that stop a form producing something unusable. */
export const MAX_OPTIONS_PER_QUESTION = 8;
export const MIN_OPTIONS_PER_QUESTION = 2;
export const MAX_FREE_TEXT_LENGTH = 4000;

/**
 * A week. Long enough to cover a rota and a weekend, short enough that a link
 * found in an inbox months later does not still work.
 */
export const DEFAULT_INVITATION_TTL_HOURS = 168;
