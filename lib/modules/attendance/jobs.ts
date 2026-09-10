/**
 * Attendance module — background work, and the only attendance entry point the
 * worker may import.
 *
 * `server.ts` is safe for the worker today, but only because `actions.ts`
 * happens not to be re-exported from it. That is luck, not a boundary: adding
 * one line to `server.ts` would pull in the Data Access Layer, `next/navigation`
 * and React's client context, and kill the worker at startup. This file makes
 * the rule uniform — the worker imports `jobs`, never `server`.
 */
export { autoCloseStaleDays } from "./auto-close";
export { runDailySettlementSweep } from "./settle";
export { dispatchUpcomingShiftReminders } from "./reminders";
