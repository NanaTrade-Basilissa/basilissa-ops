import "server-only";
import { AptitudeTestStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";

const log = scoped("aptitude.authoring");

/**
 * HR-side editing. Same DRAFT-is-fully-editable /
 * publishing-freezes-structure-and-scoring rule as Assessments — see that
 * module's `authoring.ts` for the full reasoning, which applies unchanged
 * here: two candidates who sat "the same" test must have sat the same test.
 */

export type AuthoringFailure =
  | "NOT_FOUND"
  | "NOT_DRAFT"
  | "ALREADY_PUBLISHED"
  | "NOTHING_TO_PUBLISH"
  | "QUESTION_WITHOUT_ANSWER";

export type AuthoringFailureResult = {
  ok: false;
  reason: AuthoringFailure;
  message: string;
};

export type AuthoringOutcome<T = undefined> = { ok: true; value: T } | AuthoringFailureResult;

function fail(reason: AuthoringFailure, message: string): AuthoringFailureResult {
  return { ok: false, reason, message };
}

const DONE = { ok: true as const, value: undefined };

async function refuseUnlessDraft(testId: string): Promise<AuthoringFailureResult | null> {
  const test = await prisma.aptitudeTest.findUnique({
    where: { id: testId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!test || test.deletedAt) return fail("NOT_FOUND", "No such aptitude test.");
  if (test.status !== AptitudeTestStatus.DRAFT) {
    return fail(
      "NOT_DRAFT",
      "This is published, so its questions and scoring cannot change. " +
        "Two candidates who sat the same test must have sat the same test.",
    );
  }
  return null;
}

export async function createAptitudeTest(
  input: { title: string; description?: string | null; showScoreToCandidate: boolean },
  actor: AuditActor,
): Promise<{ ok: true; testId: string }> {
  const created = await prisma.aptitudeTest.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      showScoreToCandidate: input.showScoreToCandidate,
      createdBy: actor.userId,
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "aptitude.test_created",
    entityType: "AptitudeTest",
    entityId: created.id,
    after: { title: input.title.trim(), showScoreToCandidate: input.showScoreToCandidate },
  });

  log.info("aptitude test created", { testId: created.id });
  return { ok: true, testId: created.id };
}

/**
 * Title, description, score visibility, pass mark, expiry and the time limit
 * all stay editable after publishing. Safe for the time limit specifically
 * because `deadlineAt` is snapshotted per-attempt at start, not read live
 * from the test — changing it here never moves the goalposts for someone
 * already partway through.
 */
export async function updateAptitudeTestDetails(
  testId: string,
  input: {
    title: string;
    description?: string | null;
    showScoreToCandidate: boolean;
    passMarkPercent?: number;
    invitationsExpire?: boolean;
    invitationTtlHours?: number;
    timeLimitMinutes?: number;
  },
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const before = await prisma.aptitudeTest.findUnique({
    where: { id: testId },
    select: {
      title: true,
      description: true,
      showScoreToCandidate: true,
      passMarkPercent: true,
      invitationsExpire: true,
      invitationTtlHours: true,
      timeLimitMinutes: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!before || before.deletedAt) return fail("NOT_FOUND", "No such aptitude test.");
  if (before.status === AptitudeTestStatus.CLOSED) {
    return fail("NOT_DRAFT", "This test is closed.");
  }

  await prisma.aptitudeTest.update({
    where: { id: testId },
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      showScoreToCandidate: input.showScoreToCandidate,
      passMarkPercent: input.passMarkPercent ?? null,
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      ...(input.invitationsExpire !== undefined ? { invitationsExpire: input.invitationsExpire } : {}),
      ...(input.invitationTtlHours !== undefined ? { invitationTtlHours: input.invitationTtlHours } : {}),
    },
  });

  await recordAudit({
    actor,
    action: "aptitude.test_updated",
    entityType: "AptitudeTest",
    entityId: testId,
    before,
    after: input as unknown as Prisma.InputJsonValue,
  });
  return DONE;
}

export async function addSection(
  testId: string,
  input: { title: string; description?: string | null },
  actor: AuditActor,
): Promise<AuthoringOutcome<string>> {
  const refusal = await refuseUnlessDraft(testId);
  if (refusal) return refusal;

  const last = await prisma.aptitudeSection.findFirst({
    where: { testId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const section = await prisma.aptitudeSection.create({
    data: {
      testId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      order: (last?.order ?? 0) + 1,
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "aptitude.section_added",
    entityType: "AptitudeTest",
    entityId: testId,
    after: { sectionId: section.id, title: input.title.trim() },
  });
  return { ok: true, value: section.id };
}

export async function addQuestion(
  sectionId: string,
  input: {
    kind: "SINGLE_CHOICE" | "MULTI_CHOICE" | "FREE_TEXT";
    text: string;
    points: number;
    required: boolean;
    options: { text: string; isCorrect: boolean }[];
  },
  actor: AuditActor,
): Promise<AuthoringOutcome<string>> {
  const section = await prisma.aptitudeSection.findUnique({
    where: { id: sectionId },
    select: { id: true, testId: true },
  });
  if (!section) return fail("NOT_FOUND", "No such section.");

  const refusal = await refuseUnlessDraft(section.testId);
  if (refusal) return refusal;

  if (input.kind !== "FREE_TEXT" && !input.options.some((o) => o.isCorrect)) {
    return fail(
      "QUESTION_WITHOUT_ANSWER",
      "Mark at least one option as correct, or make this a written answer.",
    );
  }

  const last = await prisma.aptitudeQuestion.findFirst({
    where: { sectionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const question = await prisma.aptitudeQuestion.create({
    data: {
      sectionId,
      kind: input.kind,
      text: input.text.trim(),
      points: Math.max(0, input.points),
      required: input.required,
      order: (last?.order ?? 0) + 1,
      options:
        input.kind === "FREE_TEXT"
          ? undefined
          : {
              create: input.options.map((option, index) => ({
                text: option.text.trim(),
                isCorrect: option.isCorrect,
                order: index + 1,
              })),
            },
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "aptitude.question_added",
    entityType: "AptitudeTest",
    entityId: section.testId,
    after: {
      questionId: question.id,
      sectionId,
      kind: input.kind,
      points: input.points,
      correctOptions: input.options.filter((o) => o.isCorrect).map((o) => o.text.trim()),
    },
  });
  return { ok: true, value: question.id };
}

export async function deleteQuestion(questionId: string, actor: AuditActor): Promise<AuthoringOutcome> {
  const question = await prisma.aptitudeQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, text: true, section: { select: { testId: true } } },
  });
  if (!question) return fail("NOT_FOUND", "No such question.");

  const refusal = await refuseUnlessDraft(question.section.testId);
  if (refusal) return refusal;

  await prisma.aptitudeQuestion.delete({ where: { id: questionId } });
  await recordAudit({
    actor,
    action: "aptitude.question_removed",
    entityType: "AptitudeTest",
    entityId: question.section.testId,
    before: { questionId, text: question.text },
  });
  return DONE;
}

/**
 * Freezes the test and opens it for invitations. Checked rather than
 * trusted, same reasoning as Assessments: an empty test, or one whose scored
 * questions have no correct option, produces meaningless results and there
 * is no way to fix it afterwards without invalidating everyone who already
 * sat it.
 */
export async function publishAptitudeTest(testId: string, actor: AuditActor): Promise<AuthoringOutcome> {
  const test = await prisma.aptitudeTest.findUnique({
    where: { id: testId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      sections: {
        select: {
          questions: {
            select: { id: true, kind: true, text: true, options: { select: { isCorrect: true } } },
          },
        },
      },
    },
  });
  if (!test || test.deletedAt) return fail("NOT_FOUND", "No such aptitude test.");
  if (test.status !== AptitudeTestStatus.DRAFT) {
    return fail("ALREADY_PUBLISHED", "This has already been published.");
  }

  const questions = test.sections.flatMap((s) => s.questions);
  if (questions.length === 0) {
    return fail("NOTHING_TO_PUBLISH", "Add at least one question first.");
  }

  const unanswerable = questions.filter(
    (q) => q.kind !== "FREE_TEXT" && !q.options.some((o) => o.isCorrect),
  );
  if (unanswerable.length > 0) {
    return fail(
      "QUESTION_WITHOUT_ANSWER",
      `${unanswerable.length} scored ${unanswerable.length === 1 ? "question has" : "questions have"} no correct option marked.`,
    );
  }

  await prisma.aptitudeTest.update({
    where: { id: testId },
    data: { status: AptitudeTestStatus.PUBLISHED, publishedAt: new Date() },
  });

  await recordAudit({
    actor,
    action: "aptitude.test_published",
    entityType: "AptitudeTest",
    entityId: testId,
    after: { questionCount: questions.length },
  });

  log.info("aptitude test published", { testId, questionCount: questions.length });
  return DONE;
}

/** Stops new invitations and submissions. Existing results stay readable. */
export async function closeAptitudeTest(testId: string, actor: AuditActor): Promise<AuthoringOutcome> {
  const test = await prisma.aptitudeTest.findUnique({ where: { id: testId }, select: { id: true, status: true } });
  if (!test) return fail("NOT_FOUND", "No such aptitude test.");
  if (test.status === AptitudeTestStatus.CLOSED) return DONE;

  await prisma.aptitudeTest.update({
    where: { id: testId },
    data: { status: AptitudeTestStatus.CLOSED, closedAt: new Date() },
  });
  await recordAudit({ actor, action: "aptitude.test_closed", entityType: "AptitudeTest", entityId: testId });
  return DONE;
}

/** Soft delete. Same reasoning as Assessments' `deleteAssessment`. */
export async function deleteAptitudeTest(testId: string, actor: AuditActor): Promise<AuthoringOutcome> {
  const test = await prisma.aptitudeTest.findUnique({ where: { id: testId }, select: { title: true, deletedAt: true } });
  if (!test || test.deletedAt) return fail("NOT_FOUND", "No such aptitude test.");

  await prisma.aptitudeTest.update({ where: { id: testId }, data: { deletedAt: new Date() } });
  await recordAudit({
    actor,
    action: "aptitude.test_deleted",
    entityType: "AptitudeTest",
    entityId: testId,
    before: { title: test.title },
  });
  return DONE;
}
