import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";

const log = scoped("audit");

/**
 * Audit writer.
 *
 * Lives in `lib/platform` because every domain module needs it and it must not
 * depend on any of them — including identity. That is why the actor arrives as
 * plain fields rather than an `Actor`: inverting that dependency would make the
 * audit trail unusable from the module it most needs to record.
 *
 * IT THROWS, AND THAT IS DELIBERATE
 * ---------------------------------
 * Compare `sendEmail`, which never throws and reports instead: a Resend outage
 * must never fail a customer's feedback submission, because the submission is
 * the point and the email is a courtesy. Its caller decides what the failure
 * is worth — for the notification job, another attempt.
 *
 * Audit is the opposite. This data will feed payroll. "We changed your hours
 * but there is no record of who or why" is a worse outcome than "the change
 * did not go through" — the first is unrecoverable and the second is a retry.
 * So a failed audit write fails the operation, and inside a transaction it
 * rolls the whole thing back.
 *
 * Which is why `tx` matters: pass the transaction client and the business
 * change and its audit entry commit together or not at all. Writing audit
 * outside the transaction re-opens exactly the gap this is meant to close.
 */

/** Actor fields, denormalised at write time so the entry survives the user. */
export type AuditActor = {
  userId: string | null;
  email: string | null;
  /** The role actually used, which may differ from the role held later. */
  role: string | null;
};

/** The system itself: scheduled jobs, migrations, automatic close-outs. */
export const SYSTEM_ACTOR: AuditActor = { userId: null, email: null, role: "SYSTEM" };

/**
 * `<entity>.<verb>` — "branch.updated", "question.deactivated".
 *
 * A template type rather than a central union of every action: a registry in
 * `lib/platform` would have to be edited by every module that records
 * anything, which is the dependency direction this file exists to avoid. The
 * shape is enforced; the vocabulary is the module's own.
 */
export type AuditAction = `${string}.${string}`;

export type AuditEntry = {
  actor: AuditActor;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** Omit where it does not apply: a creation has no before. */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  /** Reason codes, rejected values, check outcomes — anything not a field diff. */
  metadata?: Prisma.InputJsonValue;
};

/** Prisma client or transaction client — both satisfy the calls made here. */
type Writer = Pick<typeof prisma, "auditLog"> | Prisma.TransactionClient;

/**
 * Records one audit entry.
 *
 * Pass `tx` whenever the audited change is itself in a transaction, so the two
 * share a fate.
 *
 * @throws if the write fails. See the note above — this is not an oversight.
 */
export async function recordAudit(entry: AuditEntry, tx?: Writer): Promise<void> {
  const client = tx ?? prisma;

  await client.auditLog.create({
    data: {
      actorUserId: entry.actor.userId,
      actorEmail: entry.actor.email,
      actorRole: entry.actor.role,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      metadata: entry.metadata,
    },
  });
}

/**
 * Records an entry for something that is worth noticing but must not break the
 * flow it observes — a failed sign-in being the motivating case, where throwing
 * would turn "wrong password" into a server error and hand an attacker a
 * denial-of-service.
 *
 * Use sparingly, and never for anything that changes state a person could later
 * dispute.
 */
export async function recordAuditBestEffort(entry: AuditEntry, tx?: Writer): Promise<void> {
  try {
    await recordAudit(entry, tx);
  } catch (error) {
    log.error("failed to record entry", {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      error,
    });
  }
}

/**
 * Narrows an object to the fields worth diffing, dropping noise like
 * `updatedAt` that changes on every write and tells a reader nothing.
 */
export function auditSnapshot<T extends Record<string, unknown>, K extends keyof T>(
  source: T,
  fields: readonly K[],
): Prisma.InputJsonValue {
  const snapshot: Record<string, unknown> = {};
  for (const field of fields) {
    snapshot[field as string] = source[field] ?? null;
  }
  return snapshot as Prisma.InputJsonValue;
}
