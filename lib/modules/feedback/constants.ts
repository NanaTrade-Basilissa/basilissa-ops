/**
 * Feedback domain constants: the five-point rating scale and the fixed
 * questions the customer form is built from. Both the runtime app and the
 * Prisma seed import from here so content never drifts between the two.
 *
 * Client-safe: imported by the public feedback flow, so this file must never
 * import `server-only` or reach for the database.
 */

export const RATING_SCALE = [
  { value: 1, label: "Very Poor" },
  { value: 2, label: "Poor" },
  { value: 3, label: "Average" },
  { value: 4, label: "Good" },
  { value: 5, label: "Excellent" },
] as const;

export type RatingValue = (typeof RATING_SCALE)[number]["value"];

export const RATING_LABEL_BY_SCORE: Record<number, string> = Object.fromEntries(
  RATING_SCALE.map((r) => [r.value, r.label]),
);

/** Default per-score response labels for a newly created question, editable afterward. */
export const DEFAULT_RATING_LABELS: readonly string[] = RATING_SCALE.map((r) => r.label);

/** The five fixed, ordered feedback questions. No open-ended questions. */
export const FEEDBACK_QUESTIONS = [
  { order: 1, text: "How would you rate the quality of the food?" },
  { order: 2, text: "How would you rate the speed of service?" },
  { order: 3, text: "How would you rate the friendliness of our staff?" },
  { order: 4, text: "How would you rate the cleanliness of the branch?" },
  { order: 5, text: "How likely are you to visit this branch again?" },
] as const;

export const FEEDBACK_QUESTION_COUNT = FEEDBACK_QUESTIONS.length;

/** sessionStorage key used to make the public feedback form idempotent. */
export const FEEDBACK_TOKEN_STORAGE_KEY = "basilissa:feedback:submission";
