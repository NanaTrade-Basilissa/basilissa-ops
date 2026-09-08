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
  expiresAt: Date;
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
  input: { assessmentId: string; employeeId?: string | null; name?: string; email?: string | null },
  actor: AuditActor,
): Promise<IssueOutcome> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: input.assessmentId },
    select: {
      id: true,
      title: true,
      status: true,
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

  if (!inviteeName) {
    return { ok: false, reason: "EMPLOYEE_NOT_FOUND", message: "Give a name for the invitation." };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + assessment.invitationTtlHours * 3_600_000);

  const invitation = await prisma.assessmentInvitation.create({
    data: {
      assessmentId: assessment.id,
      employeeId: input.employeeId ?? null,
      inviteeName,
      inviteeEmail,
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
      expiresAt: expiresAt.toISOString(),
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
