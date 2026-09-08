import "server-only";
import { AssessmentQuestionKind, IdentityFieldMode } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAuditBestEffort } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { hashInvitationToken } from "./invitations";
import { scoreResponse, unansweredRequired, type ScorableQuestion } from "./scoring";
import { publicDeclarationSchema } from "./validation";
import { MAX_FREE_TEXT_LENGTH } from "./constants";

/** Fixed shape a personal, HR-issued invitation always uses. */
const PERSONAL_IDENTITY_MODES = { nameMode: IdentityFieldMode.REQUIRED, emailMode: IdentityFieldMode.OPTIONAL };

const log = scoped("assessments.taking");

/**
 * The public path: no sign-in, the link is the whole credential.
 *
 * THE ANSWER KEY MUST NOT LEAVE THIS FILE. Everything a taking page renders
 * comes from `loadForTaking`, whose select lists are written out longhand and
 * never include `isCorrect`. A React Server Component serialises the props it
 * passes to the client, so one careless `include` would publish the answers to
 * anyone who opens developer tools — and nothing would look wrong.
 *
 * `assessment-answer-key.test.ts` asserts the string never appears here.
 */

export type TakingFailure = "UNKNOWN" | "EXPIRED" | "REVOKED" | "ALREADY_SUBMITTED" | "CLOSED";

export type TakingQuestion = {
  id: string;
  kind: AssessmentQuestionKind;
  text: string;
  points: number;
  required: boolean;
  /** Never carries correctness. See the note above. */
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  text_answer: string | null;
};

export type TakingSection = {
  id: string;
  title: string;
  description: string | null;
  questions: TakingQuestion[];
};

export type TakingView = {
  invitationId: string;
  responseId: string;
  assessmentTitle: string;
  assessmentDescription: string | null;
  isPublic: boolean;
  inviteeName: string;
  declaredName: string | null;
  /** What the identity-declaration step should ask for — see `publicDeclarationSchema`. */
  identity: { nameMode: IdentityFieldMode; emailMode: IdentityFieldMode };
  sections: TakingSection[];
};

export type TakingOutcome =
  | { ok: true; view: TakingView }
  | { ok: false; reason: TakingFailure; message: string };

/**
 * Resolves a token to an attempt, creating the attempt on first open.
 *
 * Every refusal carries a distinct reason, unlike password reset. The
 * difference is who is asking: a reset link is probed by strangers, whereas
 * whoever holds this already has a valid link for a named person, and telling
 * them "this closed on Friday" saves a support conversation.
 */
export async function loadForTaking(token: string): Promise<TakingOutcome> {
  const invitation = await prisma.assessmentInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      inviteeName: true,
      isPublic: true,
      expiresAt: true,
      revokedAt: true,
      openedAt: true,
      assessment: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          publicLinkNameMode: true,
          publicLinkEmailMode: true,
          sections: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              questions: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  kind: true,
                  text: true,
                  points: true,
                  required: true,
                  options: {
                    orderBy: { order: "asc" },
                    // id and text only. Adding isCorrect here would publish
                    // the answer key in the page payload.
                    select: { id: true, text: true },
                  },
                },
              },
            },
          },
        },
      },
      response: {
        select: {
          id: true,
          submittedAt: true,
          declaredName: true,
          answers: { select: { questionId: true, selectedOptionIds: true, text: true } },
        },
      },
    },
  });

  if (!invitation) return { ok: false, reason: "UNKNOWN", message: "This link is not valid." };
  if (invitation.revokedAt) {
    return { ok: false, reason: "REVOKED", message: "This link has been withdrawn." };
  }
  if (invitation.response?.submittedAt) {
    return {
      ok: false,
      reason: "ALREADY_SUBMITTED",
      message: "This has already been completed. Thank you.",
    };
  }
  if (invitation.expiresAt && invitation.expiresAt <= new Date()) {
    return { ok: false, reason: "EXPIRED", message: "This link has expired." };
  }
  if (invitation.assessment.status !== "PUBLISHED") {
    return { ok: false, reason: "CLOSED", message: "This is no longer open." };
  }

  // Created on first open rather than when the invitation is issued, so
  // `startedAt` means what it says and an unopened link has no attempt at all.
  const response =
    invitation.response ??
    (await prisma.assessmentResponse.create({
      data: { invitationId: invitation.id },
      select: {
        id: true,
        submittedAt: true,
        declaredName: true,
        answers: { select: { questionId: true, selectedOptionIds: true, text: true } },
      },
    }));

  if (!invitation.openedAt) {
    await prisma.assessmentInvitation.update({
      where: { id: invitation.id },
      data: { openedAt: new Date() },
    });
  }

  const identity = invitation.isPublic
    ? { nameMode: invitation.assessment.publicLinkNameMode, emailMode: invitation.assessment.publicLinkEmailMode }
    : PERSONAL_IDENTITY_MODES;

  // Nothing to ask when both fields are hidden — skip straight past the
  // declaration step rather than showing an empty form. `declaredName` must
  // still end up non-null, or the step would show again on every reload; see
  // `publicDeclarationSchema` for why `""`, not `null`, is what "done" means.
  let declaredName = response.declaredName;
  if (declaredName === null && identity.nameMode === "HIDDEN" && identity.emailMode === "HIDDEN") {
    await prisma.assessmentResponse.update({
      where: { id: response.id },
      data: { declaredName: "", declaredEmail: "" },
    });
    declaredName = "";
  }

  const saved = new Map(response.answers.map((a) => [a.questionId, a]));

  return {
    ok: true,
    view: {
      invitationId: invitation.id,
      responseId: response.id,
      assessmentTitle: invitation.assessment.title,
      assessmentDescription: invitation.assessment.description,
      isPublic: invitation.isPublic,
      inviteeName: invitation.inviteeName,
      declaredName,
      identity,
      sections: invitation.assessment.sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        questions: section.questions.map((question) => ({
          id: question.id,
          kind: question.kind,
          text: question.text,
          points: question.points,
          required: question.required,
          options: question.options,
          selectedOptionIds: saved.get(question.id)?.selectedOptionIds ?? [],
          text_answer: saved.get(question.id)?.text ?? null,
        })),
      })),
    },
  };
}

/**
 * Records who the taker says they are.
 *
 * The token already decided that, so this is a declaration rather than an
 * identification. It is compared and the outcome recorded either way: a link
 * can be forwarded, and refusing a misspelt name would throw away a real
 * submission. HR decides what a mismatch means; the system only notices.
 */
export async function declareIdentity(
  token: string,
  raw: { name: unknown; email: unknown },
): Promise<{ ok: boolean; mismatch: boolean; error?: string }> {
  const invitation = await prisma.assessmentInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      inviteeName: true,
      inviteeEmail: true,
      isPublic: true,
      assessment: { select: { publicLinkNameMode: true, publicLinkEmailMode: true } },
      response: { select: { id: true, submittedAt: true } },
    },
  });
  if (!invitation?.response || invitation.response.submittedAt) {
    return { ok: false, mismatch: false };
  }

  const identity = invitation.isPublic
    ? { nameMode: invitation.assessment.publicLinkNameMode, emailMode: invitation.assessment.publicLinkEmailMode }
    : PERSONAL_IDENTITY_MODES;

  const parsed = publicDeclarationSchema(identity.nameMode, identity.emailMode).safeParse(raw);
  if (!parsed.success) {
    return { ok: false, mismatch: false, error: parsed.error.issues[0]?.message ?? "Check what you entered." };
  }
  const { name, email } = parsed.data;

  // A public attempt has nothing real to compare against — `inviteeName` is
  // just the "Public respondent" placeholder — so there is no mismatch
  // concept for it, only whatever was (optionally) given.
  const mismatch = invitation.isPublic
    ? false
    : !namesLookLikeTheSamePerson(name, invitation.inviteeName) ||
      (email !== "" && invitation.inviteeEmail !== null && email !== invitation.inviteeEmail);

  await prisma.assessmentResponse.update({
    where: { id: invitation.response.id },
    data: { declaredName: name, declaredEmail: email || null, identityMismatch: mismatch },
  });

  // A real name volunteered on a public attempt is worth keeping on the
  // invitation itself, so HR's invitation list shows something better than
  // the placeholder once somebody actually gives one.
  if (invitation.isPublic && name) {
    await prisma.assessmentInvitation.update({ where: { id: invitation.id }, data: { inviteeName: name } });
  }

  if (mismatch) {
    log.warn("identity declaration did not match the invitation", {
      invitationId: invitation.id,
    });
  }
  return { ok: true, mismatch };
}

/**
 * Compares loosely, on purpose.
 *
 * "ama mensah" and "Ama  Mensah" are the same person; a strict comparison
 * would flag half the submissions and teach HR to ignore the flag, which is
 * worse than not having one.
 */
function namesLookLikeTheSamePerson(a: string, b: string): boolean {
  const normalise = (value: string) =>
    value.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean).sort().join(" ");
  return normalise(a) === normalise(b);
}

/**
 * Saves one answer.
 *
 * Per answer rather than all at submission: this is taken on a phone, often on
 * a slow connection, and one lost request should cost one answer rather than
 * the whole attempt.
 */
export async function saveAnswer(
  token: string,
  input: { questionId: string; selectedOptionIds?: string[]; text?: string | null },
): Promise<{ ok: boolean }> {
  const invitation = await prisma.assessmentInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      assessment: { select: { id: true, status: true } },
      response: { select: { id: true, submittedAt: true } },
    },
  });

  if (
    !invitation?.response ||
    invitation.response.submittedAt ||
    invitation.revokedAt ||
    (invitation.expiresAt && invitation.expiresAt <= new Date()) ||
    invitation.assessment.status !== "PUBLISHED"
  ) {
    return { ok: false };
  }

  // The question must belong to THIS assessment. Without the check, a crafted
  // request could attach answers from another assessment to this attempt.
  const question = await prisma.assessmentQuestion.findFirst({
    where: { id: input.questionId, section: { assessmentId: invitation.assessment.id } },
    select: { id: true, kind: true, options: { select: { id: true } } },
  });
  if (!question) return { ok: false };

  const validOptionIds = new Set(question.options.map((o) => o.id));
  let selected = (input.selectedOptionIds ?? []).filter((id) => validOptionIds.has(id));

  // A single-choice question with several selections is a client fault; keep
  // the first rather than storing something the scorer will mark wrong for a
  // reason the taker cannot see.
  if (question.kind === AssessmentQuestionKind.SINGLE_CHOICE && selected.length > 1) {
    selected = selected.slice(0, 1);
  }
  if (question.kind === AssessmentQuestionKind.FREE_TEXT) selected = [];

  const text =
    question.kind === AssessmentQuestionKind.FREE_TEXT
      ? (input.text ?? "").slice(0, MAX_FREE_TEXT_LENGTH)
      : null;

  await prisma.assessmentAnswer.upsert({
    where: { responseId_questionId: { responseId: invitation.response.id, questionId: question.id } },
    create: {
      responseId: invitation.response.id,
      questionId: question.id,
      selectedOptionIds: selected,
      text,
    },
    update: { selectedOptionIds: selected, text },
  });

  return { ok: true };
}

export type SubmitOutcome =
  | { ok: true; showScore: boolean; scoredPoints: number; maxPoints: number; percent: number | null }
  | { ok: false; reason: TakingFailure | "INCOMPLETE"; message: string; unanswered?: string[] };

/**
 * Finalises an attempt and scores it.
 *
 * The score is computed here and STORED. Recomputing it later against an
 * assessment whose text has since been corrected would silently restate
 * somebody's result, and a result that changes on its own is not a result.
 */
export async function submitResponse(token: string): Promise<SubmitOutcome> {
  const invitation = await prisma.assessmentInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      inviteeName: true,
      assessment: {
        select: {
          id: true,
          status: true,
          showScoreToTaker: true,
          sections: {
            select: {
              questions: {
                select: {
                  id: true,
                  kind: true,
                  points: true,
                  required: true,
                  // Correctness IS selected here, and that is safe: nothing in
                  // this function is returned to the browser except the totals.
                  options: { select: { id: true, isCorrect: true } },
                },
              },
            },
          },
        },
      },
      response: {
        select: {
          id: true,
          submittedAt: true,
          answers: { select: { questionId: true, selectedOptionIds: true, text: true } },
        },
      },
    },
  });

  if (!invitation?.response) {
    return { ok: false, reason: "UNKNOWN", message: "This link is not valid." };
  }
  if (invitation.response.submittedAt) {
    return { ok: false, reason: "ALREADY_SUBMITTED", message: "This was already submitted." };
  }
  if (invitation.revokedAt) {
    return { ok: false, reason: "REVOKED", message: "This link has been withdrawn." };
  }
  if (invitation.expiresAt && invitation.expiresAt <= new Date()) {
    return { ok: false, reason: "EXPIRED", message: "This link has expired." };
  }
  if (invitation.assessment.status !== "PUBLISHED") {
    return { ok: false, reason: "CLOSED", message: "This is no longer open." };
  }

  const questions: (ScorableQuestion & { required: boolean })[] =
    invitation.assessment.sections.flatMap((section) =>
      section.questions.map((question) => ({
        id: question.id,
        kind: question.kind,
        points: question.points,
        required: question.required,
        options: question.options,
      })),
    );

  const answers = invitation.response.answers.map((a) => ({
    questionId: a.questionId,
    selectedOptionIds: a.selectedOptionIds,
    text: a.text,
  }));

  const missing = unansweredRequired(questions, answers);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "INCOMPLETE",
      message:
        missing.length === 1
          ? "One question still needs an answer."
          : `${missing.length} questions still need an answer.`,
      unanswered: missing,
    };
  }

  const score = scoreResponse(questions, answers);
  const byQuestion = new Map(score.perQuestion.map((r) => [r.questionId, r]));

  await prisma.$transaction(async (tx) => {
    // Guarded on submittedAt so two submissions racing cannot both score.
    const claimed = await tx.assessmentResponse.updateMany({
      where: { id: invitation.response!.id, submittedAt: null },
      data: {
        submittedAt: new Date(),
        scoredPoints: score.scoredPoints,
        maxPoints: score.maxPoints,
      },
    });
    if (claimed.count === 0) throw new AlreadySubmitted();

    // Points are snapshotted per answer, so a result reads the same in a year
    // even if a question's wording is corrected afterwards.
    for (const answer of invitation.response!.answers) {
      const result = byQuestion.get(answer.questionId);
      if (!result) continue;
      await tx.assessmentAnswer.update({
        where: {
          responseId_questionId: {
            responseId: invitation.response!.id,
            questionId: answer.questionId,
          },
        },
        data: { awardedPoints: result.awardedPoints, possiblePoints: result.possiblePoints },
      });
    }
  }).catch((error) => {
    if (error instanceof AlreadySubmitted) return;
    throw error;
  });

  await recordAuditBestEffort({
    actor: { userId: null, email: null, role: null },
    action: "assessment.submitted",
    entityType: "AssessmentResponse",
    entityId: invitation.response.id,
    metadata: {
      invitationId: invitation.id,
      assessmentId: invitation.assessment.id,
      scoredPoints: score.scoredPoints,
      maxPoints: score.maxPoints,
    },
  });

  log.info("assessment submitted", {
    invitationId: invitation.id,
    scoredPoints: score.scoredPoints,
    maxPoints: score.maxPoints,
  });

  return {
    ok: true,
    // The taker sees a number only if the assessment says so. Everything else
    // returned here is for the thank-you screen's wording.
    showScore: invitation.assessment.showScoreToTaker,
    scoredPoints: score.scoredPoints,
    maxPoints: score.maxPoints,
    percent: score.percent,
  };
}

class AlreadySubmitted extends Error {
  override readonly name = "AlreadySubmitted";
}
