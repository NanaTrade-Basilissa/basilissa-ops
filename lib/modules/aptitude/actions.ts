"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/platform/prisma";
import { sendEmail } from "@/lib/platform/email";
import { recordAudit } from "@/lib/platform/audit";
import { buildAptitudeCandidateResultEmailHtml } from "@/lib/email-templates/aptitude";
import { auditActorFrom, requirePermission } from "@/lib/modules/identity/server";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";
import { getEnv, isEmailConfigured } from "@/lib/platform/env";
import { enqueue } from "@/lib/platform/jobs";
import { rateLimit } from "@/lib/platform/rate-limit";
import {
  answerSchema,
  aptitudeTestDetailsSchema,
  invitationSchema,
  parseBulkCandidateLines,
  publicDeclarationSchema,
  publicLinkConfigSchema,
  questionSchema,
  sectionSchema,
} from "./validation";
import {
  addQuestion,
  addSection,
  closeAptitudeTest,
  createAptitudeTest,
  deleteAptitudeTest,
  deleteQuestion,
  duplicateAptitudeTest,
  publishAptitudeTest,
  reopenAptitudeTest,
  unpublishAptitudeTest,
  updateAptitudeTestDetails,
  updateQuestion,
  updateSection,
} from "./authoring";
import {
  getPublicAptitudeTest,
  issueInvitation,
  issueInvitationsByEmail,
  resendInvitation,
  revokeInvitation,
  setPublicLinkConfig,
  startPublicAttempt,
  type IssuedInvitation,
} from "./invitations";
import { APTITUDE_INVITATION_SEND } from "./jobs";
import { advanceSection, declareIdentity, recordTabAbsence, saveAnswer, submitResponse } from "./taking";

export type AptitudeFormState = (NonNullable<FormState> & { saved?: boolean }) | undefined;

// ---------------------------------------------------------------------------
// HR side. Every action re-checks the permission AND the feature flag: a
// Server Action is reachable by direct POST without the page in front of it.
// ---------------------------------------------------------------------------

export async function createAptitudeTestAction(
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");

  const parsed = aptitudeTestDetailsSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    showScoreToCandidate: formData.get("showScoreToCandidate") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const created = await createAptitudeTest(parsed.data, auditActorFrom(actor));
  revalidatePath("/admin/aptitude-tests");
  redirect(`/admin/aptitude-tests/${created.testId}`);
}

export async function updateAptitudeTestAction(
  testId: string,
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");

  const parsed = aptitudeTestDetailsSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    showScoreToCandidate: formData.get("showScoreToCandidate") === "on",
    passMarkPercent: formData.get("passMarkPercent") || undefined,
    invitationsExpire: formData.get("invitationsExpire") === "on",
    invitationTtlHours: formData.get("invitationTtlHours") || undefined,
    timeLimitMinutes: formData.get("timeLimitMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const clearSectionTimers = formData.get("clearSectionTimers") === "true";
  const outcome = await updateAptitudeTestDetails(
    testId,
    { ...parsed.data, clearSectionTimers },
    auditActorFrom(actor),
  );
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function updatePublicLinkAction(
  testId: string,
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");

  const parsed = publicLinkConfigSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    nameMode: formData.get("nameMode"),
    emailMode: formData.get("emailMode"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await setPublicLinkConfig(testId, parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message ?? "Could not update the public link." };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function addSectionAction(
  testId: string,
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");

  const parsed = sectionSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    timeLimitMinutes: formData.get("timeLimitMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const overrideOverallTime = formData.get("overrideOverallTime") === "true";
  const outcome = await addSection(
    testId,
    { ...parsed.data, overrideOverallTime },
    auditActorFrom(actor),
  );
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function updateSectionAction(
  testId: string,
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");

  const parsed = sectionSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    timeLimitMinutes: formData.get("timeLimitMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const overrideOverallTime = formData.get("overrideOverallTime") === "true";
  const outcome = await updateSection(
    String(formData.get("sectionId") ?? ""),
    { ...parsed.data, overrideOverallTime },
    auditActorFrom(actor),
  );
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function addQuestionAction(
  testId: string,
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");

  const texts = formData.getAll("optionText").map(String);
  const correctIndexes = new Set(formData.getAll("optionCorrect").map((v) => String(v)));

  const parsed = questionSchema.safeParse({
    sectionId: formData.get("sectionId"),
    kind: formData.get("kind"),
    text: formData.get("text"),
    points: formData.get("points"),
    required: formData.get("required") === "on",
    options: texts
      .map((text, index) => ({ text, isCorrect: correctIndexes.has(String(index)) }))
      .filter((option) => option.text.trim().length > 0),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await addQuestion(parsed.data.sectionId, parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function updateQuestionAction(
  testId: string,
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");

  const questionId = String(formData.get("questionId") ?? "");
  const texts = formData.getAll("optionText").map(String);
  const correctIndexes = new Set(formData.getAll("optionCorrect").map((v) => String(v)));

  const parsed = questionSchema.safeParse({
    sectionId: formData.get("sectionId"),
    kind: formData.get("kind"),
    text: formData.get("text"),
    points: formData.get("points"),
    required: formData.get("required") === "on",
    options: texts
      .map((text, index) => ({ text, isCorrect: correctIndexes.has(String(index)) }))
      .filter((option) => option.text.trim().length > 0),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await updateQuestion(questionId, parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function deleteQuestionAction(
  testId: string,
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");
  const outcome = await deleteQuestion(String(formData.get("questionId") ?? ""), auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function publishAptitudeTestAction(
  testId: string,
  _prev: AptitudeFormState,
  _formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");
  const outcome = await publishAptitudeTest(testId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function closeAptitudeTestAction(
  testId: string,
  _prev: AptitudeFormState,
  _formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");
  const outcome = await closeAptitudeTest(testId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

export async function unpublishAptitudeTestAction(
  testId: string,
  _prev: AptitudeFormState,
  _formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");
  const outcome = await unpublishAptitudeTest(testId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  revalidatePath("/admin/aptitude-tests");
  return { saved: true };
}

export async function reopenAptitudeTestAction(
  testId: string,
  _prev: AptitudeFormState,
  _formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");
  const outcome = await reopenAptitudeTest(testId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  revalidatePath("/admin/aptitude-tests");
  return { saved: true };
}

export async function duplicateAptitudeTestAction(
  testId: string,
  _prev: AptitudeFormState,
  _formData: FormData,
): Promise<AptitudeFormState & { newTestId?: string }> {
  const actor = await requirePermission("aptitude:write");
  const outcome = await duplicateAptitudeTest(testId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath("/admin/aptitude-tests");
  return { saved: true, newTestId: outcome.value.newTestId };
}

export async function deleteAptitudeTestAction(
  testId: string,
  _prev: AptitudeFormState,
  _formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");
  const outcome = await deleteAptitudeTest(testId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath("/admin/aptitude-tests");
  redirect("/admin/aptitude-tests");
}

export type InviteState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      link?: { url: string; name: string; expiresAt: string | null; emailed: boolean };
    }
  | undefined;

async function maybeEnqueueInvitationEmail(invitation: IssuedInvitation): Promise<boolean> {
  if (!invitation.candidateEmail || !isEmailConfigured()) return false;

  await enqueue(APTITUDE_INVITATION_SEND, {
    email: invitation.candidateEmail,
    token: invitation.token,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    testTitle: invitation.testTitle,
    candidateName: invitation.candidateName,
  });
  return true;
}

/** A single candidate, entered directly (name + email — no employee picker). */
export async function inviteToAptitudeTestAction(
  testId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const actor = await requirePermission("aptitude:write");

  const parsed = invitationSchema.safeParse({
    testId,
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await issueInvitation(parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  const emailed = await maybeEnqueueInvitationEmail(outcome.invitation);

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return {
    link: {
      url: `${getEnv().NEXT_PUBLIC_APP_URL}/aptitude/${encodeURIComponent(outcome.invitation.token)}`,
      name: outcome.invitation.candidateName,
      expiresAt: outcome.invitation.expiresAt?.toISOString() ?? null,
      emailed,
    },
  };
}

export type BulkInviteState =
  | { error?: string; summary?: { invited: number; emailed: number; failures: { name: string; message: string }[] } }
  | undefined;

/**
 * One or more candidates at once, pasted as lines of `Name <email>`,
 * `Name, email`, or a bare email — no employee roster to pick from.
 */
export async function inviteManyByEmailAction(
  testId: string,
  _prev: BulkInviteState,
  formData: FormData,
): Promise<BulkInviteState> {
  const actor = await requirePermission("aptitude:write");

  const raw = String(formData.get("candidates") ?? "");
  const candidates = parseBulkCandidateLines(raw);
  if (candidates.length === 0) {
    return { error: "Enter at least one valid email address, one per line." };
  }

  const { invitations, failures } = await issueInvitationsByEmail(testId, candidates, auditActorFrom(actor));

  let emailed = 0;
  for (const invitation of invitations) {
    if (await maybeEnqueueInvitationEmail(invitation)) emailed += 1;
  }

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { summary: { invited: invitations.length, emailed, failures } };
}

export async function resendInvitationAction(
  testId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const actor = await requirePermission("aptitude:write");

  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) return { error: "Nothing to resend." };

  const outcome = await resendInvitation(invitationId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  const emailed = await maybeEnqueueInvitationEmail(outcome.invitation);

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return {
    link: {
      url: `${getEnv().NEXT_PUBLIC_APP_URL}/aptitude/${encodeURIComponent(outcome.invitation.token)}`,
      name: outcome.invitation.candidateName,
      expiresAt: outcome.invitation.expiresAt?.toISOString() ?? null,
      emailed,
    },
  };
}

export async function revokeInvitationAction(
  testId: string,
  _prev: AptitudeFormState,
  formData: FormData,
): Promise<AptitudeFormState> {
  const actor = await requirePermission("aptitude:write");
  const outcome = await revokeInvitation(String(formData.get("invitationId") ?? ""), auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message ?? "Could not withdraw that link." };

  revalidatePath(`/admin/aptitude-tests/${testId}`);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Public side. No session; the token is the whole credential, so every
// action takes it and re-resolves it. Rate limited because these are
// unauthenticated endpoints that write.
// ---------------------------------------------------------------------------

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headerList.get("x-real-ip")?.trim() ?? "unknown";
}

export type DeclarationState = { error?: string; done?: boolean } | undefined;

export async function declareIdentityAction(
  token: string,
  _prev: DeclarationState,
  formData: FormData,
): Promise<DeclarationState> {
  const limit = await rateLimit(`aptitude-declare:${await clientIp()}`, 30, 15 * 60 * 1000);
  if (!limit.success) return { error: "Too many attempts. Please try again shortly." };

  const outcome = await declareIdentity(token, { name: formData.get("name"), email: formData.get("email") });
  if (!outcome.ok) return { error: outcome.error ?? "This link is no longer usable." };

  revalidatePath(`/aptitude/${token}`);
  return { done: true };
}

export async function startPublicAptitudeTestAction(
  publicLinkToken: string,
  _prev: DeclarationState,
  formData: FormData,
): Promise<DeclarationState> {
  const limit = await rateLimit(`aptitude-public-start:${await clientIp()}`, 30, 15 * 60 * 1000);
  if (!limit.success) return { error: "Too many attempts. Please try again shortly." };

  const testOutcome = await getPublicAptitudeTest(publicLinkToken);
  if (!testOutcome.ok) return { error: testOutcome.message };

  const { identity } = testOutcome.test;
  const parsed = publicDeclarationSchema(identity.nameMode, identity.emailMode).safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check what you entered." };
  }

  const outcome = await startPublicAttempt(publicLinkToken, {
    name: parsed.data.name,
    email: parsed.data.email || null,
  });
  if (!outcome.ok) return { error: outcome.message };

  const cookieStore = await cookies();
  cookieStore.set(`aptitude_active_${testOutcome.test.id}`, outcome.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  redirect(`/aptitude/${encodeURIComponent(outcome.token)}`);
}

export type AnswerState = { error?: string; savedQuestionId?: string } | undefined;

export async function saveAnswerAction(
  token: string,
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const limit = await rateLimit(`aptitude-answer:${await clientIp()}`, 600, 60 * 60 * 1000);
  if (!limit.success) return { error: "Too many changes at once. Please slow down." };

  const parsed = answerSchema.safeParse({
    questionId: formData.get("questionId"),
    selectedOptionIds: formData.getAll("optionId").map(String),
    text: formData.get("text") ? String(formData.get("text")) : undefined,
  });
  if (!parsed.success) return { error: "That answer could not be saved." };

  const outcome = await saveAnswer(token, parsed.data);
  if (!outcome.ok) return { error: "This link is no longer usable." };

  return { savedQuestionId: parsed.data.questionId };
}

/**
 * Fire-and-forget from the client whenever the tab has been hidden and comes
 * back — not tied to `useActionState`, since there's no form and nothing for
 * the candidate to see happen. Same rate limit budget as answer saves: this
 * is called far less often than that in practice, so it's generous, not a
 * real cap.
 */
export async function recordTabAbsenceAction(
  token: string,
  leftAt: string,
  durationMs: number,
): Promise<void> {
  const limit = await rateLimit(`aptitude-tab-absence:${await clientIp()}`, 600, 60 * 60 * 1000);
  if (!limit.success) return;

  await recordTabAbsence(token, { leftAt, durationMs });
}

export type SubmitState = { error?: string; unanswered?: string[] } | undefined;

export async function submitAptitudeTestAction(token: string, _prev: SubmitState): Promise<SubmitState> {
  const limit = await rateLimit(`aptitude-submit:${await clientIp()}`, 20, 15 * 60 * 1000);
  if (!limit.success) return { error: "Too many attempts. Please try again shortly." };

  const outcome = await submitResponse(token);
  if (!outcome.ok) {
    return { error: outcome.message, unanswered: "unanswered" in outcome ? outcome.unanswered : undefined };
  }

  redirect(`/aptitude/${token}/done`);
}

export type AdvanceSectionState = {
  ok: boolean;
  error?: string;
  nextIndex?: number;
  sectionDeadlineAt?: string | null;
  submitted?: boolean;
};

export async function advanceAptitudeSectionAction(token: string): Promise<AdvanceSectionState> {
  const limit = await rateLimit(`aptitude-advance:${await clientIp()}`, 60, 15 * 60 * 1000);
  if (!limit.success) return { ok: false, error: "Too many requests. Please wait a moment." };

  const outcome = await advanceSection(token);
  if (!outcome.ok) {
    return { ok: false, error: outcome.message };
  }
  if (outcome.submitted) {
    redirect(`/aptitude/${token}/done`);
  }
  return {
    ok: true,
    nextIndex: outcome.currentSectionIndex,
    sectionDeadlineAt: outcome.sectionDeadlineAt,
    submitted: false,
  };
}

/**
 * Sends or resends the official assessment scorecard email directly to the candidate.
 * Accessible to HR / admin with aptitude:write permission.
 */
export async function sendCandidateAptitudeResultAction(
  attemptId: string,
  options?: { overrideEmail?: string },
): Promise<{ success: boolean; sentTo?: string; error?: string }> {
  const actor = await requirePermission("aptitude:write");

  const attempt = await prisma.aptitudeAttempt.findUnique({
    where: { id: attemptId },
    include: {
      invitation: {
        include: { test: true },
      },
    },
  });

  if (!attempt) {
    return { success: false, error: "Assessment attempt not found" };
  }

  if (!attempt.submittedAt) {
    return { success: false, error: "Cannot send results for an unsubmitted test attempt" };
  }

  const rawTarget =
    options?.overrideEmail?.trim() ||
    attempt.declaredEmail?.trim() ||
    attempt.invitation.candidateEmail?.trim();

  if (!rawTarget) {
    return {
      success: false,
      error: "No email address found for this candidate. Please enter an email to dispatch results.",
    };
  }

  const targetEmail = rawTarget.toLowerCase();

  // If a corrected or override email was provided, persist it to avoid repeat typos
  if (options?.overrideEmail && options.overrideEmail.trim()) {
    await prisma
      .$transaction([
        prisma.aptitudeAttempt.update({
          where: { id: attemptId },
          data: { declaredEmail: targetEmail },
        }),
        prisma.aptitudeInvitation.update({
          where: { id: attempt.invitationId },
          data: { candidateEmail: targetEmail },
        }),
      ])
      .catch(() => {});
  }

  const candidateName = attempt.declaredName || attempt.invitation.candidateName || "Candidate";
  const testTitle = attempt.invitation.test.title;
  const scoredPoints = attempt.scoredPoints ?? 0;
  const maxPoints = attempt.maxPoints ?? 0;
  const percent = maxPoints > 0 ? Math.round((scoredPoints / maxPoints) * 100) : 0;

  const html = buildAptitudeCandidateResultEmailHtml({
    testTitle,
    candidateName,
    submittedAt: attempt.submittedAt,
    scoredPoints,
    maxPoints,
    percent,
    passMarkPercent: attempt.invitation.test.passMarkPercent,
  });

  const emailResult = await sendEmail({
    to: [targetEmail],
    from: "Basilissa Aptitude",
    recipientName: candidateName,
    subject: `Your Results: ${testTitle} (${percent}%)`,
    html,
  });

  if (emailResult.status === "failed") {
    const errorMsg =
      emailResult.error instanceof Error ? emailResult.error.message : String(emailResult.error);
    return { success: false, error: `Email dispatch failed: ${errorMsg}` };
  }

  if (emailResult.status === "skipped") {
    return {
      success: false,
      error: `Email skipped: ${emailResult.reason}. Please verify email configuration.`,
    };
  }

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "aptitude.candidate_result_sent",
    entityType: "AptitudeAttempt",
    entityId: attempt.id,
    after: {
      targetEmail,
      scoredPoints,
      maxPoints,
      percent,
      testId: attempt.invitation.testId,
    },
  });

  revalidatePath(`/admin/aptitude-tests/${attempt.invitation.testId}/attempts/${attemptId}`);
  revalidatePath(`/admin/aptitude-tests/${attempt.invitation.testId}`);

  return { success: true, sentTo: targetEmail };
}
