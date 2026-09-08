import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import {
  POLICY_FIELDS,
  policyChanges,
  resolveFrom,
  type PolicyInput,
  type PolicyRow,
  type ResolvedPolicy,
} from "./policy";

/**
 * Persistence for attendance policy. The rules themselves live in `policy.ts`,
 * which stays pure; this file only fetches and writes.
 */

/** Columns `resolveFrom` needs. Kept in one place so the two cannot drift. */
const POLICY_SELECT = {
  id: true,
  branchId: true,
  validFrom: true,
  validTo: true,
  graceInMinutes: true,
  graceOutMinutes: true,
  overtimeThresholdMinutes: true,
  breakPolicy: true,
  autoDeductMinutes: true,
  autoDeductAfterMinutes: true,
  roundingMinutes: true,
  autoCloseGraceMinutes: true,
  dedupWindowMinutes: true,
  maxManualEntryDays: true,
  isProvisional: true,
} satisfies Prisma.AttendancePolicySelect;

/**
 * The policy governing `branchId` at `at`.
 *
 * `at` is the work date, not now — see the note in policy.ts. Callers settling
 * or re-settling a day must pass that day, or a later policy change silently
 * rewrites what was already worked.
 */
export async function resolvePolicy(
  branchId: string | null,
  at: Date = new Date(),
): Promise<ResolvedPolicy> {
  // Fetch both scopes and let resolveFrom pick; the precedence rule lives in
  // one place rather than being half-expressed as a query.
  const rows = await prisma.attendancePolicy.findMany({
    where: {
      validFrom: { lte: at },
      ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : { branchId: null }),
    },
    select: POLICY_SELECT,
  });

  return resolveFrom(rows as PolicyRow[], branchId, at);
}

/** Every version ever in effect for a scope, newest first. For the audit view. */
export async function policyHistory(branchId: string | null) {
  return prisma.attendancePolicy.findMany({
    where: { branchId },
    orderBy: { validFrom: "desc" },
    select: { ...POLICY_SELECT, createdBy: true, changeReason: true, createdAt: true },
  });
}

/**
 * Puts a new policy version into effect.
 *
 * Supersede, never update: the current row is closed at `effectiveFrom` and a
 * new one opens at the same instant. Editing in place would rewrite the rules
 * that already-settled days were calculated under, which is the entire failure
 * this design exists to prevent.
 *
 * The close, the insert and the audit entry share one transaction, so there is
 * no moment where two versions are live or none is.
 */
export async function supersedePolicy(
  branchId: string | null,
  input: PolicyInput,
  actor: AuditActor,
  // Separate from `input` rather than a policy field: it describes the change,
  // not the rules, so it must never take part in resolution or in the diff
  // that says what actually moved.
  changeReason: string,
  effectiveFrom: Date = new Date(),
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.attendancePolicy.findFirst({
      where: { branchId, validTo: null },
      orderBy: { validFrom: "desc" },
      select: POLICY_SELECT,
    });

    if (current) {
      await tx.attendancePolicy.update({
        where: { id: current.id },
        data: { validTo: effectiveFrom },
      });
    }

    // Fields are picked explicitly rather than spread. `ResolvedPolicy` is a
    // superset of `PolicyInput` — it also carries sourcePolicyId and scope,
    // which are derived and not columns — and structural typing happily lets a
    // caller pass one. Spreading it fails at runtime with an unhelpful Prisma
    // error; picking cannot.
    const created = await tx.attendancePolicy.create({
      data: {
        branchId,
        validFrom: effectiveFrom,
        createdBy: actor.userId,
        changeReason,
        ...(Object.fromEntries(
          POLICY_FIELDS.map((field) => [field, input[field]]),
        ) as Pick<PolicyInput, (typeof POLICY_FIELDS)[number]>),
      },
      select: { id: true },
    });

    await recordAudit(
      {
        actor,
        action: "attendance_policy.superseded",
        entityType: "AttendancePolicy",
        entityId: created.id,
        before: current ? (current as unknown as Prisma.InputJsonValue) : undefined,
        after: input as unknown as Prisma.InputJsonValue,
        metadata: {
          branchId,
          supersededPolicyId: current?.id ?? null,
          effectiveFrom: effectiveFrom.toISOString(),
          changeReason,
          // The precise diff, so a reviewer does not have to compare two blobs
          // to see that someone moved the overtime threshold.
          changes: current ? policyChanges(current as PolicyInput, input) : [],
        } as Prisma.InputJsonValue,
      },
      tx,
    );

    return created.id;
  });
}
