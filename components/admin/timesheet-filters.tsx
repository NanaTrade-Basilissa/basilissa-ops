"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TimesheetFilters({
  branches,
  startDate,
  endDate,
  branchId,
  search,
}: {
  branches: { id: string; name: string }[];
  startDate: string;
  endDate: string;
  branchId?: string;
  search?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    router.replace(`?${next.toString()}`);
  }

  function applyPreset(preset: "this-week" | "last-week" | "this-month" | "last-month") {
    const today = new Date();
    let start: Date;
    let end: Date;

    if (preset === "this-week") {
      const day = today.getDay(); // 0 is Sun, 1 is Mon
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
      // last-month
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    }

    update({
      startDate: toDateString(start),
      endDate: toDateString(end),
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Quick Presets:</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("this-week")}
        >
          This Week
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("last-week")}
        >
          Last Week
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("this-month")}
        >
          This Month
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("last-month")}
        >
          Last Month
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">From</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className="max-w-44"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="endDate">To</Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => update({ endDate: e.target.value })}
            className="max-w-44"
          />
        </div>

        {branches.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="timesheetBranch">Branch</Label>
            <NativeSelect
              id="timesheetBranch"
              value={branchId ?? ""}
              onChange={(e) => update({ branchId: e.target.value || null })}
              className="min-w-48"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : branches.length === 1 ? (
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground">
              {branches[0].name}
            </div>
          </div>
        ) : null}

        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="search">Search Employee</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by name or code..."
              value={search ?? ""}
              onChange={(e) => update({ search: e.target.value || null })}
              className="pl-9"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
