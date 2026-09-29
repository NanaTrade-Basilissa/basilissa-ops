/**
 * Fixtures for the Dawhenya attendance pilot. Script-only, like `seed-data.ts`.
 *
 * Source: the branch's six printed rotas (supervisors, chefs, cooks,
 * frontliners, riders, cleaner) for Monday 28 September to Sunday 4 October
 * 2026. Everyone on them, 24 people. The week of 21 to 27 September was
 * dropped: nobody clocked in.
 *
 * A name on both the morning and evening column of a day is FULL_DAY, as on
 * the sheets (the riders most days, the supervisors and chefs once each).
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
export const PILOT_WEEK = { from: "2026-09-28", to: "2026-10-04" } as const;

/**
 * `null` is a day the rota leaves open (Josephine from Thursday: not decided
 * yet). Nothing is written for it, so the day falls through to whatever else
 * the employee has, which is normally nothing.
 */
type Day = PilotShiftKey | "OFF" | null;

/**
 * People on the rota with no employee record. Created as placeholders so the
 * week can be scheduled; replace with the real record when there is one. The
 * `PILOT-` prefix keeps them out of the importer's EMP#### numbering.
 */
export const PILOT_PLACEHOLDERS: ReadonlyArray<{
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
}> = [
  { employeeCode: "PILOT-MARTIN", firstName: "MARTIN", lastName: "PLACEHOLDER", jobTitle: "Frontliner" },
  // No Atsu anywhere in the records. The Dawhenya riders on file are Essau
  // Ahianyo (EMP0110) and Charles Tetteh (EMP0126); if Atsu is one of them,
  // use that code instead.
  { employeeCode: "PILOT-ATSU", firstName: "ATSU", lastName: "PLACEHOLDER", jobTitle: "Dispatch Rider" },
];

const M = "MORNING";
const E = "EVENING";
const F = "FULL_DAY";
const O = "OFF";

/**
 * One entry per ISO weekday, Monday first. `expectFirstName` is checked
 * against the record so a code typo fails loudly instead of rostering the
 * wrong person. Anyone not yet at Dawhenya is given a non-primary Dawhenya
 * assignment by the rota script, keeping their existing branch.
 */
export const PILOT_ROTA: ReadonlyArray<{
  employeeCode: string;
  expectFirstName: string;
  rotaName: string;
  week: readonly [Day, Day, Day, Day, Day, Day, Day];
}> = [
  // Supervisors. Both on record as Supervisor at Accra Mall.
  { employeeCode: "EMP0032", expectFirstName: "ISSABELLE", rotaName: "Issabelle (Supervisor)", week: [M, F, O, M, M, M, M] },
  { employeeCode: "EMP0006", expectFirstName: "DOREEN", rotaName: "Doreen (Supervisor)", week: [E, O, F, E, E, E, E] },

  // Chefs. Gilbert is the only Gilbert on record as a chef (at Afienya).
  { employeeCode: "EMP0090", expectFirstName: "GILBERT", rotaName: "Gilbert (Chef)", week: [M, F, O, M, M, M, M] },
  { employeeCode: "EMP0125", expectFirstName: "COMFORT", rotaName: "Comfort (Chef)", week: [E, O, F, E, E, E, E] },

  // Cooks.
  { employeeCode: "EMP0108", expectFirstName: "ABRAHAM", rotaName: "Abraham (Cook)", week: [M, O, M, M, M, M, M] },
  { employeeCode: "EMP0111", expectFirstName: "PATIENCE", rotaName: "Patience (Cook)", week: [M, M, O, M, M, M, M] },
  { employeeCode: "EMP0117", expectFirstName: "JENNIFER", rotaName: "Jennifer (Cook)", week: [M, M, M, O, M, M, M] },
  { employeeCode: "EMP0112", expectFirstName: "THEODORA", rotaName: "Theodora (Cook)", week: [O, M, M, M, M, M, M] },
  { employeeCode: "EMP0124", expectFirstName: "SAMPSON", rotaName: "Sampson (Cook)", week: [E, E, O, E, E, E, E] },
  { employeeCode: "EMP0106", expectFirstName: "JOANA", rotaName: "Joana (Cook)", week: [E, O, E, E, E, E, E] },
  // Recorded as "Ofori Sylvia Boadu".
  { employeeCode: "EMP0119", expectFirstName: "SYLVIA", rotaName: "Sylvia (Cook)", week: [E, E, E, O, E, E, E] },
  { employeeCode: "EMP0107", expectFirstName: "COMFORT", rotaName: "Comfort (Cook)", week: [O, E, E, E, E, E, E] },
  // First and last name are swapped on this record: "Peprah-Sarfo Clara".
  { employeeCode: "EMP0120", expectFirstName: "PEPRAH-SARFO", rotaName: "Clara (Cook)", week: [O, E, E, E, E, E, E] },

  // Frontliners.
  { employeeCode: "EMP0129", expectFirstName: "HELLEN", rotaName: "Hellen (Frontliner)", week: [M, O, M, M, M, M, M] },
  { employeeCode: "PILOT-MARTIN", expectFirstName: "MARTIN", rotaName: "Martin (Frontliner)", week: [M, M, O, M, M, M, M] },
  // "Everlove" on the rota.
  { employeeCode: "EMP0109", expectFirstName: "REBECCA", rotaName: "Everlove (Frontliner)", week: [M, M, M, O, E, E, E] },
  { employeeCode: "EMP0116", expectFirstName: "MARY", rotaName: "Mary (Frontliner)", week: [O, M, M, M, M, M, M] },
  { employeeCode: "EMP0115", expectFirstName: "ROSINA", rotaName: "Rosina (Frontliner)", week: [E, E, O, E, E, E, E] },
  // The only Josephine on record (Frontliner at Afienya). Thursday on is not
  // decided yet.
  { employeeCode: "EMP0084", expectFirstName: "JOSEPHINE", rotaName: "Josephine (Frontliner)", week: [E, E, E, null, null, null, null] },
  // Frontliner on the rota, "Cook" on the record.
  { employeeCode: "EMP0128", expectFirstName: "RASHID", rotaName: "Rashid (Frontliner)", week: [E, O, E, E, E, E, E] },
  // The only Randy on record (Frontliner at Achimota Mall).
  { employeeCode: "EMP0058", expectFirstName: "RANDY", rotaName: "Randy (Frontliner)", week: [O, E, E, E, E, E, E] },

  // Riders.
  { employeeCode: "PILOT-ATSU", expectFirstName: "ATSU", rotaName: "Atsu (Rider)", week: [F, O, F, F, F, F, F] },
  { employeeCode: "EMP0127", expectFirstName: "ELORM", rotaName: "Elorm (Rider)", week: [F, F, O, F, F, F, F] },

  // Cleaner.
  { employeeCode: "EMP0118", expectFirstName: "HELINA", rotaName: "Helina (Cleaner)", week: [M, M, O, M, M, M, M] },
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
