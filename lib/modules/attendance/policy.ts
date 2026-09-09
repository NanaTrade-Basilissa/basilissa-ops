import { BreakPolicy } from "@prisma/client";

/**
 * Attendance policy resolution.
 *
 * Pure — no Prisma, no `server-only`, no I/O — for the same reason
 * `authorization.ts` is: effective-dating is subtle, it decides what people get
 * paid, and "probably right" is not good enough. Everything here is testable
 * from a plain array.
 *
 * The I/O wrapper lives in `policy-repository.ts`.
 */

export type ResolvedPolicy = {
  graceInMinutes: number;
  graceOutMinutes: number;
  overtimeThresholdMinutes: number;
  breakPolicy: BreakPolicy;
  autoDeductMinutes: number;
  autoDeductAfterMinutes: number;
  roundingMinutes: number;
  autoCloseGraceMinutes: number;
  dedupWindowMinutes: number;
  maxManualEntryDays: number;
  branchManagerCanAuthorizeOvertime: boolean;
  isProvisional: boolean;
  /** Which row this came from, or null when the built-in fallback was used. */
  sourcePolicyId: string | null;
  /** Whether a branch-specific row applied, for display and debugging. */
  scope: "branch" | "global" | "fallback";
};

/**
 * Last-resort values, used only when no policy row exists at all — the window
 * between the table being created and the seed running, and in tests.
 *
 * Always provisional. A default that presents itself as settled is how nobody
 * ever gets round to choosing, and the placeholder quietly becomes company
 * policy.
 */
export const FALLBACK_POLICY: ResolvedPolicy = {
  graceInMinutes: 5,
  graceOutMinutes: 5,
  overtimeThresholdMinutes: 10,
  breakPolicy: BreakPolicy.EXPLICIT_PUNCH,
  autoDeductMinutes: 30,
  autoDeductAfterMinutes: 300,
  // Rounding off by default: it is a payroll policy decision, not a
  // convenience, and rounding consistently downward is wage theft in slow
  // motion. Someone must choose it deliberately.
  roundingMinutes: 0,
  autoCloseGraceMinutes: 0,
  dedupWindowMinutes: 5,
  maxManualEntryDays: 7,
  branchManagerCanAuthorizeOvertime: false,
  isProvisional: true,
  sourcePolicyId: null,
  scope: "fallback",
};

/** The shape `resolveFrom` needs. A Prisma row satisfies it. */
export type PolicyRow = Omit<ResolvedPolicy, "sourcePolicyId" | "scope"> & {
  id: string;
  branchId: string | null;
  validFrom: Date;
  validTo: Date | null;
};

function isInEffect(row: PolicyRow, at: Date): boolean {
  if (row.validFrom.getTime() > at.getTime()) return false;
  // validTo is exclusive: a row closed at 09:00 does not govern 09:00 itself,
  // so the row replacing it takes over with no overlap and no gap.
  return row.validTo === null || row.validTo.getTime() > at.getTime();
}

/** Most recently effective wins, so overlapping rows resolve deterministically. */
function mostRecent(rows: PolicyRow[]): PolicyRow | undefined {
  return rows.reduce<PolicyRow | undefined>(
    (best, row) => (!best || row.validFrom.getTime() > best.validFrom.getTime() ? row : best),
    undefined,
  );
}

/**
 * The policy governing `branchId` at instant `at`.
 *
 * `at` is the *work date*, not now. Recomputing a settled day must use the
 * rules that applied when it was worked, or a policy change rewrites history.
 *
 * Resolution: branch-specific row, else global row, else built-in fallback.
 */
export function resolveFrom(
  rows: PolicyRow[],
  branchId: string | null,
  at: Date,
): ResolvedPolicy {
  const effective = rows.filter((row) => isInEffect(row, at));

  const chosen =
    (branchId ? mostRecent(effective.filter((row) => row.branchId === branchId)) : undefined) ??
    mostRecent(effective.filter((row) => row.branchId === null));

  if (!chosen) return FALLBACK_POLICY;

  return {
    graceInMinutes: chosen.graceInMinutes,
    graceOutMinutes: chosen.graceOutMinutes,
    overtimeThresholdMinutes: chosen.overtimeThresholdMinutes,
    breakPolicy: chosen.breakPolicy,
    autoDeductMinutes: chosen.autoDeductMinutes,
    autoDeductAfterMinutes: chosen.autoDeductAfterMinutes,
    roundingMinutes: chosen.roundingMinutes,
    autoCloseGraceMinutes: chosen.autoCloseGraceMinutes,
    dedupWindowMinutes: chosen.dedupWindowMinutes,
    maxManualEntryDays: chosen.maxManualEntryDays,
    branchManagerCanAuthorizeOvertime: chosen.branchManagerCanAuthorizeOvertime ?? false,
    isProvisional: chosen.isProvisional,
    sourcePolicyId: chosen.id,
    scope: chosen.branchId ? "branch" : "global",
  };
}

/** The editable fields, i.e. everything except identity and effective dating. */
export type PolicyInput = Omit<ResolvedPolicy, "sourcePolicyId" | "scope">;

export const POLICY_FIELDS = [
  "graceInMinutes",
  "graceOutMinutes",
  "overtimeThresholdMinutes",
  "breakPolicy",
  "autoDeductMinutes",
  "autoDeductAfterMinutes",
  "roundingMinutes",
  "autoCloseGraceMinutes",
  "dedupWindowMinutes",
  "maxManualEntryDays",
  "branchManagerCanAuthorizeOvertime",
  "isProvisional",
] as const satisfies readonly (keyof PolicyInput)[];

/** Fields that changed between two policies, for audit entries and diffs. */
export function policyChanges(
  before: PolicyInput,
  after: PolicyInput,
): { field: string; before: unknown; after: unknown }[] {
  return POLICY_FIELDS.filter((field) => before[field] !== after[field]).map((field) => ({
    field,
    before: before[field],
    after: after[field],
  }));
}
