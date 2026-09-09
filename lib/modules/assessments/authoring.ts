import "server-only";
import { AssessmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";

const log = scoped("assessments.authoring");

/**
 * HR-side editing.
 *
 * A DRAFT is fully editable. Publishing freezes structure and scoring — the
 * questions, the options, which options are correct, and the points — because
 * two people who sat "the same" assessment must have sat the same assessment.
 * Wording stays editable, so a typo can be fixed without invalidating results.
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

export type AuthoringOutcome<T = undefined> =
  | { ok: true; value: T }
  | AuthoringFailureResult;

function fail(reason: AuthoringFailure, message: string): AuthoringFailureResult {
  return { ok: false, reason, message };
}

const DONE = { ok: true as const, value: undefined };

/**
 * Structural edits are refused once published. Wording is not structural.
 *
 * Returns the refusal, or null when editing is allowed — a nullable result
 * reads better at the call site than a wrapper object that has to be unpacked.
 */
async function refuseUnlessDraft(assessmentId: string): Promise<AuthoringFailureResult | null> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, status: true, deletedAt: true },
  });
  // A Server Action is reachable by direct POST — the detail page already
  // 404s a deleted assessment, but this is the actual boundary.
  if (!assessment || assessment.deletedAt) return fail("NOT_FOUND", "No such assessment.");
  if (assessment.status !== AssessmentStatus.DRAFT) {
    return fail(
      "NOT_DRAFT",
      "This is published, so its questions and scoring cannot change. " +
        "Two people who sat the same assessment must have sat the same assessment.",
    );
  }
  return null;
}

export async function createAssessment(
  input: { title: string; description?: string | null; showScoreToTaker: boolean },
  actor: AuditActor,
): Promise<{ ok: true; assessmentId: string }> {
  const created = await prisma.assessment.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      showScoreToTaker: input.showScoreToTaker,
      createdBy: actor.userId,
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "assessment.created",
    entityType: "Assessment",
    entityId: created.id,
    after: { title: input.title.trim(), showScoreToTaker: input.showScoreToTaker },
  });

  log.info("assessment created", { assessmentId: created.id });
  return { ok: true, assessmentId: created.id };
}

/**
 * Title, description, score visibility and the pass mark stay editable after
 * publishing.
 *
 * The pass mark is deliberately not settable at creation (`createAssessment`
 * takes no such input) — a threshold is meaningless before the points it is a
 * threshold OF exist, and they don't until questions are added.
 */
export async function updateAssessmentDetails(
  assessmentId: string,
  input: {
    title: string;
    description?: string | null;
    showScoreToTaker: boolean;
    passMarkPercent?: number;
    /** Absent (create form) leaves the schema default — links expire — untouched. */
    invitationsExpire?: boolean;
    invitationTtlHours?: number;
  },
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const before = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      title: true,
      description: true,
      showScoreToTaker: true,
      passMarkPercent: true,
      invitationsExpire: true,
      invitationTtlHours: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!before || before.deletedAt) return fail("NOT_FOUND", "No such assessment.");
  if (before.status === AssessmentStatus.CLOSED) {
    return fail("NOT_DRAFT", "This assessment is closed.");
  }

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      showScoreToTaker: input.showScoreToTaker,
      passMarkPercent: input.passMarkPercent ?? null,
      ...(input.invitationsExpire !== undefined ? { invitationsExpire: input.invitationsExpire } : {}),
      ...(input.invitationTtlHours !== undefined ? { invitationTtlHours: input.invitationTtlHours } : {}),
    },
  });

  await recordAudit({
    actor,
    action: "assessment.updated",
    entityType: "Assessment",
    entityId: assessmentId,
    before,
    after: input as unknown as Prisma.InputJsonValue,
  });
  return DONE;
}

export async function addSection(
  assessmentId: string,
  input: { title: string; description?: string | null },
  actor: AuditActor,
): Promise<AuthoringOutcome<string>> {
  const refusal = await refuseUnlessDraft(assessmentId);
  if (refusal) return refusal;

  const last = await prisma.assessmentSection.findFirst({
    where: { assessmentId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const section = await prisma.assessmentSection.create({
    data: {
      assessmentId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      order: (last?.order ?? 0) + 1,
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "assessment.section_added",
    entityType: "Assessment",
    entityId: assessmentId,
    after: { sectionId: section.id, title: input.title.trim() },
  });
  return { ok: true, value: section.id };
}

export async function updateSection(
  sectionId: string,
  input: { title: string; description?: string | null },
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const section = await prisma.assessmentSection.findUnique({
    where: { id: sectionId },
    select: { id: true, title: true, description: true, assessmentId: true },
  });
  if (!section) return fail("NOT_FOUND", "No such section.");

  const refusal = await refuseUnlessDraft(section.assessmentId);
  if (refusal) return refusal;

  const after = await prisma.assessmentSection.update({
    where: { id: sectionId },
    data: { title: input.title.trim(), description: input.description?.trim() || null },
    select: { title: true, description: true },
  });

  await recordAudit({
    actor,
    action: "assessment.section_updated",
    entityType: "Assessment",
    entityId: section.assessmentId,
    before: { title: section.title, description: section.description },
    after,
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
  const section = await prisma.assessmentSection.findUnique({
    where: { id: sectionId },
    select: { id: true, assessmentId: true },
  });
  if (!section) return fail("NOT_FOUND", "No such section.");

  const refusal = await refuseUnlessDraft(section.assessmentId);
  if (refusal) return refusal;

  // A scored question with no correct option can never be answered correctly,
  // and would silently drag every score down.
  if (input.kind !== "FREE_TEXT" && !input.options.some((o) => o.isCorrect)) {
    return fail(
      "QUESTION_WITHOUT_ANSWER",
      "Mark at least one option as correct, or make this a written answer.",
    );
  }

  const last = await prisma.assessmentQuestion.findFirst({
    where: { sectionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const question = await prisma.assessmentQuestion.create({
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
    action: "assessment.question_added",
    entityType: "Assessment",
    entityId: section.assessmentId,
    after: {
      questionId: question.id,
      sectionId,
      kind: input.kind,
      points: input.points,
      // The answer key is recorded in the audit trail deliberately: a dispute
      // about a score is a dispute about what the key said at the time.
      correctOptions: input.options.filter((o) => o.isCorrect).map((o) => o.text.trim()),
    },
  });
  return { ok: true, value: question.id };
}

export async function deleteQuestion(
  questionId: string,
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const question = await prisma.assessmentQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, text: true, section: { select: { assessmentId: true } } },
  });
  if (!question) return fail("NOT_FOUND", "No such question.");

  const refusal = await refuseUnlessDraft(question.section.assessmentId);
  if (refusal) return refusal;

  await prisma.assessmentQuestion.delete({ where: { id: questionId } });
  await recordAudit({
    actor,
    action: "assessment.question_removed",
    entityType: "Assessment",
    entityId: question.section.assessmentId,
    before: { questionId, text: question.text },
  });
  return DONE;
}

/**
 * Freezes the assessment and opens it for invitations.
 *
 * Checked rather than trusted: an empty assessment, or one whose scored
 * questions have no correct option, produces meaningless results and there is
 * no way to fix it afterwards without invalidating everyone who already sat it.
 */
export async function publishAssessment(
  assessmentId: string,
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      sections: {
        select: {
          questions: {
            select: {
              id: true,
              kind: true,
              text: true,
              options: { select: { isCorrect: true } },
            },
          },
        },
      },
    },
  });
  if (!assessment || assessment.deletedAt) return fail("NOT_FOUND", "No such assessment.");
  if (assessment.status !== AssessmentStatus.DRAFT) {
    return fail("ALREADY_PUBLISHED", "This has already been published.");
  }

  const questions = assessment.sections.flatMap((s) => s.questions);
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

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { status: AssessmentStatus.PUBLISHED, publishedAt: new Date() },
  });

  await recordAudit({
    actor,
    action: "assessment.published",
    entityType: "Assessment",
    entityId: assessmentId,
    after: { questionCount: questions.length },
  });

  log.info("assessment published", { assessmentId, questionCount: questions.length });
  return DONE;
}

/** Stops new invitations and submissions. Existing results stay readable. */
export async function closeAssessment(
  assessmentId: string,
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, status: true },
  });
  if (!assessment) return fail("NOT_FOUND", "No such assessment.");
  if (assessment.status === AssessmentStatus.CLOSED) return DONE;

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { status: AssessmentStatus.CLOSED, closedAt: new Date() },
  });
  await recordAudit({
    actor,
    action: "assessment.closed",
    entityType: "Assessment",
    entityId: assessmentId,
  });
  return DONE;
}

/**
 * Soft delete: hides the assessment from every HR-facing list without
 * touching its rows. Invitations and responses point at it regardless of
 * `deletedAt`, so — unlike a hard delete — this is safe to do even once
 * people have started or finished taking it; nothing is lost, and a wrongly
 * deleted assessment is recoverable by clearing the column directly.
 */
export async function deleteAssessment(
  assessmentId: string,
  actor: AuditActor,
): Promise<AuthoringOutcome> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { title: true, deletedAt: true },
  });
  if (!assessment || assessment.deletedAt) return fail("NOT_FOUND", "No such assessment.");

  await prisma.assessment.update({ where: { id: assessmentId }, data: { deletedAt: new Date() } });
  await recordAudit({
    actor,
    action: "assessment.deleted",
    entityType: "Assessment",
    entityId: assessmentId,
    before: { title: assessment.title },
  });
  return DONE;
}
