import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";

const log = scoped("aptitude.invitations");

/**
 * 256 bits, hashed at rest — same treatment as Assessments' invitation
 * tokens and password reset tokens. The link is the only credential on the
 * taking path; there is no sign-in.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type IssuedInvitation = {
  invitationId: string;
  token: string;
  expiresAt: Date | null;
  candidateName: string;
  candidateEmail: string | null;
  testTitle: string;
};

export type IssueFailure = "TEST_NOT_FOUND" | "NOT_PUBLISHED" | "NO_QUESTIONS" | "MISSING_NAME";

export type IssueOutcome =
  | { ok: true; invitation: IssuedInvitation }
  | { ok: false; reason: IssueFailure; message: string };

/**
 * Creates one candidate's link. No employee lookup branch — candidates are
 * never Employee rows in this module, unlike Assessments (which supports
 * both a known member of staff and a nameless public respondent).
 */
export async function issueInvitation(
  input: {
    testId: string;
    name?: string;
    email?: string | null;
    /** Minted from the public link rather than issued by HR — see `startPublicAttempt`. */
    isPublic?: boolean;
  },
  actor: AuditActor,
): Promise<IssueOutcome> {
  const test = await prisma.aptitudeTest.findUnique({
    where: { id: input.testId },
    select: { id: true, title: true, status: true, invitationsExpire: true, invitationTtlHours: true },
  });
  if (!test) return { ok: false, reason: "TEST_NOT_FOUND", message: "No such aptitude test." };
  if (test.status !== "PUBLISHED") {
    return { ok: false, reason: "NOT_PUBLISHED", message: "Publish the test before sending it to anyone." };
  }

  const questionCount = await prisma.aptitudeQuestion.count({
    where: { section: { testId: test.id } },
  });
  if (questionCount === 0) {
    return { ok: false, reason: "NO_QUESTIONS", message: "This test has no questions yet." };
  }

  let candidateName = input.name?.trim() ?? "";
  const candidateEmail = input.email?.trim().toLowerCase() || null;

  // A public attempt has no name yet — that is the point of it — so it gets
  // a placeholder instead of the "give a name" refusal HR-issued ones get.
  // `declareIdentity` overwrites it if the candidate gives a real one.
  if (!candidateName) {
    if (!input.isPublic) {
      return { ok: false, reason: "MISSING_NAME", message: "Give a name for the invitation." };
    }
    candidateName = "Public respondent";
  }

  const token = generateToken();
  const expiresAt = test.invitationsExpire
    ? new Date(Date.now() + test.invitationTtlHours * 3_600_000)
    : null;

  const invitation = await prisma.aptitudeInvitation.create({
    data: {
      testId: test.id,
      candidateName,
      candidateEmail,
      isPublic: input.isPublic ?? false,
      tokenHash: hashInvitationToken(token),
      expiresAt,
      createdBy: actor.userId,
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "aptitude.invited",
    entityType: "AptitudeInvitation",
    entityId: invitation.id,
    after: {
      testId: test.id,
      candidateName,
      candidateEmail,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  log.info("invitation issued", { invitationId: invitation.id, testId: test.id });
  return {
    ok: true,
    invitation: {
      invitationId: invitation.id,
      token,
      expiresAt,
      candidateName,
      candidateEmail,
      testTitle: test.title,
    },
  };
}

export type BulkIssueResult = {
  invitations: IssuedInvitation[];
  failures: { name: string; message: string }[];
};

/**
 * Issues one invitation per candidate, from freeform `{name?, email}` pairs
 * HR pastes in — there is no employee roster to pick from, since candidates
 * are never Employee rows. Independent per person: one bad row must not cost
 * the rest of a batch their links.
 */
export async function issueInvitationsByEmail(
  testId: string,
  candidates: { name: string; email: string }[],
  actor: AuditActor,
): Promise<BulkIssueResult> {
  const invitations: IssuedInvitation[] = [];
  const failures: { name: string; message: string }[] = [];

  for (const candidate of candidates) {
    const outcome = await issueInvitation(
      { testId, name: candidate.name || candidate.email, email: candidate.email },
      actor,
    );
    if (outcome.ok) {
      invitations.push(outcome.invitation);
    } else {
      failures.push({ name: candidate.name || candidate.email, message: outcome.message });
    }
  }

  return { invitations, failures };
}

/** Withdraws a link that has not been submitted. */
export async function revokeInvitation(
  invitationId: string,
  actor: AuditActor,
): Promise<{ ok: boolean; message?: string }> {
  const invitation = await prisma.aptitudeInvitation.findUnique({
    where: { id: invitationId },
    select: { id: true, revokedAt: true, attempt: { select: { submittedAt: true } } },
  });
  if (!invitation) return { ok: false, message: "No such invitation." };

  if (invitation.attempt?.submittedAt) {
    return { ok: false, message: "This has already been submitted, so the link is spent." };
  }
  if (invitation.revokedAt) return { ok: true };

  await prisma.aptitudeInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
  await recordAudit({
    actor,
    action: "aptitude.invitation_revoked",
    entityType: "AptitudeInvitation",
    entityId: invitation.id,
  });
  return { ok: true };
}

export type ResendFailure = "NOT_FOUND" | "ALREADY_SUBMITTED" | IssueFailure;

export type ResendOutcome =
  | { ok: true; invitation: IssuedInvitation }
  | { ok: false; reason: ResendFailure; message: string };

/**
 * Issues a fresh link and withdraws the one it replaces. Cannot resend the
 * original — only its hash is stored — so a new invitation is the only way
 * to hand out a working link again. Issues the new one BEFORE revoking the
 * old, so a failure partway leaves the candidate with their existing link
 * rather than none.
 */
export async function resendInvitation(invitationId: string, actor: AuditActor): Promise<ResendOutcome> {
  const existing = await prisma.aptitudeInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      testId: true,
      candidateName: true,
      candidateEmail: true,
      revokedAt: true,
      attempt: { select: { submittedAt: true } },
    },
  });
  if (!existing) return { ok: false, reason: "NOT_FOUND", message: "No such invitation." };
  if (existing.attempt?.submittedAt) {
    return {
      ok: false,
      reason: "ALREADY_SUBMITTED",
      message: "This has already been submitted, so there is nothing to resend.",
    };
  }

  const reissued = await issueInvitation(
    { testId: existing.testId, name: existing.candidateName, email: existing.candidateEmail },
    actor,
  );
  if (!reissued.ok) return reissued;

  if (!existing.revokedAt) {
    await prisma.aptitudeInvitation.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    await recordAudit({
      actor,
      action: "aptitude.invitation_revoked",
      entityType: "AptitudeInvitation",
      entityId: existing.id,
      metadata: { reason: "superseded by resend", newInvitationId: reissued.invitation.invitationId },
    });
  }

  log.info("invitation resent", { oldInvitationId: existing.id, newInvitationId: reissued.invitation.invitationId });
  return reissued;
}

// ---------------------------------------------------------------------------
// Public link — the primary way candidates reach a test. HR copies one link
// and shares it however they like; opening it mints an ordinary invitation
// (above) on the candidate's behalf, so everything downstream — one attempt,
// one submission, the answer key never leaving the server — is the exact
// same code personal invitations already run through.
// ---------------------------------------------------------------------------

export function generatePublicLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export type PublicLinkConfig = {
  enabled: boolean;
  nameMode: "REQUIRED" | "OPTIONAL" | "HIDDEN";
  emailMode: "REQUIRED" | "OPTIONAL" | "HIDDEN";
};

export async function setPublicLinkConfig(
  testId: string,
  config: PublicLinkConfig,
  actor: AuditActor,
): Promise<{ ok: boolean; message?: string }> {
  const test = await prisma.aptitudeTest.findUnique({
    where: { id: testId },
    select: { id: true, status: true, publicLinkToken: true },
  });
  if (!test) return { ok: false, message: "No such aptitude test." };
  if (config.enabled && test.status !== "PUBLISHED") {
    return { ok: false, message: "Publish the test before enabling its public link." };
  }

  await prisma.aptitudeTest.update({
    where: { id: testId },
    data: {
      publicLinkEnabled: config.enabled,
      publicLinkNameMode: config.nameMode,
      publicLinkEmailMode: config.emailMode,
      publicLinkToken: test.publicLinkToken ?? (config.enabled ? generatePublicLinkToken() : null),
    },
  });
  await recordAudit({
    actor,
    action: config.enabled ? "aptitude.public_link_enabled" : "aptitude.public_link_disabled",
    entityType: "AptitudeTest",
    entityId: testId,
    after: { nameMode: config.nameMode, emailMode: config.emailMode },
  });
  return { ok: true };
}

export type PublicAttemptFailure = "NOT_FOUND" | "DISABLED" | IssueFailure;

export type PublicAttemptOutcome =
  | { ok: true; token: string }
  | { ok: false; reason: PublicAttemptFailure; message: string };

/**
 * Mints a fresh, ordinary invitation for whoever just opened the public
 * link. No session, no cookie — opening it twice makes two attempts, exactly
 * as two different people opening it does.
 */
export async function startPublicAttempt(publicLinkToken: string): Promise<PublicAttemptOutcome> {
  const test = await prisma.aptitudeTest.findUnique({
    where: { publicLinkToken },
    select: { id: true, publicLinkEnabled: true },
  });
  if (!test) return { ok: false, reason: "NOT_FOUND", message: "This link is not valid." };
  if (!test.publicLinkEnabled) {
    return { ok: false, reason: "DISABLED", message: "This link is no longer active." };
  }

  const outcome = await issueInvitation(
    { testId: test.id, isPublic: true },
    { userId: null, email: null, role: null },
  );
  if (!outcome.ok) return outcome;

  return { ok: true, token: outcome.invitation.token };
}
