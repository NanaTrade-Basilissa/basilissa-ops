/**
 * Announcement values safe to import anywhere, including Client Components.
 * See docs/specs/announcements.md.
 */

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 2000;

/**
 * How much of the body a push shows. A lock screen is not private, so push
 * carries a short preview and an id; the full text is in the inbox.
 */
export const PUSH_BODY_PREVIEW_MAX = 140;

export const AUDIENCE_KINDS = ["ALL", "BRANCHES", "PEOPLE"] as const;
export type AudienceKind = (typeof AUDIENCE_KINDS)[number];

export const AUDIENCE_LABELS: Record<AudienceKind, { label: string; description: string }> = {
  ALL: { label: "Everyone", description: "Every active employee, at every branch" },
  BRANCHES: { label: "Branches", description: "Everyone currently assigned to the branches you choose" },
  PEOPLE: { label: "Specific people", description: "Only the employees you choose" },
};
