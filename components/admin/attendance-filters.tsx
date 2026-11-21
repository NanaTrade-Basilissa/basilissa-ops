"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";

const LIVE_POLL_INTERVAL_MS = 15_000;

export function AttendanceFilters({
  branches,
  date,
  todayKey,
  branchId,
  exceptionsOnly,
  initialLive = false,
}: {
  branches: { id: string; name: string }[];
  date: string;
  todayKey: string;
  branchId?: string;
  exceptionsOnly: boolean;
  initialLive?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [liveMode, setLiveMode] = useState(initialLive);

  // Sync if URL `live` param changes externally
  const urlLive = params.get("live") === "1";
  useEffect(() => {
    setLiveMode(urlLive || initialLive);
  }, [urlLive, initialLive]);

  // Auto-refresh server data while Live Mode is enabled and tab is visible
  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, LIVE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [liveMode, router]);

  // Filters live in the URL so a manager can bookmark "exceptions at my branch"
  // and share a specific day with whoever needs to look at it.
  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    if (key === "date" && value !== todayKey) {
      next.delete("live");
      setLiveMode(false);
    }
    router.replace(`?${next.toString()}`);
  }

  function handleToggleLive(enabled: boolean) {
    setLiveMode(enabled);
    const next = new URLSearchParams(params.toString());
    next.delete("view");
    if (enabled) {
      next.set("live", "1");
      next.set("date", todayKey);
    } else {
      next.delete("live");
    }
    router.replace(`?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="date" className="text-xs font-medium text-muted-foreground">
            Date
          </Label>
          <Input
            id="date"
            type="date"
            value={date}
            disabled={liveMode}
            onChange={(event) => update("date", event.target.value)}
            className="h-9 max-w-44 text-xs"
          />
        </div>

        {branches.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="branchId" className="text-xs font-medium text-muted-foreground">
              Branch
            </Label>
            <NativeSelect
              id="branchId"
              value={branchId ?? ""}
              onChange={(event) => update("branchId", event.target.value || null)}
              className="h-9 min-w-48 text-xs"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : branches.length === 1 ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Branch</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-xs font-medium text-foreground">
              {branches[0].name}
            </div>
          </div>
        ) : null}

        <div className="flex h-9 items-center gap-2">
          <Switch
            id="exceptions"
            checked={exceptionsOnly}
            onChange={(event) => update("exceptions", event.target.checked ? "1" : null)}
          />
          <Label htmlFor="exceptions" className="cursor-pointer text-xs font-medium text-foreground">
            Only needing attention
          </Label>
        </div>
      </div>

      {/* Live Mode Toggle (switches to animated live grid + 15s auto-refresh) */}
      <div className="flex h-9 items-center gap-2 border-t border-border/60 pt-2 sm:border-t-0 sm:pt-0">
        <Switch
          id="live-mode"
          checked={liveMode}
          onChange={(event) => handleToggleLive(event.target.checked)}
        />
        <Label htmlFor="live-mode" className="cursor-pointer text-xs font-medium text-foreground">
          Live mode
        </Label>
      </div>
    </div>
  );
}
