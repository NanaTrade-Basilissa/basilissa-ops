"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Clock, FileSpreadsheet } from "lucide-react";

export type AttendanceView = "daily" | "live" | "timesheets";

export function AttendanceTabs({
  activeView = "daily",
  branchId,
  date,
}: {
  activeView: AttendanceView;
  branchId?: string;
  date?: string;
}) {
  const searchParams = useSearchParams();

  function buildHref(view: AttendanceView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    if (branchId) params.set("branchId", branchId);
    if (date && view === "daily") params.set("date", date);
    return `?${params.toString()}`;
  }

  const tabs: { id: AttendanceView; label: string; icon: typeof CalendarDays }[] = [
    { id: "daily", label: "Daily Roster", icon: CalendarDays },
    { id: "live", label: "Live Floor Board", icon: Clock },
    { id: "timesheets", label: "Timesheets & Payroll", icon: FileSpreadsheet },
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}
