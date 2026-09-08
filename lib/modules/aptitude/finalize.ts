import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { recordAuditBestEffort, SYSTEM_ACTOR } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { scoreResponse, type ScorableQuestion } from "./scoring";

const log = scoped("aptitude.finalize");

/**
 * Private to the module (not a `PUBLIC_ENTRIES` name) — imported directly by
 * both `taking.ts` (the candidate's own submit) and `jobs.ts` (the worker's
 * auto-submit sweep), so there is exactly one place that decides what
 * "done" means, and the worker never has to import anything request-scoped.
 */

export type FinalizeOutcome =
  | {
      ok: true;
      alreadyDone: boolean;
      autoSubmitted: boolean;
      scoredPoints: number;
      maxPoints: number;
      percent: number | null;
    }
  | { ok: false; reason: "NOT_FOUND" };

/**
 * Scores and finalises one attempt.
 *
 * `autoSubmitted` is computed here, not passed in by the caller: it is
 * simply whether the attempt's deadline had already passed at the moment of
 * finalising. That is true whether the deadline was crossed while the
 * candidate was still on the page (their own submit call lands here past the
 * deadline — `saveAnswer` already refused further writes, but a submit
 * always finalises whatever was saved) or while they were gone (the worker
 * sweep finds it later). Either way it means the same thing: time ran out
 * before they finished on their own, which is exactly what HR needs to be
 * able to tell apart from a real completion.
 *
 * Guarded against a double-finalise race the same way Assessments'
 * `submitResponse` is: a conditional `updateMany` claims the row only if it
 * is still unsubmitted, so a candidate's own submit racing the sweep (or two
 * sweep ticks racing each other) can never both score.
 */
export async function finalizeAttempt(attemptId: string): Promise<FinalizeOutcome> {
  const attempt = await prisma.aptitudeAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      submittedAt: true,
      deadlineAt: true,
      answers: { select: { questionId: true, selectedOptionIds: true, text: true } },
      invitation: {
        select: {
          id: true,
          test: {
            select: {
              id: true,
              sections: {
                select: {
                  questions: {
                    select: {
                      id: true,
                      kind: true,
                      points: true,
                      // Correctness IS selected here, and that is safe:
                      // nothing in this function is returned to the browser
                      // except totals.
                      options: { select: { id: true, isCorrect: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!attempt) return { ok: false, reason: "NOT_FOUND" };
  if (attempt.submittedAt) {
    return { ok: true, alreadyDone: true, autoSubmitted: false, scoredPoints: 0, maxPoints: 0, percent: null };
  }

  const questions: ScorableQuestion[] = attempt.invitation.test.sections.flatMap((section) =>
    section.questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      points: question.points,
      options: question.options,
    })),
  );
  const answers = attempt.answers.map((a) => ({
    questionId: a.questionId,
    selectedOptionIds: a.selectedOptionIds,
    text: a.text,
  }));

  const score = scoreResponse(questions, answers);
  const byQuestion = new Map(score.perQuestion.map((r) => [r.questionId, r]));
  const now = new Date();
  const autoSubmitted = attempt.deadlineAt !== null && attempt.deadlineAt <= now;

  let claimedCount = 0;
  await prisma
    .$transaction(async (tx) => {
      const claimed = await tx.aptitudeAttempt.updateMany({
        where: { id: attempt.id, submittedAt: null },
        data: {
          submittedAt: now,
          autoSubmitted,
          scoredPoints: score.scoredPoints,
          maxPoints: score.maxPoints,
        },
      });
      claimedCount = claimed.count;
      if (claimed.count === 0) return;

      for (const answer of attempt.answers) {
        const result = byQuestion.get(answer.questionId);
        if (!result) continue;
        await tx.aptitudeAnswer.update({
          where: { attemptId_questionId: { attemptId: attempt.id, questionId: answer.questionId } },
          data: { awardedPoints: result.awardedPoints, possiblePoints: result.possiblePoints },
        });
      }
    });

  if (claimedCount === 0) {
    // Lost the race to another finalise call (a sweep tick, or the
    // candidate's own submit landing at the same moment). Not an error —
    // report what is now there.
    return { ok: true, alreadyDone: true, autoSubmitted: false, scoredPoints: 0, maxPoints: 0, percent: null };
  }

  await recordAuditBestEffort({
    actor: autoSubmitted ? SYSTEM_ACTOR : { userId: null, email: null, role: null },
    action: autoSubmitted ? "aptitude.attempt_auto_submitted" : "aptitude.submitted",
    entityType: "AptitudeAttempt",
    entityId: attempt.id,
    metadata: {
      invitationId: attempt.invitation.id,
      testId: attempt.invitation.test.id,
      scoredPoints: score.scoredPoints,
      maxPoints: score.maxPoints,
    },
  });

  log.info(autoSubmitted ? "attempt auto-submitted" : "attempt submitted", {
    attemptId: attempt.id,
    scoredPoints: score.scoredPoints,
    maxPoints: score.maxPoints,
  });

  return {
    ok: true,
    alreadyDone: false,
    autoSubmitted,
    scoredPoints: score.scoredPoints,
    maxPoints: score.maxPoints,
    percent: score.percent,
  };
}
