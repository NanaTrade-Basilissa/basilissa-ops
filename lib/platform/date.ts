import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";

/**
 * Ghana (Africa/Accra) is UTC+0 year-round (no daylight saving), so an
 * Accra-local calendar day always lines up with the same UTC day. These
 * helpers still go through Intl with an explicit timeZone rather than
 * assuming that, so the code stays correct if that ever changes and stays
 * self-documenting about which timezone "today"/"this week" mean.
 */

export function formatAccraDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatAccraDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    dateStyle: "medium",
  }).format(date);
}

export function formatAccraTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** YYYY-MM-DD for the given instant, as seen in Accra. Used as a stable bucket key. */
export function accraDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Timezone-general helpers
// ---------------------------------------------------------------------------
// The Accra helpers above are correct because Ghana is UTC+0 year-round: they
// read local date parts and hand them to Date.UTC, which only works when the
// offset is zero. Attendance cannot rely on that — Branch.timezone exists
// precisely so the platform is not quietly single-country — so scheduling uses
// these instead.

/** "YYYY-MM-DD" for an instant, as seen in `timeZone`. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Minutes a zone is ahead of UTC at a given instant. Negative when behind. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;

  // A zero-offset zone formats as bare "GMT" with no digits to parse.
  const match = name ? /GMT([+-])(\d{2}):(\d{2})/.exec(name) : null;
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * The UTC instant of a wall-clock time in a zone.
 *
 * `minutes` is minutes from local midnight, which is how shift templates store
 * their start and end — a template has no date, so it cannot store an instant.
 *
 * Two passes because the offset depends on the very instant being computed. The
 * first guess treats local time as UTC; correcting by the offset there can land
 * on the other side of a DST boundary, so the offset is re-checked and applied
 * again if it moved. Irrelevant in Ghana, load-bearing anywhere with DST.
 */
export function zonedMinutesToUtc(dateKey: string, minutes: number, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = new Date(Date.UTC(year!, month! - 1, day!) + minutes * 60_000);

  const offset = zoneOffsetMinutes(guess, timeZone);
  const corrected = new Date(guess.getTime() - offset * 60_000);

  const settled = zoneOffsetMinutes(corrected, timeZone);
  return settled === offset ? corrected : new Date(guess.getTime() - settled * 60_000);
}

/** ISO weekday for an instant in a zone: 1 = Monday … 7 = Sunday. */
export function isoWeekdayInZone(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
  return index + 1;
}

/** Shifts a "YYYY-MM-DD" key by whole days, staying in the calendar. */
export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return shifted.toISOString().slice(0, 10);
}

function accraLocalPartsToUtc(date: Date, hour: number, minute: number, second: number, ms: number): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
}

export function getAccraDayStart(date = new Date()): Date {
  return accraLocalPartsToUtc(date, 0, 0, 0, 0);
}

export function getAccraDayEnd(date = new Date()): Date {
  return accraLocalPartsToUtc(date, 23, 59, 59, 999);
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Start (00:00 Accra time) of the Monday-start week containing `date`. */
export function getAccraWeekStart(date = new Date()): Date {
  const dayStart = getAccraDayStart(date);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIMEZONE,
    weekday: "short",
  }).format(date);
  const offsetDays = WEEKDAY_INDEX[weekday] ?? 0;
  return new Date(dayStart.getTime() - offsetDays * 24 * 60 * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
