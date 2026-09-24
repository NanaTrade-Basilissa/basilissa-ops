/**
 * Fixtures for the Dawhenya attendance pilot. Script-only, like `seed-data.ts`.
 *
 * Source: the branch's printed rota for Monday 21 to Sunday 27 September 2026,
 * narrowed to staff on the Android lists who resolve to exactly one employee
 * record at Dawhenya. Martin, Josephine, Everlove, Issabelle and Doreen are on
 * the Android lists but have no Dawhenya record, so they are left out rather
 * than guessed at.
 */

export type PilotShiftKey = "MORNING" | "EVENING" | "FULL_DAY" | "NINE_TO_FIVE";

/**
 * Global templates (no branch), because 09:00-17:00 staff are not only at
 * Dawhenya. Unpaid break is 0 until the break rule is agreed.
 */
export const PILOT_SHIFT_TEMPLATES: Record<
  PilotShiftKey,
  { name: string; startMinute: number; endMinute: number; unpaidBreakMinutes: number }
> = {
  MORNING: { name: "Morning (07:00-15:00)", startMinute: 7 * 60, endMinute: 15 * 60, unpaidBreakMinutes: 0 },
  EVENING: { name: "Evening (15:00-23:00)", startMinute: 15 * 60, endMinute: 23 * 60, unpaidBreakMinutes: 0 },
  // For anyone rostered on both the morning and the evening shift the same
  // day. The schedule resolver allows one shift per employee per day.
  FULL_DAY: { name: "Full Day (07:00-23:00)", startMinute: 7 * 60, endMinute: 23 * 60, unpaidBreakMinutes: 0 },
  NINE_TO_FIVE: { name: "Day (09:00-17:00)", startMinute: 9 * 60, endMinute: 17 * 60, unpaidBreakMinutes: 0 },
};

export const PILOT_BRANCH_SLUG = "community-25-dawhenya";

/** Local dates, inclusive. Monday to Sunday. */
export const PILOT_WEEK = { from: "2026-09-21", to: "2026-09-27" } as const;

type Day = PilotShiftKey | "OFF";

/**
 * One entry per ISO weekday, Monday first. `expectFirstName` is checked
 * against the record so a code typo fails loudly instead of rostering the
 * wrong person.
 */
export const PILOT_ROTA: ReadonlyArray<{
  employeeCode: string;
  expectFirstName: string;
  rotaName: string;
  week: readonly [Day, Day, Day, Day, Day, Day, Day];
}> = [
  { employeeCode: "EMP0129", expectFirstName: "HELLEN", rotaName: "Hellen (Frontliner)", week: ["EVENING", "OFF", "EVENING", "EVENING", "EVENING", "EVENING", "EVENING"] },
  // Frontliner on the rota, "Cook" on the record. Only Rashid at the branch.
  { employeeCode: "EMP0128", expectFirstName: "RASHID", rotaName: "Rashid (Frontliner)", week: ["EVENING", "OFF", "EVENING", "EVENING", "EVENING", "EVENING", "EVENING"] },
  { employeeCode: "EMP0125", expectFirstName: "COMFORT", rotaName: "Comfort (Chef)", week: ["MORNING", "MORNING", "OFF", "EVENING", "FULL_DAY", "FULL_DAY", "FULL_DAY"] },
  { employeeCode: "EMP0107", expectFirstName: "COMFORT", rotaName: "Comfort (Cook)", week: ["MORNING", "OFF", "MORNING", "MORNING", "MORNING", "MORNING", "MORNING"] },
  // "Kuleke" on the Android list is Sampson's surname.
  { employeeCode: "EMP0124", expectFirstName: "SAMPSON", rotaName: "Sampson (Cook)", week: ["MORNING", "OFF", "MORNING", "MORNING", "MORNING", "MORNING", "MORNING"] },
  { employeeCode: "EMP0106", expectFirstName: "JOANA", rotaName: "Joana (Cook)", week: ["MORNING", "MORNING", "OFF", "MORNING", "MORNING", "MORNING", "MORNING"] },
  { employeeCode: "EMP0111", expectFirstName: "PATIENCE", rotaName: "Patience (Cook)", week: ["EVENING", "OFF", "EVENING", "EVENING", "EVENING", "EVENING", "EVENING"] },
  { employeeCode: "EMP0117", expectFirstName: "JENNIFER", rotaName: "Jennifer (Cook)", week: ["EVENING", "EVENING", "OFF", "EVENING", "EVENING", "EVENING", "EVENING"] },
  // First and last name are swapped on this record: "Peprah-Sarfo Clara".
  { employeeCode: "EMP0120", expectFirstName: "PEPRAH-SARFO", rotaName: "Clara (Cook)", week: ["EVENING", "OFF", "EVENING", "EVENING", "EVENING", "EVENING", "EVENING"] },
  { employeeCode: "EMP0118", expectFirstName: "HELINA", rotaName: "Helina (Cleaner)", week: ["EVENING", "EVENING", "OFF", "EVENING", "EVENING", "EVENING", "EVENING"] },
];

/** `--apply` writes; anything else is a dry run. */
export function isApply(): boolean {
  return process.argv.includes("--apply");
}

/**
 * Refuses a non-local database unless explicitly allowed. Production
 * migrations and data changes are run by the user, not by a script left on
 * the default.
 */
export function assertSafeDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is missing or not a URL.");
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "postgres";
  if (!local && process.env.PILOT_ALLOW_REMOTE !== "1") {
    throw new Error(`Refusing to run against ${host}. Set PILOT_ALLOW_REMOTE=1 if this is intended.`);
  }
  console.log(`Database host: ${host}${isApply() ? "" : "  (dry run, pass --apply to write)"}`);
}
