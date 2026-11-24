"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { FilterBar } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export function ExceptionsFilters({
  branches,
  branchId,
  flag,
  search: initialSearch,
  datePreset,
  startDate,
  endDate,
}: {
  branches: { id: string; name: string }[];
  branchId?: string;
  flag?: string;
  search?: string;
  datePreset?: string;
  startDate?: string;
  endDate?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initialSearch ?? "");
  const activePreset = datePreset || (startDate ? "custom" : "");

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params ? params.toString() : "");
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    router.replace(`?${next.toString()}`);
  }

  useEffect(() => {
    const current = params?.get("search") ?? "";
    if (search === current) return;
    const timeout = setTimeout(() => update({ search: search || null }), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(branchId || flag || search || activePreset || startDate || endDate);

  return (
    <FilterBar
      hasActiveFilters={Boolean(branchId || flag || activePreset || startDate || endDate)}
      search={
        <div className="relative w-full sm:w-64 md:w-72 shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="searchExceptions"
            placeholder="Search staff name or code..."
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
              id="branchFilter"
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
            id="flagFilter"
            value={flag ?? ""}
            onChange={(e) => update({ flag: e.target.value || null })}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[160px] sm:shrink-0"
          >
            <option value="">All exception types</option>
            <option value="NO_PUNCHES">No Punches (Empty)</option>
            <option value="AUTO_CLOSED">Auto-Closed Shifts</option>
            <option value="MISSING_CLOCK_OUT">Missing Clock-Out</option>
            <option value="OUTSIDE_GEOFENCE">Outside Geofence</option>
            <option value="LATE_ARRIVAL">Late Arrival</option>
            <option value="MANUAL_ENTRY">Manual Punch</option>
          </NativeSelect>

          <NativeSelect
            id="exceptionsDatePreset"
            aria-label="Filter by date"
            value={activePreset}
            onChange={(e) => {
              const nextPreset = e.target.value;
              if (!nextPreset) {
                update({ datePreset: null, startDate: null, endDate: null });
              } else if (nextPreset === "custom") {
                update({ datePreset: "custom" });
              } else {
                update({ datePreset: nextPreset, startDate: null, endDate: null });
              }
            }}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
          >
            <option value="">All dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 days</option>
            <option value="custom">Custom date</option>
          </NativeSelect>

          {activePreset === "custom" && (
            <div className="flex items-center gap-1.5 sm:shrink-0">
              <Input
                type="date"
                aria-label="Start date"
                value={startDate ?? ""}
                onChange={(e) => update({ datePreset: "custom", startDate: e.target.value || null })}
                className="h-9 flex-1 min-w-0 px-2.5 text-xs sm:w-[140px] sm:flex-none"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="End date"
                value={endDate ?? ""}
                onChange={(e) => update({ datePreset: "custom", endDate: e.target.value || null })}
                className="h-9 flex-1 min-w-0 px-2.5 text-xs sm:w-[140px] sm:flex-none"
              />
            </div>
          )}

          {hasFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => {
                setSearch("");
                update({ branchId: null, flag: null, search: null, datePreset: null, startDate: null, endDate: null });
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </>
      }
    />
  );
}
