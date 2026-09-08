"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";

export function AttendanceFilters({
  branches,
  date,
  branchId,
  exceptionsOnly,
}: {
  branches: { id: string; name: string }[];
  date: string;
  branchId?: string;
  exceptionsOnly: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  // Filters live in the URL so a manager can bookmark "exceptions at my branch"
  // and share a specific day with whoever needs to look at it.
  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.replace(`?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(event) => update("date", event.target.value)}
          className="max-w-44"
        />
      </div>

      {branches.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="branchId">Branch</Label>
          <NativeSelect
            id="branchId"
            value={branchId ?? ""}
            onChange={(event) => update("branchId", event.target.value || null)}
            className="min-w-48"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="flex items-center gap-2 pb-2">
        <Switch
          id="exceptions"
          checked={exceptionsOnly}
          onChange={(event) => update("exceptions", event.target.checked ? "1" : null)}
        />
        <Label htmlFor="exceptions">Only days needing attention</Label>
      </div>
    </div>
  );
}
