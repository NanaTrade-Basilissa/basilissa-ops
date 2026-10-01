import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";

/**
 * When something was sent, in the company's time zone. A plain module rather
 * than part of a table component: the detail page (a Server Component) and the
 * tables (Client Components) both need it, and a function exported from a
 * `"use client"` file cannot be called from the server.
 */
export function formatSent(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
