import { AssessmentQuestionKind } from "@prisma/client";

/**
 * Scoring, as a pure function.
 *
 * Separated from everything that touches a database for the same reason the
 * attendance projection is: this decides what a person's result says about
 * them, and "probably right" is not good enough. Every rule below is testable
 * exhaustively without a row existing.
 */

export type ScorableOption = { id: string; isCorrect: boolean };

export type ScorableQuestion = {
  id: string;
  kind: AssessmentQuestionKind;
  points: number;
  options: ScorableOption[];
};

export type SubmittedAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  text?: string | null;
};

export type QuestionResult = {
  questionId: string;
  awardedPoints: number;
  /** Zero for FREE_TEXT, which is excluded from the total entirely. */
  possiblePoints: number;
  /** Null for FREE_TEXT: there is nothing to be right or wrong about. */
  correct: boolean | null;
  answered: boolean;
};

export type ScoreResult = {
  perQuestion: QuestionResult[];
  scoredPoints: number;
  maxPoints: number;
  /** Null when nothing was scorable, rather than a misleading 0%. */
  percent: number | null;
};

/**
 * Whether a single answer earns its points.
 *
 * MULTI_CHOICE is all-or-nothing: the selected set must equal the correct set.
 * Partial credit sounds generous and is not — half-marks for selecting one of
 * three correct options rewards guessing broadly, and selecting everything
 * would score highest of all.
 */
function isCorrect(question: ScorableQuestion, selected: string[]): boolean {
  const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
  const valid = new Set(question.options.map((o) => o.id));

  // Options from another question, or ones since removed, are ignored rather
  // than counted against: they are a client fault, not a wrong answer.
  const chosen = new Set(selected.filter((id) => valid.has(id)));

  if (correctIds.length === 0) return false;
  if (chosen.size !== correctIds.length) return false;
  return correctIds.every((id) => chosen.has(id));
}

export function scoreResponse(
  questions: ScorableQuestion[],
  answers: SubmittedAnswer[],
): ScoreResult {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));

  const perQuestion = questions.map((question): QuestionResult => {
    const answer = byQuestion.get(question.id);

    if (question.kind === AssessmentQuestionKind.FREE_TEXT) {
      return {
        questionId: question.id,
        awardedPoints: 0,
        // Excluded from the maximum, so a score is never out of a total that
        // includes questions nothing could have scored.
        possiblePoints: 0,
        correct: null,
        answered: Boolean(answer?.text && answer.text.trim().length > 0),
      };
    }

    // Negative or zero points would let a question drag a total below what was
    // earned, which no assessment author means to do.
    const possiblePoints = Math.max(0, question.points);
    const selected = answer?.selectedOptionIds ?? [];
    const correct = selected.length > 0 && isCorrect(question, selected);

    return {
      questionId: question.id,
      awardedPoints: correct ? possiblePoints : 0,
      possiblePoints,
      correct,
      answered: selected.length > 0,
    };
  });

  const scoredPoints = perQuestion.reduce((sum, r) => sum + r.awardedPoints, 0);
  const maxPoints = perQuestion.reduce((sum, r) => sum + r.possiblePoints, 0);

  return {
    perQuestion,
    scoredPoints,
    maxPoints,
    percent: maxPoints > 0 ? Math.round((scoredPoints / maxPoints) * 100) : null,
  };
}

/**
 * Which required questions have no answer yet.
 *
 * Returned rather than thrown so the taking page can point at them; submission
 * itself does not refuse an incomplete attempt, because a blank answer is a
 * real answer to "did they know this".
 */
export function unansweredRequired(
  questions: (ScorableQuestion & { required: boolean })[],
  answers: SubmittedAnswer[],
): string[] {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));

  return questions
    .filter((question) => {
      if (!question.required) return false;
      const answer = byQuestion.get(question.id);
      if (!answer) return true;
      return question.kind === AssessmentQuestionKind.FREE_TEXT
        ? !answer.text || answer.text.trim().length === 0
        : answer.selectedOptionIds.length === 0;
    })
    .map((question) => question.id);
}
