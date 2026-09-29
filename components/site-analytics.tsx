"use client";

import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Paths that must load no tracking script at all. /delete-account is the page
 * linked from the Google Play Data safety form: a compliance page, so it
 * carries no analytics.
 */
const UNTRACKED_PATHS = ["/delete-account"];

export function SiteAnalytics() {
  const pathname = usePathname();
  if (UNTRACKED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return null;
  }
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
