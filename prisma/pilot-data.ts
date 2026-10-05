/**
 * Fixtures for the Dawhenya attendance pilot. Script-only, like `seed-data.ts`.
 *
 * Source: the branch's five printed rotas (supervisors, chefs, cooks,
 * frontliners, riders) for Monday 5 to Sunday 11 October 2026. No cleaner's
 * sheet this week.
 *
 * Written as one-day overrides, not week-long shift assignments: since
 * 5 October everyone also has the open-ended 8-5 default, starting the same
 * Monday, and two assignments starting on one day leave resolution to pick
 * either. An override always wins.
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
  // Renamed and moved to 08:00 with a 60-minute break in production; this is
  // the open-ended default staff fall back to.
  NINE_TO_FIVE: { name: "Day (08:00-17:00)", startMinute: 8 * 60, endMinute: 17 * 60, unpaidBreakMinutes: 60 },
};

export const PILOT_BRANCH_SLUG = "community-25-dawhenya";

/** Local dates, inclusive. Monday to Sunday. */
export const PILOT_WEEK = { from: "2026-10-05", to: "2026-10-11" } as const;

/**
 * `null` is a day the rota leaves open. Nothing is written for it, so the day
 * falls through to whatever else the employee has: the 8-5 default on
 * weekdays.
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
  /** Reason recorded on this person's days off, when it is not an ordinary one. */
  offReason?: string;
}> = [
  // Supervisors.
  { employeeCode: "EMP0006", expectFirstName: "DOREEN", rotaName: "Doreen (Supervisor)", week: [F, O, E, E, E, E, E] },
  { employeeCode: "EMP0032", expectFirstName: "ISSABELLE", rotaName: "Issabelle (Supervisor)", week: [O, F, M, M, M, M, M] },

  // Chefs.
  { employeeCode: "EMP0125", expectFirstName: "COMFORT", rotaName: "Comfort (Chef)", week: [F, O, M, M, M, M, M] },
  { employeeCode: "EMP0090", expectFirstName: "GILBERT", rotaName: "Gilbert (Chef)", week: [O, F, E, E, E, E, E] },

  // Cooks.
  { employeeCode: "EMP0124", expectFirstName: "SAMPSON", rotaName: "Sampson (Cook)", week: [M, O, M, M, M, M, M] },
  // Recorded as "Ofori Sylvia Boadu".
  { employeeCode: "EMP0119", expectFirstName: "SYLVIA", rotaName: "Sylvia (Cook)", week: [M, M, O, M, M, M, M] },
  { employeeCode: "EMP0107", expectFirstName: "COMFORT", rotaName: "Comfort (Cook)", week: [M, M, M, O, M, M, M] },
  { employeeCode: "EMP0106", expectFirstName: "JOANA", rotaName: "Joana (Cook)", week: [O, M, M, M, M, M, M] },
  { employeeCode: "EMP0108", expectFirstName: "ABRAHAM", rotaName: "Abraham (Cook)", week: [E, E, O, E, E, E, E] },
  { employeeCode: "EMP0111", expectFirstName: "PATIENCE", rotaName: "Patience (Cook)", week: [E, O, E, E, E, E, E] },
  { employeeCode: "EMP0112", expectFirstName: "THEODORA", rotaName: "Theodora (Cook)", week: [E, E, E, O, E, E, E] },
  { employeeCode: "EMP0117", expectFirstName: "JENNIFER", rotaName: "Jennifer (Cook)", week: [O, E, E, E, E, E, E] },
  // First and last name are swapped on this record: "Peprah-Sarfo Clara".
  { employeeCode: "EMP0120", expectFirstName: "PEPRAH-SARFO", rotaName: "Clara (Cook)", week: [O, E, E, E, E, E, E] },

  // Frontliners.
  // The only Randy on record (Frontliner at Achimota Mall).
  { employeeCode: "EMP0058", expectFirstName: "RANDY", rotaName: "Randy (Frontliner)", week: [M, M, O, M, M, M, M] },
  { employeeCode: "EMP0115", expectFirstName: "ROSINA", rotaName: "Rosina (Frontliner)", week: [M, O, M, M, M, M, M] },
  // "Everlove" on the rota.
  { employeeCode: "EMP0109", expectFirstName: "REBECCA", rotaName: "Everlove (Frontliner)", week: [O, M, M, M, M, M, M] },
  { employeeCode: "EMP0129", expectFirstName: "HELLEN", rotaName: "Hellen (Frontliner)", week: [E, E, O, E, E, E, E] },
  { employeeCode: "EMP0116", expectFirstName: "MARY", rotaName: "Mary (Frontliner)", week: [E, O, E, E, E, E, E] },
  // Friday off is excused but unpaid, per the sheet.
  {
    employeeCode: "EMP0128",
    expectFirstName: "RASHID",
    rotaName: "Rashid (Frontliner)",
    week: [E, E, E, O, O, E, E],
  },
  // New on the rota this week. Recorded as "Elizabeth Adomaa Gyimah".
  { employeeCode: "EMP0122", expectFirstName: "ELIZABETH", rotaName: "Elizabeth (Frontliner)", week: [O, E, E, E, E, E, E] },
  // "Martin starts his leave Monday." Off all week, recorded as leave.
  {
    employeeCode: "PILOT-MARTIN",
    expectFirstName: "MARTIN",
    rotaName: "Martin (Frontliner)",
    week: [O, O, O, O, O, O, O],
    offReason: "On leave from 5 October (per the Dawhenya rota)",
  },

  // Riders.
  { employeeCode: "PILOT-ATSU", expectFirstName: "ATSU", rotaName: "Atsu (Rider)", week: [F, O, F, F, F, F, F] },
  { employeeCode: "EMP0127", expectFirstName: "ELORM", rotaName: "Elorm (Rider)", week: [F, F, O, F, F, F, F] },
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
