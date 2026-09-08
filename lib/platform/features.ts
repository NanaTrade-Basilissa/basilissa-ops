/**
 * Feature flags: which unfinished surfaces exist in this deployment.
 *
 * Environment-driven, with no database table and no service. Flipping one is a
 * deploy, which is exactly when you would turn a feature on anyway — and a
 * flag store would be another dependency to justify (ADR 0002) for a problem
 * that a variable already solves.
 *
 * DELIBERATELY NOT AUTHORISATION. A flag answers "does this exist here yet",
 * permissions answer "may you use it". Attendance is gated because the capture
 * paths are unbuilt and the payroll thresholds are still placeholders, not
 * because it is sensitive.
 *
 * No imports from `next/*`. The worker reads these too, and importing
 * `next/navigation` in a plain Node process kills it at startup — see
 * lib/modules/identity/jobs.ts. The redirecting guard lives in
 * `features-guard.ts` for that reason.
 */

export const FEATURES = {
  /**
   * Attendance, scheduling and the policy editor, which ship and fail
   * together: a rota with nothing recording against it is a list, and the
   * policy editor configures rules nothing is applying yet.
   *
   * Off in production until the payroll values are confirmed (A1) and at least
   * one real capture path exists. Until then a manager could record attendance
   * by hand and it would be calculated with placeholder thresholds — which is
   * worse than the feature being absent, because the numbers would look
   * deliberate.
   */
  attendance: "FEATURE_ATTENDANCE",

  /**
   * Timed aptitude tests for job candidates. Off in production until real
   * timed tests have gone through the server-side deadline enforcement and
   * the worker's auto-submit sweep successfully — both are new, unproven
   * mechanisms on a brand-new public-facing surface, and a flag is a
   * rollback lever with no deploy while that's validated. Same rationale as
   * `attendance`: unfinished capture paths are worse absent than exposed.
   */
  aptitude: "FEATURE_APTITUDE_TESTS",
} as const satisfies Record<string, `FEATURE_${string}`>;

export type FeatureName = keyof typeof FEATURES;

/**
 * Defaults by environment, overridden by the variable either way.
 *
 * On outside production so local development and tests need no setup; off in
 * production so a flag somebody forgets to set fails towards the feature being
 * invisible rather than towards it being exposed. Forgetting costs a deploy;
 * the opposite costs an explanation.
 */
function defaultFor(): boolean {
  return process.env.NODE_ENV !== "production";
}

function parse(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "on", "yes", "enabled"].includes(value)) return true;
  if (["0", "false", "off", "no", "disabled", ""].includes(value)) return false;
  // An unrecognised value is a typo, and a typo must not silently enable
  // something. Fall through to the environment default.
  return null;
}

export function isFeatureEnabled(name: FeatureName): boolean {
  return parse(process.env[FEATURES[name]]) ?? defaultFor();
}

/** Every flag and its current state, for a diagnostics view or a log line. */
export function featureSnapshot(): Record<FeatureName, boolean> {
  const entries = (Object.keys(FEATURES) as FeatureName[]).map((name) => [
    name,
    isFeatureEnabled(name),
  ]);
  return Object.fromEntries(entries) as Record<FeatureName, boolean>;
}
