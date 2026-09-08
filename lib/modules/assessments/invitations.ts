import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";

const log = scoped("assessments.invitations");

/**
 * 256 bits, hashed at rest, exactly as password reset tokens are.
 *
 * The link is the only credential on the taking path — there is no sign-in —
 * so it is generated and stored with the same care. A database dump must not
 * yield working links, and the token itself exists only in whatever HR sends.
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
  /** Null means it never expires on its own — see `Assessment.invitationsExpire`. */
  expiresAt: Date | null;
  inviteeName: string;
  inviteeEmail: string | null;
  /** Carried so a caller can email the invitation without a second query. */
  assessmentTitle: string;
};

export type IssueFailure =
  | "ASSESSMENT_NOT_FOUND"
  | "NOT_PUBLISHED"
  | "NO_QUESTIONS"
  | "EMPLOYEE_NOT_FOUND";

export type IssueOutcome =
  | { ok: true; invitation: IssuedInvitation }
  | { ok: false; reason: IssueFailure; message: string };

/**
 * Creates one person's link.
 *
 * One invitation per person rather than a shared link, which is what makes a
 * result attributable: a single link for everybody cannot tell one submission
 * from another, cannot stop somebody sitting it twice, and cannot stop it being
 * sat on a colleague's behalf.
 */
export async function issueInvitation(
  input: {
    assessmentId: string;
    employeeId?: string | null;
    name?: string;
    email?: string | null;
    /** Minted from the public link rather than issued by HR — see `startPublicAttempt`. */
    isPublic?: boolean;
  },
  actor: AuditActor,
): Promise<IssueOutcome> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: input.assessmentId },
    select: {
      id: true,
      title: true,
      status: true,
      invitationsExpire: true,
      invitationTtlHours: true,
      _count: { select: { sections: true } },
    },
  });
  if (!assessment) {
    return { ok: false, reason: "ASSESSMENT_NOT_FOUND", message: "No such assessment." };
  }
  if (assessment.status !== "PUBLISHED") {
    return {
      ok: false,
      reason: "NOT_PUBLISHED",
      message: "Publish the assessment before sending it to anyone.",
    };
  }

  // A link to an assessment with no questions wastes somebody's time and
  // produces a meaningless 0-out-of-0 result.
  const questionCount = await prisma.assessmentQuestion.count({
    where: { section: { assessmentId: assessment.id } },
  });
  if (questionCount === 0) {
    return { ok: false, reason: "NO_QUESTIONS", message: "This assessment has no questions yet." };
  }

  let inviteeName = input.name?.trim() ?? "";
  let inviteeEmail = input.email?.trim().toLowerCase() || null;

  if (input.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { firstName: true, lastName: true, email: true, userId: true },
    });
    if (!employee) {
      return { ok: false, reason: "EMPLOYEE_NOT_FOUND", message: "No such employee." };
    }

    // The employee record wins for a known member of staff; anything typed is
    // only a fallback for someone without a record.
    inviteeName = `${employee.firstName} ${employee.lastName}`.trim();

    // `Employee.email` is the normal source — a contact address HR enters
    // directly, since most staff never get an account. `userId` is checked
    // second and only as a fallback, for the rare employee who has a login
    // but somehow no address on their own record.
    if (!inviteeEmail) inviteeEmail = employee.email;

    // Employee.userId is a plain column, not a declared relation, so the
    // address needs its own lookup.
    if (!inviteeEmail && employee.userId) {
      const account = await prisma.user.findUnique({
        where: { id: employee.userId },
        select: { email: true },
      });
      inviteeEmail = account?.email ?? null;
    }
  }

  // A public attempt has no name yet — that is the point of it — so it gets
  // a placeholder instead of the "give a name" refusal HR-issued ones get.
  // `declareIdentity` overwrites it if the taker gives a real one.
  if (!inviteeName) {
    if (!input.isPublic) {
      return { ok: false, reason: "EMPLOYEE_NOT_FOUND", message: "Give a name for the invitation." };
    }
    inviteeName = "Public respondent";
  }

  const token = generateToken();
  const expiresAt = assessment.invitationsExpire
    ? new Date(Date.now() + assessment.invitationTtlHours * 3_600_000)
    : null;

  const invitation = await prisma.assessmentInvitation.create({
    data: {
      assessmentId: assessment.id,
      employeeId: input.employeeId ?? null,
      inviteeName,
      inviteeEmail,
      isPublic: input.isPublic ?? false,
      tokenHash: hashInvitationToken(token),
      expiresAt,
      createdBy: actor.userId,
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "assessment.invited",
    entityType: "AssessmentInvitation",
    entityId: invitation.id,
    after: {
      assessmentId: assessment.id,
      employeeId: input.employeeId ?? null,
      inviteeName,
      inviteeEmail,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  log.info("invitation issued", { invitationId: invitation.id, assessmentId: assessment.id });
  return {
    ok: true,
    invitation: {
      invitationId: invitation.id,
      token,
      expiresAt,
      inviteeName,
      inviteeEmail,
      assessmentTitle: assessment.title,
    },
  };
}

/** Withdraws a link that has not been submitted. */
export async function revokeInvitation(
  invitationId: string,
  actor: AuditActor,
): Promise<{ ok: boolean; message?: string }> {
  const invitation = await prisma.assessmentInvitation.findUnique({
    where: { id: invitationId },
    select: { id: true, revokedAt: true, response: { select: { submittedAt: true } } },
  });
  if (!invitation) return { ok: false, message: "No such invitation." };

  // Revoking after submission would suggest the result is void, which is not
  // what revoking a link means. The result stands; there is nothing to revoke.
  if (invitation.response?.submittedAt) {
    return { ok: false, message: "This has already been submitted, so the link is spent." };
  }
  if (invitation.revokedAt) return { ok: true };

  await prisma.assessmentInvitation.update({
    where: { id: invitation.id },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    actor,
    action: "assessment.invitation_revoked",
    entityType: "AssessmentInvitation",
    entityId: invitation.id,
  });
  return { ok: true };
}

export type ResendFailure = "NOT_FOUND" | "ALREADY_SUBMITTED" | IssueFailure;

export type ResendOutcome =
  | { ok: true; invitation: IssuedInvitation }
  | { ok: false; reason: ResendFailure; message: string };

/**
 * Issues a fresh link for somebody who never got theirs, or lost it, and
 * withdraws the one it replaces.
 *
 * Cannot just resend the original: only its hash is stored, so the token
 * itself is unrecoverable by design. A new invitation is the only way to hand
 * out a working link again.
 *
 * Issues the new one BEFORE revoking the old, deliberately. If issuing fails
 * partway — the assessment got closed underneath this, say — the person keeps
 * whatever link they already had rather than being left with none.
 */
export async function resendInvitation(
  invitationId: string,
  actor: AuditActor,
): Promise<ResendOutcome> {
  const existing = await prisma.assessmentInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      assessmentId: true,
      employeeId: true,
      inviteeName: true,
      inviteeEmail: true,
      revokedAt: true,
      response: { select: { submittedAt: true } },
    },
  });
  if (!existing) return { ok: false, reason: "NOT_FOUND", message: "No such invitation." };
  if (existing.response?.submittedAt) {
    return {
      ok: false,
      reason: "ALREADY_SUBMITTED",
      message: "This has already been submitted, so there is nothing to resend.",
    };
  }

  const reissued = await issueInvitation(
    {
      assessmentId: existing.assessmentId,
      employeeId: existing.employeeId,
      name: existing.inviteeName,
      email: existing.inviteeEmail,
    },
    actor,
  );
  if (!reissued.ok) return reissued;

  if (!existing.revokedAt) {
    await prisma.assessmentInvitation.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    await recordAudit({
      actor,
      action: "assessment.invitation_revoked",
      entityType: "AssessmentInvitation",
      entityId: existing.id,
      metadata: { reason: "superseded by resend", newInvitationId: reissued.invitation.invitationId },
    });
  }

  log.info("invitation resent", {
    oldInvitationId: existing.id,
    newInvitationId: reissued.invitation.invitationId,
  });
  return reissued;
}

export type BulkIssueResult = {
  invitations: IssuedInvitation[];
  failures: { name: string; message: string }[];
};

/**
 * Issues one invitation per employee, for sending an assessment to a branch
 * or a team in one go rather than one person at a time.
 *
 * Independent per person, deliberately: one bad id or a race with someone
 * closing the assessment mid-batch must not cost the rest of a large group
 * their links. Names for the failure list are resolved up front in one query
 * rather than per-person, since a batch is exactly the case where that adds
 * up.
 */
export async function issueInvitations(
  assessmentId: string,
  employeeIds: string[],
  actor: AuditActor,
): Promise<BulkIssueResult> {
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameOf = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

  const invitations: IssuedInvitation[] = [];
  const failures: { name: string; message: string }[] = [];

  for (const employeeId of employeeIds) {
    const outcome = await issueInvitation({ assessmentId, employeeId }, actor);
    if (outcome.ok) {
      invitations.push(outcome.invitation);
    } else {
      failures.push({ name: nameOf.get(employeeId) ?? employeeId, message: outcome.message });
    }
  }

  return { invitations, failures };
}

// ---------------------------------------------------------------------------
// Public link — a single reusable entry point, instead of HR issuing one
// invitation per person. Opening it mints an ordinary invitation (above) on
// the taker's behalf, so it never becomes a second, weaker credential path:
// everything downstream of that mint — one attempt, one submission, the
// answer key never leaving the server — is the exact same code personal
// invitations already run through.
// ---------------------------------------------------------------------------

function generatePublicLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export type PublicLinkConfig = {
  enabled: boolean;
  nameMode: "REQUIRED" | "OPTIONAL" | "HIDDEN";
  emailMode: "REQUIRED" | "OPTIONAL" | "HIDDEN";
};

/**
 * Turns the public link on/off and sets its identity modes. The token itself
 * is generated once and kept — re-enabling after disabling reuses it, so a
 * link already shared somewhere does not go stale for no reason.
 */
export async function setPublicLinkConfig(
  assessmentId: string,
  config: PublicLinkConfig,
  actor: AuditActor,
): Promise<{ ok: boolean; message?: string }> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, status: true, publicLinkToken: true },
  });
  if (!assessment) return { ok: false, message: "No such assessment." };
  if (config.enabled && assessment.status !== "PUBLISHED") {
    return { ok: false, message: "Publish the assessment before enabling its public link." };
  }

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      publicLinkEnabled: config.enabled,
      publicLinkNameMode: config.nameMode,
      publicLinkEmailMode: config.emailMode,
      publicLinkToken: assessment.publicLinkToken ?? (config.enabled ? generatePublicLinkToken() : null),
    },
  });
  await recordAudit({
    actor,
    action: config.enabled ? "assessment.public_link_enabled" : "assessment.public_link_disabled",
    entityType: "Assessment",
    entityId: assessmentId,
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
 * link, and hands back its token so the caller can send them straight into
 * the normal per-invitation taking flow. Called once per visit — there is no
 * session here, no cookie; opening the public link twice makes two attempts,
 * exactly as two different people opening it does.
 */
export async function startPublicAttempt(publicLinkToken: string): Promise<PublicAttemptOutcome> {
  const assessment = await prisma.assessment.findUnique({
    where: { publicLinkToken },
    select: { id: true, publicLinkEnabled: true },
  });
  if (!assessment) return { ok: false, reason: "NOT_FOUND", message: "This link is not valid." };
  if (!assessment.publicLinkEnabled) {
    return { ok: false, reason: "DISABLED", message: "This link is no longer active." };
  }

  const outcome = await issueInvitation(
    { assessmentId: assessment.id, isPublic: true },
    { userId: null, email: null, role: null },
  );
  if (!outcome.ok) return outcome;

  return { ok: true, token: outcome.invitation.token };
}
