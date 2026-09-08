import { describe, expect, it } from "vitest";
import { AssessmentQuestionKind } from "@prisma/client";
import {
  scoreResponse,
  unansweredRequired,
  type ScorableQuestion,
} from "@/lib/modules/assessments/scoring";

/**
 * Pure, so the rules that decide what somebody's result says about them are
 * testable exhaustively. This is the assessment equivalent of the attendance
 * projection: a wrong number here is not a bug anyone spots, it is a wrong
 * conclusion about a person.
 */

const single = (id: string, points = 1): ScorableQuestion => ({
  id,
  kind: AssessmentQuestionKind.SINGLE_CHOICE,
  points,
  options: [
    { id: `${id}_a`, isCorrect: true },
    { id: `${id}_b`, isCorrect: false },
    { id: `${id}_c`, isCorrect: false },
  ],
});

const multi = (id: string, points = 2): ScorableQuestion => ({
  id,
  kind: AssessmentQuestionKind.MULTI_CHOICE,
  points,
  options: [
    { id: `${id}_a`, isCorrect: true },
    { id: `${id}_b`, isCorrect: true },
    { id: `${id}_c`, isCorrect: false },
  ],
});

const free = (id: string): ScorableQuestion => ({
  id,
  kind: AssessmentQuestionKind.FREE_TEXT,
  points: 5,
  options: [],
});

describe("one correct answer", () => {
  it("awards the points for the right option", () => {
    const result = scoreResponse([single("q1")], [{ questionId: "q1", selectedOptionIds: ["q1_a"] }]);
    expect(result.scoredPoints).toBe(1);
    expect(result.maxPoints).toBe(1);
    expect(result.percent).toBe(100);
  });

  it("awards nothing for the wrong option", () => {
    const result = scoreResponse([single("q1")], [{ questionId: "q1", selectedOptionIds: ["q1_b"] }]);
    expect(result.scoredPoints).toBe(0);
    expect(result.perQuestion[0]!.correct).toBe(false);
  });

  // Selecting the right answer plus a wrong one is not a right answer.
  it("awards nothing when a correct option is chosen alongside a wrong one", () => {
    const result = scoreResponse(
      [single("q1")],
      [{ questionId: "q1", selectedOptionIds: ["q1_a", "q1_b"] }],
    );
    expect(result.scoredPoints).toBe(0);
  });

  it("treats no answer as wrong, not as absent", () => {
    const result = scoreResponse([single("q1")], []);
    expect(result.scoredPoints).toBe(0);
    expect(result.maxPoints).toBe(1);
    expect(result.perQuestion[0]!.answered).toBe(false);
  });
});

describe("several correct answers", () => {
  it("awards the points only for the exact set", () => {
    const result = scoreResponse(
      [multi("q1")],
      [{ questionId: "q1", selectedOptionIds: ["q1_a", "q1_b"] }],
    );
    expect(result.scoredPoints).toBe(2);
  });

  it("does not accept order as a difference", () => {
    const result = scoreResponse(
      [multi("q1")],
      [{ questionId: "q1", selectedOptionIds: ["q1_b", "q1_a"] }],
    );
    expect(result.scoredPoints).toBe(2);
  });

  /*
    All-or-nothing, deliberately. Half marks for one of two correct options
    rewards guessing broadly — and under partial credit, selecting everything
    would score higher than answering carefully.
  */
  it("awards nothing for a partially correct set", () => {
    const result = scoreResponse([multi("q1")], [{ questionId: "q1", selectedOptionIds: ["q1_a"] }]);
    expect(result.scoredPoints).toBe(0);
  });

  it("awards nothing for selecting everything", () => {
    const result = scoreResponse(
      [multi("q1")],
      [{ questionId: "q1", selectedOptionIds: ["q1_a", "q1_b", "q1_c"] }],
    );
    expect(result.scoredPoints).toBe(0);
  });

  it("ignores a duplicated selection rather than miscounting it", () => {
    const result = scoreResponse(
      [multi("q1")],
      [{ questionId: "q1", selectedOptionIds: ["q1_a", "q1_a", "q1_b"] }],
    );
    expect(result.scoredPoints).toBe(2);
  });
});

describe("written answers", () => {
  /*
    Excluded from the maximum, not scored as zero. Counting them would put
    every score out of a total nobody could reach, so 12/20 would mean 12/15
    and read as worse than it was.
  */
  it("are left out of the total entirely", () => {
    const result = scoreResponse(
      [single("q1"), free("q2")],
      [
        { questionId: "q1", selectedOptionIds: ["q1_a"] },
        { questionId: "q2", selectedOptionIds: [], text: "Because the policy says so." },
      ],
    );
    expect(result.maxPoints).toBe(1);
    expect(result.scoredPoints).toBe(1);
    expect(result.percent).toBe(100);
  });

  it("record whether anything was written, for a human to read", () => {
    const result = scoreResponse(
      [free("q1")],
      [{ questionId: "q1", selectedOptionIds: [], text: "  " }],
    );
    expect(result.perQuestion[0]!.answered).toBe(false);
    expect(result.perQuestion[0]!.correct).toBeNull();
  });
});

describe("odd inputs that must not produce an odd score", () => {
  it("ignores option ids belonging to another question", () => {
    const result = scoreResponse(
      [single("q1")],
      [{ questionId: "q1", selectedOptionIds: ["q9_a"] }],
    );
    expect(result.scoredPoints).toBe(0);
  });

  it("awards nothing for a question with no correct option", () => {
    const broken: ScorableQuestion = {
      id: "q1",
      kind: AssessmentQuestionKind.SINGLE_CHOICE,
      points: 3,
      options: [{ id: "q1_a", isCorrect: false }],
    };
    const result = scoreResponse([broken], [{ questionId: "q1", selectedOptionIds: ["q1_a"] }]);
    expect(result.scoredPoints).toBe(0);
    // Still counted in the maximum: the question was asked.
    expect(result.maxPoints).toBe(3);
  });

  // A negative weight would let one question pull a total below what was
  // earned elsewhere, which no author intends.
  it("clamps negative points to zero", () => {
    const result = scoreResponse(
      [single("q1", -5)],
      [{ questionId: "q1", selectedOptionIds: ["q1_a"] }],
    );
    expect(result.scoredPoints).toBe(0);
    expect(result.maxPoints).toBe(0);
  });

  it("reports no percentage rather than 0% when nothing was scorable", () => {
    expect(scoreResponse([free("q1")], []).percent).toBeNull();
    expect(scoreResponse([], []).percent).toBeNull();
  });

  it("rounds a percentage to a whole number", () => {
    const result = scoreResponse(
      [single("q1"), single("q2"), single("q3")],
      [{ questionId: "q1", selectedOptionIds: ["q1_a"] }],
    );
    expect(result.scoredPoints).toBe(1);
    expect(result.maxPoints).toBe(3);
    expect(result.percent).toBe(33);
  });
});

describe("required questions", () => {
  const required = (q: ScorableQuestion) => ({ ...q, required: true });
  const optional = (q: ScorableQuestion) => ({ ...q, required: false });

  it("lists the ones with nothing selected", () => {
    expect(unansweredRequired([required(single("q1")), required(single("q2"))], [
      { questionId: "q1", selectedOptionIds: ["q1_a"] },
    ])).toEqual(["q2"]);
  });

  it("counts whitespace in a written answer as unanswered", () => {
    expect(
      unansweredRequired([required(free("q1"))], [{ questionId: "q1", selectedOptionIds: [], text: "   " }]),
    ).toEqual(["q1"]);
  });

  it("leaves optional questions alone", () => {
    expect(unansweredRequired([optional(single("q1"))], [])).toEqual([]);
  });
});
