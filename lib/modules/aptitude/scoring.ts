import { AptitudeQuestionKind } from "@prisma/client";

/**
 * Scoring, as a pure function. Same rules as Assessments' scorer — see that
 * module's `scoring.ts` for the full reasoning — kept as an independent copy
 * because the two modules' scoring is allowed to diverge without touching
 * each other (e.g. a future partial-credit mode for aptitude tests only).
 */

export type ScorableOption = { id: string; isCorrect: boolean };

export type ScorableQuestion = {
  id: string;
  kind: AptitudeQuestionKind;
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
  possiblePoints: number;
  correct: boolean | null;
  answered: boolean;
};

export type ScoreResult = {
  perQuestion: QuestionResult[];
  scoredPoints: number;
  maxPoints: number;
  percent: number | null;
};

function isCorrect(question: ScorableQuestion, selected: string[]): boolean {
  const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
  const valid = new Set(question.options.map((o) => o.id));
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

    if (question.kind === AptitudeQuestionKind.FREE_TEXT) {
      return {
        questionId: question.id,
        awardedPoints: 0,
        possiblePoints: 0,
        correct: null,
        answered: Boolean(answer?.text && answer.text.trim().length > 0),
      };
    }

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
 * Which required questions have no answer yet. Not used to refuse a manual
 * submit past the deadline or an auto-submit — those finalise whatever was
 * saved, blank required answers included (a blank answer is a real answer to
 * "did they get to this in time").
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
      return question.kind === AptitudeQuestionKind.FREE_TEXT
        ? !answer.text || answer.text.trim().length === 0
        : answer.selectedOptionIds.length === 0;
    })
    .map((question) => question.id);
}
