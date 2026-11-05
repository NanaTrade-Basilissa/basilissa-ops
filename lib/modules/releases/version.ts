/**
 * Pure version logic for mobile app releases. No I/O, so the update decision
 * the API makes is exhaustively testable. Client-safe.
 */

export const APP_PLATFORMS = ["IOS", "ANDROID"] as const;
export type AppPlatformKey = (typeof APP_PLATFORMS)[number];

export const UPDATE_MODES = ["FLEXIBLE", "REQUIRED"] as const;
export type UpdateModeKey = (typeof UPDATE_MODES)[number];

export const PLATFORM_LABELS: Record<AppPlatformKey, string> = {
  IOS: "iOS",
  ANDROID: "Android",
};

export const UPDATE_MODE_LABELS: Record<UpdateModeKey, string> = {
  FLEXIBLE: "Flexible",
  REQUIRED: "Required",
};

/** `1`, `1.2` or `1.2.3`: numeric parts only. No build suffixes or "v" prefix. */
const VERSION_PATTERN = /^\d{1,4}(\.\d{1,4}){0,2}$/;

export function isValidVersion(version: string): boolean {
  return VERSION_PATTERN.test(version.trim());
}

/** Missing parts count as zero, so `1.2` and `1.2.0` are the same version. */
export function parseVersion(version: string): [number, number, number] | null {
  const trimmed = version.trim();
  if (!VERSION_PATTERN.test(trimmed)) return null;
  const [major = 0, minor = 0, patch = 0] = trimmed.split(".").map(Number);
  return [major, minor, patch];
}

/** Numeric, never lexical: 1.10.0 is newer than 1.9.0. Returns <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) throw new Error(`Cannot compare invalid versions "${a}" and "${b}".`);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export type ReleaseLike = {
  version: string;
  updateMode: UpdateModeKey;
  releaseNotes: string | null;
};

export type UpdateStatus = {
  updateAvailable: boolean;
  /** NONE when the build is current, otherwise how hard to push. */
  updateMode: "NONE" | UpdateModeKey;
  latestVersion: string | null;
  /**
   * The newest version marked REQUIRED, or null. The app persists this so it can
   * keep blocking an out-of-date build while offline.
   */
  minRequiredVersion: string | null;
  releaseNotes: string | null;
};

/**
 * Decides what an installed build should be told.
 *
 * Required means "everyone below this version must update", not "only the
 * previous version": a user two releases behind is blocked just the same. A
 * newer release supersedes an older required one simply by being newer; if the
 * newer release is flexible, the older required floor still applies to builds
 * below it.
 */
export function resolveUpdateStatus(
  releases: readonly ReleaseLike[],
  currentVersion: string,
): UpdateStatus {
  const valid = releases.filter((r) => isValidVersion(r.version));
  const sorted = [...valid].sort((a, b) => compareVersions(b.version, a.version));
  const latest = sorted[0] ?? null;
  const requiredFloor = sorted.find((r) => r.updateMode === "REQUIRED") ?? null;

  const base = {
    latestVersion: latest?.version ?? null,
    minRequiredVersion: requiredFloor?.version ?? null,
    releaseNotes: latest?.releaseNotes ?? null,
  };

  if (!latest || !isValidVersion(currentVersion)) {
    return { updateAvailable: false, updateMode: "NONE", ...base };
  }

  if (requiredFloor && compareVersions(currentVersion, requiredFloor.version) < 0) {
    return { updateAvailable: true, updateMode: "REQUIRED", ...base };
  }
  if (compareVersions(currentVersion, latest.version) < 0) {
    return { updateAvailable: true, updateMode: "FLEXIBLE", ...base };
  }
  return { updateAvailable: false, updateMode: "NONE", ...base };
}
