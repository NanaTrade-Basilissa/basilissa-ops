/**
 * App-wide constants shared by every module. Anything domain-specific belongs
 * in that module's own `constants.ts` instead (e.g. the feedback rating scale
 * lives in `lib/modules/feedback/constants.ts`).
 *
 * Client-safe: never import `server-only` from here.
 */

export const APP_NAME = "Basilissa";
export const APP_TAGLINE = "Ghana";

/** All customer-facing and admin timestamps are displayed in this timezone. */
export const DISPLAY_TIMEZONE = "Africa/Accra";
