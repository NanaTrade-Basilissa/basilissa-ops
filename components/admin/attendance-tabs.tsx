"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, Clock, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type AttendanceView = "daily" | "live" | "timesheets" | "exceptions";

export function AttendanceTabs({
  activeView = "daily",
  branchId,
  date,
  exceptionsCount = 0,
}: {
  activeView: AttendanceView;
  branchId?: string;
  date?: string;
  exceptionsCount?: number;
}) {
  const searchParams = useSearchParams();

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
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
      <div className="inline-flex rounded-lg bg-muted p-1 text-muted-foreground">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <Link
              key={tab.id}
              href={buildHref(tab.id)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <Badge
                  variant="outline"
                  className="ml-0.5 h-5 border-amber-300 bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                >
                  {tab.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
