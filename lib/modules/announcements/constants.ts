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

/** How long an urgent banner stays up. A choice, not a free number, so a banner cannot be left up for weeks. */
export const BANNER_HOURS = [4, 12, 24, 72] as const;
export const DEFAULT_BANNER_HOURS = 24;

/**
 * SMS costs money for every message. A send that would text more people than this
 * is refused, so a slip cannot run up a bill: send to fewer people, or use push
 * and email. Raise it deliberately.
 */
export const MAX_SMS_RECIPIENTS = 300;
export const SMS_MESSAGE_MAX = 320;

/**
 * Automatic reminders to confirm. The first goes out after a delay (shorter for an
 * urgent announcement), then one a day, at most three, and none for an
 * announcement older than a week.
 */
export const ACK_REMINDER = {
  firstDelayHours: 4,
  urgentFirstDelayHours: 1,
  repeatEveryHours: 24,
  maxReminders: 3,
  stopAfterDays: 7,
} as const;

export const AUDIENCE_KINDS = ["ALL", "BRANCHES", "PEOPLE"] as const;
export type AudienceKind = (typeof AUDIENCE_KINDS)[number];

export const AUDIENCE_LABELS: Record<AudienceKind, { label: string; description: string }> = {
  ALL: { label: "Everyone", description: "Every active employee, at every branch" },
  BRANCHES: { label: "Branches", description: "Everyone currently assigned to the branches you choose" },
  PEOPLE: { label: "Specific people", description: "Only the employees you choose" },
};

/** A number worth texting: Ghanaian local or international format, or any plausible international number. */
export function isUsablePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const compact = phone.replace(/[\s-]/g, "");
  return /^(\+?233|0)\d{9}$/.test(compact) || /^\+\d{10,15}$/.test(compact);
}

/** The text message for an announcement: title then body, never over the limit. The gateway adds the sender name. */
export function smsText(title: string, body: string): string {
  const text = `${title.trim()}. ${body.replace(/\s+/g, " ").trim()}`;
  return text.length <= SMS_MESSAGE_MAX ? text : `${text.slice(0, SMS_MESSAGE_MAX - 1).trimEnd()}…`;
}

/**
 * Is this person due an automatic reminder to confirm? Pure, so the schedule is
 * testable exactly: first after a delay (shorter for urgent), then daily, a few
 * times at most, and never for an announcement older than a week.
 */
export function ackReminderDue(
  recipient: { acknowledgedAt: Date | null; ackReminderCount: number; ackRemindedAt: Date | null },
  announcement: { requiresAck: boolean; isUrgent: boolean; createdAt: Date },
  now: Date,
): boolean {
  if (!announcement.requiresAck || recipient.acknowledgedAt) return false;
  if (recipient.ackReminderCount >= ACK_REMINDER.maxReminders) return false;
  const hours = (from: Date) => (now.getTime() - from.getTime()) / 3_600_000;
  if (hours(announcement.createdAt) > ACK_REMINDER.stopAfterDays * 24) return false;
  if (recipient.ackRemindedAt) return hours(recipient.ackRemindedAt) >= ACK_REMINDER.repeatEveryHours;
  const first = announcement.isUrgent ? ACK_REMINDER.urgentFirstDelayHours : ACK_REMINDER.firstDelayHours;
  return hours(announcement.createdAt) >= first;
}
