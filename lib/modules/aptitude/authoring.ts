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
  | "QUESTION_WITHOUT_ANSWER"
  | "NOT_PUBLISHED"
  | "NOT_CLOSED"
  | "HAS_ATTEMPTS";

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
    clearSectionTimers?: boolean;
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

  await prisma.$transaction(async (tx) => {
    await tx.aptitudeTest.update({
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

    if (input.clearSectionTimers) {
      await tx.aptitudeSection.updateMany({
        where: { testId },
        data: { timeLimitMinutes: null },
      });
    }
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
  input: {
    title: string;
    description?: string | null;
    timeLimitMinutes?: number | null;
    overrideOverallTime?: boolean;
  },
  actor: AuditActor,
): Promise<AuthoringOutcome<string>> {
  const refusal = await refuseUnlessDraft(testId);
  if (refusal) return refusal;

  const test = await prisma.aptitudeTest.findUnique({
    where: { id: testId },
    select: {
      timeLimitMinutes: true,
      sections: { select: { timeLimitMinutes: true } },
    },
  });

  const last = await prisma.aptitudeSection.findFirst({
    where: { testId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const existingSectionsTotal = test?.sections.reduce((sum, s) => sum + (s.timeLimitMinutes ?? 0), 0) ?? 0;
  const newCombinedTotal = existingSectionsTotal + (input.timeLimitMinutes ?? 0);
  const shouldBumpOverall =
    Boolean(input.overrideOverallTime) &&
    input.timeLimitMinutes != null &&
    test?.timeLimitMinutes != null &&
    newCombinedTotal > test.timeLimitMinutes;

  const section = await prisma.$transaction(async (tx) => {
    const created = await tx.aptitudeSection.create({
      data: {
        testId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        timeLimitMinutes: input.timeLimitMinutes ?? null,
        order: (last?.order ?? 0) + 1,
      },
      select: { id: true },
    });

    if (shouldBumpOverall) {
      await tx.aptitudeTest.update({
        where: { id: testId },
        data: { timeLimitMinutes: newCombinedTotal },
      });
    }

    return created;
  });

  await recordAudit({
    actor,
    action: "aptitude.section_added",
    entityType: "AptitudeTest",
    entityId: testId,
    after: {
      sectionId: section.id,
      title: input.title.trim(),
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      bumpedOverallTimerTo: shouldBumpOverall ? newCombinedTotal : undefined,
    },
  });
  return { ok: true, value: section.id };
}

export async function updateSection(
  sectionId: string,
  input: {
    title: string;
    description?: string | null;
    timeLimitMinutes?: number | null;
    overrideOverallTime?: boolean;
  },
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const section = await prisma.aptitudeSection.findUnique({
    where: { id: sectionId },
    select: { id: true, title: true, description: true, timeLimitMinutes: true, testId: true },
  });
  if (!section) return fail("NOT_FOUND", "No such section.");

  const refusal = await refuseUnlessDraft(section.testId);
  if (refusal) return refusal;

  const test = await prisma.aptitudeTest.findUnique({
    where: { id: section.testId },
    select: {
      timeLimitMinutes: true,
      sections: {
        where: { id: { not: sectionId } },
        select: { timeLimitMinutes: true },
      },
    },
  });

  const otherSectionsTotal = test?.sections.reduce((sum, s) => sum + (s.timeLimitMinutes ?? 0), 0) ?? 0;
  const newCombinedTotal = otherSectionsTotal + (input.timeLimitMinutes ?? 0);
  const shouldBumpOverall =
    Boolean(input.overrideOverallTime) &&
    input.timeLimitMinutes != null &&
    test?.timeLimitMinutes != null &&
    newCombinedTotal > test.timeLimitMinutes;

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.aptitudeSection.update({
      where: { id: sectionId },
      data: {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        timeLimitMinutes: input.timeLimitMinutes ?? null,
      },
      select: { title: true, description: true, timeLimitMinutes: true },
    });

    if (shouldBumpOverall) {
      await tx.aptitudeTest.update({
        where: { id: section.testId },
        data: { timeLimitMinutes: newCombinedTotal },
      });
    }

    return updated;
  });

  await recordAudit({
    actor,
    action: "aptitude.section_updated",
    entityType: "AptitudeTest",
    entityId: section.testId,
    before: { title: section.title, description: section.description, timeLimitMinutes: section.timeLimitMinutes },
    after: { ...after, bumpedOverallTimerTo: shouldBumpOverall ? newCombinedTotal : undefined },
  });
  return DONE;
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

export async function updateQuestion(
  questionId: string,
  input: {
    kind: "SINGLE_CHOICE" | "MULTI_CHOICE" | "FREE_TEXT";
    text: string;
    points: number;
    required: boolean;
    options: { text: string; isCorrect: boolean }[];
  },
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const question = await prisma.aptitudeQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      kind: true,
      text: true,
      points: true,
      required: true,
      section: { select: { testId: true } },
    },
  });
  if (!question) return fail("NOT_FOUND", "No such question.");

  const refusal = await refuseUnlessDraft(question.section.testId);
  if (refusal) return refusal;

  if (input.kind !== "FREE_TEXT" && !input.options.some((o) => o.isCorrect)) {
    return fail(
      "QUESTION_WITHOUT_ANSWER",
      "Mark at least one option as correct, or make this a written answer.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.aptitudeOption.deleteMany({ where: { questionId } });
    await tx.aptitudeQuestion.update({
      where: { id: questionId },
      data: {
        kind: input.kind,
        text: input.text.trim(),
        points: input.kind === "FREE_TEXT" ? 0 : Math.max(0, input.points),
        required: input.required,
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
    });
  });

  await recordAudit({
    actor,
    action: "aptitude.question_updated",
    entityType: "AptitudeTest",
    entityId: question.section.testId,
    before: {
      questionId,
      kind: question.kind,
      text: question.text,
      points: question.points,
      required: question.required,
    },
    after: {
      questionId,
      kind: input.kind,
      text: input.text.trim(),
      points: input.points,
      required: input.required,
      correctOptions: input.options.filter((o) => o.isCorrect).map((o) => o.text.trim()),
    },
  });

  return DONE;
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

/**
 * Reverts a published test to DRAFT status if and only if no candidate attempts
 * have been made yet (attemptCount === 0). Once in draft, questions, sections,
 * and options can be edited freely again.
 */
export async function unpublishAptitudeTest(testId: string, actor: AuditActor): Promise<AuthoringOutcome> {
  const test = await prisma.aptitudeTest.findUnique({
    where: { id: testId },
    select: { id: true, title: true, status: true, deletedAt: true },
  });
  if (!test || test.deletedAt) return fail("NOT_FOUND", "No such aptitude test.");
  if (test.status !== AptitudeTestStatus.PUBLISHED) {
    return fail("NOT_PUBLISHED", "Only published tests can be reverted to draft.");
  }

  const attemptCount = await prisma.aptitudeAttempt.count({
    where: { invitation: { testId } },
  });
  if (attemptCount > 0) {
    return fail(
      "HAS_ATTEMPTS",
      `Cannot unpublish this test because ${attemptCount} candidate ${attemptCount === 1 ? "attempt has" : "attempts have"} already been recorded. Duplicate the test as a new draft to make changes.`,
    );
  }

  await prisma.aptitudeTest.update({
    where: { id: testId },
    data: { status: AptitudeTestStatus.DRAFT, publishedAt: null },
  });

  await recordAudit({
    actor,
    action: "aptitude.test_unpublished",
    entityType: "AptitudeTest",
    entityId: testId,
    before: { status: test.status },
    after: { status: AptitudeTestStatus.DRAFT },
  });

  log.info("aptitude test reverted to draft", { testId });
  return DONE;
}

/** Reopens a CLOSED test back to PUBLISHED status to resume accepting submissions. */
export async function reopenAptitudeTest(testId: string, actor: AuditActor): Promise<AuthoringOutcome> {
  const test = await prisma.aptitudeTest.findUnique({
    where: { id: testId },
    select: { id: true, title: true, status: true, deletedAt: true },
  });
  if (!test || test.deletedAt) return fail("NOT_FOUND", "No such aptitude test.");
  if (test.status !== AptitudeTestStatus.CLOSED) {
    return fail("NOT_CLOSED", "Only closed tests can be reopened.");
  }

  await prisma.aptitudeTest.update({
    where: { id: testId },
    data: { status: AptitudeTestStatus.PUBLISHED, closedAt: null },
  });

  await recordAudit({
    actor,
    action: "aptitude.test_reopened",
    entityType: "AptitudeTest",
    entityId: testId,
    before: { status: test.status },
    after: { status: AptitudeTestStatus.PUBLISHED },
  });

  log.info("aptitude test reopened", { testId });
  return DONE;
}

/**
 * Creates a complete copy of an existing test in DRAFT status, deep-cloning
 * all sections, questions, and options. Preserves historical attempt integrity
 * for the original test while giving HR a clean slate to edit questions for a new cycle.
 */
export async function duplicateAptitudeTest(
  testId: string,
  actor: AuditActor,
): Promise<AuthoringOutcome<{ newTestId: string }>> {
  const source = await prisma.aptitudeTest.findUnique({
    where: { id: testId },
    select: {
      title: true,
      description: true,
      showScoreToCandidate: true,
      passMarkPercent: true,
      timeLimitMinutes: true,
      invitationsExpire: true,
      invitationTtlHours: true,
      publicLinkNameMode: true,
      publicLinkEmailMode: true,
      deletedAt: true,
      sections: {
        orderBy: { order: "asc" },
        select: {
          title: true,
          description: true,
          order: true,
          timeLimitMinutes: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              kind: true,
              text: true,
              order: true,
              points: true,
              required: true,
              options: {
                orderBy: { order: "asc" },
                select: {
                  text: true,
                  order: true,
                  isCorrect: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!source || source.deletedAt) return fail("NOT_FOUND", "No such aptitude test.");

  const copyTitle = `${source.title} (Copy)`.slice(0, 150);

  const created = await prisma.aptitudeTest.create({
    data: {
      title: copyTitle,
      description: source.description,
      showScoreToCandidate: source.showScoreToCandidate,
      passMarkPercent: source.passMarkPercent,
      timeLimitMinutes: source.timeLimitMinutes,
      invitationsExpire: source.invitationsExpire,
      invitationTtlHours: source.invitationTtlHours,
      publicLinkEnabled: false,
      publicLinkNameMode: source.publicLinkNameMode,
      publicLinkEmailMode: source.publicLinkEmailMode,
      status: AptitudeTestStatus.DRAFT,
      createdBy: actor.userId,
      sections: {
        create: source.sections.map((sec) => ({
          title: sec.title,
          description: sec.description,
          order: sec.order,
          timeLimitMinutes: sec.timeLimitMinutes,
          questions: {
            create: sec.questions.map((q) => ({
              kind: q.kind,
              text: q.text,
              order: q.order,
              points: q.points,
              required: q.required,
              options: {
                create: q.options.map((opt) => ({
                  text: opt.text,
                  order: opt.order,
                  isCorrect: opt.isCorrect,
                })),
              },
            })),
          },
        })),
      },
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "aptitude.test_duplicated",
    entityType: "AptitudeTest",
    entityId: created.id,
    before: { sourceTestId: testId },
    after: { title: copyTitle },
  });

  log.info("aptitude test duplicated", { sourceTestId: testId, newTestId: created.id });
  return { ok: true, value: { newTestId: created.id } };
}

