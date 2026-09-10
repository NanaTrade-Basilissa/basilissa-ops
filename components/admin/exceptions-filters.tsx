"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export function ExceptionsFilters({
  branches,
  branchId,
  flag,
  search,
}: {
  branches: { id: string; name: string }[];
  branchId?: string;
  flag?: string;
  search?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params ? params.toString() : "");
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    router.replace(`?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-card p-4">
      {branches.length > 1 ? (
        <div className="space-y-1.5 min-w-44">
          <Label htmlFor="branchFilter">Branch</Label>
          <NativeSelect
            id="branchFilter"
            value={branchId ?? ""}
            onChange={(e) => update({ branchId: e.target.value || null })}
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : branches.length === 1 ? (
        <div className="space-y-1.5 min-w-44">
          <Label>Branch</Label>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground">
            {branches[0].name}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5 min-w-48">
        <Label htmlFor="flagFilter">Exception Type</Label>
        <NativeSelect
          id="flagFilter"
          value={flag ?? ""}
          onChange={(e) => update({ flag: e.target.value || null })}
        >
          <option value="">All Exception Reasons</option>
          <option value="AUTO_CLOSED">Auto-Closed Shifts</option>
          <option value="MISSING_CLOCK_OUT">Missing Clock-Out</option>
          <option value="OUTSIDE_GEOFENCE">Outside Geofence</option>
          <option value="LATE_ARRIVAL">Late Arrival</option>
          <option value="MANUAL_ENTRY">Manual Punch</option>
        </NativeSelect>
      </div>

      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor="searchExceptions">Search Employee</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            id="searchExceptions"
            placeholder="Search by staff name or employee code..."
            value={search ?? ""}
            onChange={(e) => update({ search: e.target.value || null })}
            className="pl-9"
          />
        </div>
      </div>
    </div>
  );
}
