import type { BranchScope } from "@/lib/modules/identity/authorization";

/**
 * Who an announcement goes to, and whether the sender may send it there.
 *
 * Pure, and deliberately so: this is the rule that stops a branch manager
 * messaging another branch's staff, and "probably right" is not good enough. No
 * I/O; `service.ts` loads the directory and calls these.
 */

export type AudienceSpec =
  | { kind: "ALL" }
  | { kind: "BRANCHES"; branchIds: string[] }
  | { kind: "PEOPLE"; employeeIds: string[] };

/** The part of an employee these rules need. */
export type DirectoryEntry = {
  id: string;
  /** Only ACTIVE employees receive anything. */
  active: boolean;
  /** Branches the employee is currently assigned to. */
  branchIds: string[];
};

export type AudienceRefusal =
  /** Everyone needs a GLOBAL grant. */
  | "ALL_NEEDS_GLOBAL"
  | "BRANCH_OUT_OF_SCOPE"
  | "PERSON_OUT_OF_SCOPE"
  | "UNKNOWN_PERSON"
  | "NO_ACCESS";

export type AudienceCheck = { ok: true } | { ok: false; reason: AudienceRefusal };

/**
 * What the compose screen shows before sending. Defined here, with the rules it
 * reports on, so a Client Component can import it without reaching into the
 * server-only service.
 */
export type AudiencePreview =
  | { ok: true; recipients: number; withApp: number; withoutApp: number }
  | { ok: false; error: AudienceRefusal | "NO_RECIPIENTS" };

/**
 * May the sender, holding this scope, send to this audience?
 *
 * - `all` scope (a GLOBAL grant): anything.
 * - `branches` scope: never Everyone; branches only from their own; people only
 *   if each is assigned to at least one of their branches.
 * - `none`: nothing.
 *
 * An empty branch scope never widens: an unknown person is refused, not allowed.
 */
export function checkAudienceAllowed(
  spec: AudienceSpec,
  scope: BranchScope,
  directory: readonly DirectoryEntry[],
): AudienceCheck {
  if (scope.kind === "none") return { ok: false, reason: "NO_ACCESS" };
  if (scope.kind === "all") {
    if (spec.kind === "PEOPLE") return checkPeopleExist(spec.employeeIds, directory);
    return { ok: true };
  }

  const allowed = new Set(scope.branchIds);
  switch (spec.kind) {
    case "ALL":
      return { ok: false, reason: "ALL_NEEDS_GLOBAL" };
    case "BRANCHES":
      return spec.branchIds.every((branchId) => allowed.has(branchId))
        ? { ok: true }
        : { ok: false, reason: "BRANCH_OUT_OF_SCOPE" };
    case "PEOPLE": {
      const exist = checkPeopleExist(spec.employeeIds, directory);
      if (!exist.ok) return exist;
      const byId = new Map(directory.map((entry) => [entry.id, entry]));
      const everyoneInScope = spec.employeeIds.every((employeeId) =>
        byId.get(employeeId)!.branchIds.some((branchId) => allowed.has(branchId)),
      );
      return everyoneInScope ? { ok: true } : { ok: false, reason: "PERSON_OUT_OF_SCOPE" };
    }
  }
}

function checkPeopleExist(employeeIds: readonly string[], directory: readonly DirectoryEntry[]): AudienceCheck {
  const known = new Set(directory.map((entry) => entry.id));
  return employeeIds.every((employeeId) => known.has(employeeId))
    ? { ok: true }
    : { ok: false, reason: "UNKNOWN_PERSON" };
}

/**
 * The employees who receive it: active only, each once, in a stable order.
 * Resolved once at send time and stored, so "who was this sent to" does not
 * change when people later move branches.
 */
export function resolveRecipients(spec: AudienceSpec, directory: readonly DirectoryEntry[]): string[] {
  const active = directory.filter((entry) => entry.active);
  let chosen: readonly DirectoryEntry[];
  switch (spec.kind) {
    case "ALL":
      chosen = active;
      break;
    case "BRANCHES": {
      const branches = new Set(spec.branchIds);
      chosen = active.filter((entry) => entry.branchIds.some((branchId) => branches.has(branchId)));
      break;
    }
    case "PEOPLE": {
      const people = new Set(spec.employeeIds);
      chosen = active.filter((entry) => people.has(entry.id));
      break;
    }
  }
  return [...new Set(chosen.map((entry) => entry.id))].sort();
}

export const REFUSAL_MESSAGES: Record<AudienceRefusal, string> = {
  ALL_NEEDS_GLOBAL: "Only someone with company-wide access can send to everyone. Choose your branches instead.",
  BRANCH_OUT_OF_SCOPE: "You can only send to branches you manage.",
  PERSON_OUT_OF_SCOPE: "You can only send to people at branches you manage.",
  UNKNOWN_PERSON: "One of the chosen people could not be found.",
  NO_ACCESS: "You do not have access to send announcements.",
};
