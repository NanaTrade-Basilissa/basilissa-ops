import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "./session";
import { MFA_REQUIRED_ROLES, hasMfaEnabled } from "./mfa";
import {
  branchScope,
  can,
  type Actor,
  type BranchScope,
  type Permission,
  type ResourceScope,
} from "./authorization";

/**
 * Data Access Layer — the authorisation boundary.
 *
 * `proxy.ts` only checks whether a session cookie exists, so that protected
 * pages redirect without a database round trip. It is a routing optimisation,
 * not a security control. Everything that actually reads or writes data calls
 * into this file, per Next.js's documented defence-in-depth pattern.
 *
 * `cache()` collapses repeat calls within one request, so a layout and its
 * page share a single session lookup.
 */

export const verifySession = cache(async (): Promise<Actor | null> => {
  const session = await getSession();
  if (!session) return null;

  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    status: session.user.status,
    assignments: session.user.assignments,
  };
});

/** Require any authenticated, active user. Redirects to login otherwise. */
export async function requireAuth(): Promise<Actor> {
  const actor = await verifySession();
  if (!actor) redirect("/admin/login");
  return actor;
}

/**
 * Require a specific permission, optionally against a specific resource.
 *
 * An authenticated user who lacks the permission is sent to the dashboard
 * rather than the login page: bouncing a signed-in person to a login form
 * suggests their session broke, when the real answer is that they may not do
 * this.
 */
export async function requirePermission(
  permission: Permission,
  resource?: ResourceScope,
): Promise<Actor> {
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);
  if (!can(actor, permission, resource)) redirect("/admin?denied=1");
  return actor;
}

/**
 * The gate for the admin shell layout, and the only thing that should use it.
 *
 * Deliberately does NOT apply the MFA check. The layout wraps every admin page
 * INCLUDING the enrolment page, so a layout that redirects to enrolment
 * redirects the enrolment page to itself — an infinite loop that locks out
 * exactly the people the check is meant to protect. The MFA gate belongs on
 * the pages, where the enrolment page can opt out of it by using `requireAuth`.
 *
 * Denial goes to `/admin/no-access`, which sits OUTSIDE this layout. Sending it
 * to `/admin?denied=1` would be the same loop wearing a different hat: the
 * dashboard is inside the layout that just refused them.
 *
 * This is not the security boundary. It gates the chrome so that someone with
 * no business here does not see the navigation; every page underneath still
 * checks the specific permission it needs.
 */
export async function requireAdminShell(): Promise<Actor> {
  const actor = await requireAuth();
  if (!can(actor, "admin:access")) redirect("/admin/no-access");
  return actor;
}

/**
 * Withholds privileged pages until a second factor exists, without ever
 * locking anyone out.
 *
 * The obvious enforcement — refuse the sign-in — risks stranding the only
 * Super Admin if enrolment goes wrong, and a grace period only moves the
 * problem to whenever it expires. Instead the person signs in normally and is
 * sent to enrolment, which uses `requireAuth` rather than `requirePermission`
 * and so stays reachable.
 *
 * That only holds while NOTHING in the enrolment page's render path calls
 * `requirePermission` — layouts included. It did not hold when this shipped:
 * the shared admin layout gated on `requirePermission`, so the redirect
 * target redirected to itself and every affected user was locked out of the
 * admin area entirely. `requireAdminShell` exists to keep that from
 * reoccurring, and `tests/mfa-enforcement.test.ts` pins it.
 */
export async function requireMfaIfNeeded(actor: Actor): Promise<void> {
  const needsMfa = actor.assignments.some((assignment) =>
    MFA_REQUIRED_ROLES.includes(assignment.role),
  );
  if (!needsMfa) return;

  if (!(await hasMfaEnabled(actor.userId))) {
    redirect("/admin/security?enrol=required");
  }
}

/**
 * Require `permission` over one specific branch.
 *
 * `requirePermission(p)` with no resource deliberately demands a GLOBAL grant —
 * naming no branch must never widen access — so a branch-scoped manager fails
 * it even for their own branch. Naming the branch is what admits them.
 *
 * Refuses with `notFound()` rather than a denial. Someone who may not touch
 * this branch has no business learning it exists, and a 404 answers "wrong id"
 * and "not yours" identically, so the refusal cannot be used to enumerate the
 * estate.
 */
export async function requireBranchPermission(
  permission: Permission,
  branchId: string,
): Promise<Actor> {
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);
  if (!can(actor, permission, { branchId })) notFound();
  return actor;
}

/**
 * Which branches may the current user exercise `permission` over?
 *
 * Repositories use this to constrain queries. A `none` result must produce an
 * empty result set without querying — never an unfiltered one.
 */
export async function currentBranchScope(permission: Permission): Promise<BranchScope> {
  const actor = await requireAuth();
  return branchScope(actor, permission);
}

/**
 * Require `permission` over at least one branch — GLOBAL, or one or more
 * BRANCH grants. Refuses only someone with no usable grant at all.
 *
 * The third gate a list page needs, distinct from the other two:
 * `requirePermission(p)` demands GLOBAL specifically (naming no branch must
 * never widen access), and `requireBranchPermission(p, id)` demands the grant
 * cover that one named branch. A list page is neither — it has no branch to
 * name yet, and refusing anyone without a GLOBAL grant is what left every
 * branch-scoped manager unable to reach their own branch's list at all.
 *
 * Returns the resolved `BranchScope` alongside the actor so the caller does
 * not immediately have to call `branchScope` again to build its query —
 * every list page needs the scope one way or another, so returning it here
 * saves the second lookup rather than expecting the caller to know that.
 */
export async function requireAnyBranchPermission(
  permission: Permission,
): Promise<{ actor: Actor; scope: BranchScope }> {
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);
  const scope = branchScope(actor, permission);
  if (scope.kind === "none") redirect("/admin?denied=1");
  return { actor, scope };
}

export { can, branchScope };
export type { Actor, BranchScope, Permission, ResourceScope };
