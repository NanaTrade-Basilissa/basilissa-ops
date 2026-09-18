"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarCheck, CalendarDays, Clock, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AttendanceView = "daily" | "live" | "timesheets" | "exceptions" | "leave";

export function AttendanceTabs({
  activeView = "daily",
  branchId,
  date,
  exceptionsCount = 0,
  leaveRequestsCount = 0,
  className,
}: {
  activeView: AttendanceView;
  branchId?: string;
  date?: string;
  exceptionsCount?: number;
  leaveRequestsCount?: number;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const tab = activeTabRef.current;
    if (!container || !tab) return;

    const tabLeft = tab.offsetLeft;
    const tabRight = tabLeft + tab.offsetWidth;
    const containerScrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;

    if (tabLeft < containerScrollLeft) {
      container.scrollTo({ left: Math.max(0, tabLeft - 12), behavior: "smooth" });
    } else if (tabRight > containerScrollLeft + containerWidth) {
      container.scrollTo({
        left: tabRight - containerWidth + 12,
        behavior: "smooth",
      });
    }
  }, [activeView]);

  function buildHref(view: AttendanceView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    if (branchId) params.set("branchId", branchId);
    if (date && view === "daily") params.set("date", date);
    return `?${params.toString()}`;
  }

  const tabs: {
    id: AttendanceView;
    label: string;
    icon: typeof CalendarDays;
    badge?: number;
  }[] = [
    { id: "daily", label: "Daily Roster", icon: CalendarDays },
    { id: "live", label: "Live Floor Board", icon: Clock },
    { id: "timesheets", label: "Timesheets & Payroll", icon: FileSpreadsheet },
    {
      id: "exceptions",
      label: "Review Queue",
      icon: AlertTriangle,
      badge: exceptionsCount,
    },
    {
      id: "leave",
      label: "Leave Requests",
      icon: CalendarCheck,
      badge: leaveRequestsCount,
    },
  ];

  return (
    <div className={cn("w-full max-w-full min-w-0", className)}>
      <div
        ref={scrollContainerRef}
        className="no-scrollbar flex w-full max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]"
      >
        <div className="inline-flex min-w-max items-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.id;
            return (
              <Link
                key={tab.id}
                ref={isActive ? activeTabRef : null}
                href={buildHref(tab.id)}
                className={`relative inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 sm:gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                  isActive
                    ? "text-foreground font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5 sm:size-4 shrink-0" />
                <span className="shrink-0">{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-0.5 h-4.5 sm:h-5 shrink-0 border-amber-300 bg-amber-100 px-1.5 text-[10px] sm:text-[11px] font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                  >
                    {tab.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
