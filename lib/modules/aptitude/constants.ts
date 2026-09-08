import { AptitudeQuestionKind, AptitudeTestStatus } from "@prisma/client";

/** Client-safe labels and limits. No server-only imports. */

export const QUESTION_KIND_LABEL: Record<AptitudeQuestionKind, string> = {
  SINGLE_CHOICE: "One correct answer",
  MULTI_CHOICE: "Several correct answers",
  FREE_TEXT: "Written answer (not scored)",
};

export const STATUS_LABEL: Record<AptitudeTestStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Closed",
};

/** Bounds that stop a form producing something unusable. */
export const MAX_OPTIONS_PER_QUESTION = 8;
export const MIN_OPTIONS_PER_QUESTION = 2;
export const MAX_FREE_TEXT_LENGTH = 4000;

/**
 * A week. Long enough to cover a hiring round, short enough that a link found
 * in an inbox months later does not still work.
 */
export const DEFAULT_INVITATION_TTL_HOURS = 168;

/**
 * Bounds on the overall countdown. Below 5 minutes there is no time to read
 * the questions; above 8 hours it stops being a timed test and the untimed
 * option (leave the field blank) already covers that case.
 */
export const MIN_TIME_LIMIT_MINUTES = 5;
export const MAX_TIME_LIMIT_MINUTES = 480;
