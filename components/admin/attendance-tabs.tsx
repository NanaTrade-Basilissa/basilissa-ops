"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";

export type AttendanceView = "daily" | "exceptions";

/**
 * Two-tab navigation for Attendance:
 * 1. Daily Attendance (single roster view with an inline Live Mode auto-refresh switch)
 * 2. Review Queue (dedicated multi-day exception inbox)
 */
export function AttendanceTabs({
  activeView = "daily",
  branchId,
  date,
  exceptionsCount = 0,
  className,
}: {
  activeView: AttendanceView;
  branchId?: string;
  date?: string;
  exceptionsCount?: number;
  className?: string;
}) {
  const searchParams = useSearchParams();

  function buildHref(view: AttendanceView) {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "daily") {
      params.delete("view");
      if (date) params.set("date", date);
    } else {
      params.set("view", "exceptions");
      params.delete("live");
    }
    if (branchId) params.set("branchId", branchId);
    const qs = params.toString();
    return qs ? `?${qs}` : "/admin/attendance";
  }

  const isDailyActive = activeView === "daily";
  const isExceptionsActive = activeView === "exceptions";

  return (
    <nav
      aria-label="Attendance views"
      className={cn("no-scrollbar -mb-px flex items-center gap-1 overflow-x-auto", className)}
    >
      <Link
        href={buildHref("daily")}
        aria-current={isDailyActive ? "page" : undefined}
        className={cn(
          "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
          isDailyActive
            ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <CalendarDays className="size-4 shrink-0" />
        <span>Daily Attendance</span>
      </Link>

      <Link
        href={buildHref("exceptions")}
        aria-current={isExceptionsActive ? "page" : undefined}
        className={cn(
          "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
          isExceptionsActive
            ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <AlertTriangle className="size-4 shrink-0" />
        <span>Review Queue</span>
        {exceptionsCount > 0 && (
          <StatusBadge tone="warning" className="h-5 px-1.5 text-[11px] tabular-nums">
            {exceptionsCount}
          </StatusBadge>
        )}
      </Link>
    </nav>
  );
}
