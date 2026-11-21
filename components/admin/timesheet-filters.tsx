"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { FilterBar } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type PeriodPreset = "this-week" | "last-week" | "this-month" | "last-month" | "custom";

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetRange(preset: Exclude<PeriodPreset, "custom">): { start: string; end: string } {
  const today = new Date();
  let start: Date;
  let end: Date;

  if (preset === "this-week") {
    const day = today.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    start = new Date(today);
    start.setDate(today.getDate() + diffToMon);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (preset === "last-week") {
    const day = today.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    start = new Date(today);
    start.setDate(today.getDate() + diffToMon - 7);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (preset === "this-month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  }

  return { start: toDateString(start), end: toDateString(end) };
}

function detectPreset(startDate: string, endDate: string): PeriodPreset {
  const todayStr = toDateString(new Date());
  const thisWeek = getPresetRange("this-week");
  // Default Payroll range is Monday of this week through today (or Sunday of this week)
  if (startDate === thisWeek.start && (endDate === thisWeek.end || endDate === todayStr)) {
    return "this-week";
  }

  for (const preset of ["last-week", "this-month", "last-month"] as const) {
    const range = getPresetRange(preset);
    if (startDate === range.start && endDate === range.end) {
      return preset;
    }
  }

  return "custom";
}

export function TimesheetFilters({
  branches,
  startDate,
  endDate,
  branchId,
  search: initialSearch,
  actions,
}: {
  branches: { id: string; name: string }[];
  startDate: string;
  endDate: string;
  branchId?: string;
  search?: string;
  actions?: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initialSearch ?? "");

  const detectedPreset = useMemo(() => detectPreset(startDate, endDate), [startDate, endDate]);
  const [selectedPreset, setSelectedPreset] = useState<PeriodPreset>(detectedPreset);

  // Keep selectedPreset synced with URL changes (unless user explicitly switched to "custom")
  useEffect(() => {
    setSelectedPreset((prev) => (prev === "custom" ? "custom" : detectedPreset));
  }, [detectedPreset]);

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    router.replace(`?${next.toString()}`);
  }

  useEffect(() => {
    const current = params.get("search") ?? "";
    if (search === current) return;
    const timeout = setTimeout(() => update({ search: search || null }), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handlePresetChange(nextPreset: PeriodPreset) {
    setSelectedPreset(nextPreset);
    if (nextPreset === "custom") {
      return;
    }
    const range = getPresetRange(nextPreset);
    update({
      startDate: range.start,
      endDate: range.end,
    });
  }

  const isCustom = selectedPreset === "custom";
  const hasFilters = Boolean(branchId || search || selectedPreset !== "this-week");

  return (
    <FilterBar
      hasActiveFilters={Boolean(branchId || selectedPreset !== "this-week")}
      search={
        <div className="relative w-full shrink-0 sm:w-64 md:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="timesheet-search"
            placeholder="Search employee name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>
      }
      filters={
        <>
          {branches.length > 1 && (
            <NativeSelect
              id="timesheetBranch"
              aria-label="Filter by branch"
              value={branchId ?? ""}
              onChange={(e) => update({ branchId: e.target.value || null })}
              className="h-9 text-xs"
              containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          )}

          <NativeSelect
            id="timesheetPreset"
            aria-label="Period"
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[135px] sm:shrink-0"
          >
            <option value="this-week">This week</option>
            <option value="last-week">Last week</option>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="custom">Custom range</option>
          </NativeSelect>

          {isCustom && (
            <>
              <Input
                id="startDate"
                type="date"
                aria-label="From date"
                value={startDate}
                onChange={(e) => update({ startDate: e.target.value })}
                className="h-9 w-full text-xs sm:w-36"
              />

              <Input
                id="endDate"
                type="date"
                aria-label="To date"
                value={endDate}
                onChange={(e) => update({ endDate: e.target.value })}
                className="h-9 w-full text-xs sm:w-36"
              />
            </>
          )}

          {hasFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => {
                setSearch("");
                setSelectedPreset("this-week");
                update({ branchId: null, search: null, startDate: null, endDate: null });
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </>
      }
      actions={actions}
    />
  );
}
