"use client";

import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Globe, Plus, RotateCcw, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createReleasesAction } from "@/lib/modules/releases/actions";
import {
  APP_PLATFORMS,
  PLATFORM_LABELS,
  UPDATE_MODE_LABELS,
  type AppPlatformKey,
  type AppReleaseItem,
} from "@/lib/modules/releases/constants";

type Props = {
  releases: AppReleaseItem[];
  canManage: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, AppReleaseItem>();

const columns = columnHelper.columns([
  columnHelper.accessor("releasedAt", {
    header: "Date",
    cell: (info) => (
      <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("platform", {
    header: "Platform",
    cell: (info) => {
      const p = info.getValue();
      const tone = p === "ANDROID" ? "good" : p === "IOS" ? "info" : "neutral";
      return <StatusBadge tone={tone}>{PLATFORM_LABELS[p]}</StatusBadge>;
    },
  }),
  columnHelper.accessor("version", {
    header: "Version",
    cell: (info) => (
      <span className="font-mono text-sm font-medium text-foreground">v{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("updateMode", {
    header: "Update Type",
    cell: (info) => {
      const mode = info.getValue();
      return (
        <StatusBadge tone={mode === "REQUIRED" ? "critical" : "neutral"}>
          {UPDATE_MODE_LABELS[mode]}
        </StatusBadge>
      );
    },
  }),
  columnHelper.accessor("releaseNotes", {
    header: "Release Notes",
    cell: (info) => (
      <span className="block max-w-md whitespace-pre-wrap text-xs text-muted-foreground">
        {info.getValue() || "—"}
      </span>
    ),
  }),
  columnHelper.accessor("createdByName", {
    header: "Recorded By",
    cell: (info) => <span className="text-xs text-muted-foreground">{info.getValue()}</span>,
  }),
]);

export function ReleasesPanel({ releases, canManage }: Props) {
  const [isPending, startTransition] = useTransition();

  // Table filters
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"ALL" | AppPlatformKey>("ALL");
  const [modeFilter, setModeFilter] = useState<"ALL" | "FLEXIBLE" | "REQUIRED">("ALL");

  // Create Release Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<AppPlatformKey[]>(["ANDROID", "IOS"]);
  const [version, setVersion] = useState("");
  const [updateMode, setUpdateMode] = useState<"FLEXIBLE" | "REQUIRED">("FLEXIBLE");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [sendPush, setSendPush] = useState(false);

  const latest = (p: AppPlatformKey) => {
    const match = releases.find((r) => r.platform === p);
    return match ? `v${match.version}` : "None yet";
  };

  const filteredReleases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return releases.filter((r) => {
      if (platformFilter !== "ALL" && r.platform !== platformFilter) return false;
      if (modeFilter !== "ALL" && r.updateMode !== modeFilter) return false;
      if (q) {
        const hay = `${r.version} ${PLATFORM_LABELS[r.platform]} ${r.releaseNotes ?? ""} ${r.createdByName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [releases, search, platformFilter, modeFilter]);

  const hasFilters = Boolean(search.trim() || platformFilter !== "ALL" || modeFilter !== "ALL");
  const hasMobilePlatform = selectedPlatforms.some((p) => p === "ANDROID" || p === "IOS");

  function togglePlatform(p: AppPlatformKey, checked: boolean) {
    setSelectedPlatforms((prev) =>
      checked ? Array.from(new Set([...prev, p])) : prev.filter((item) => item !== p),
    );
  }

  function resetForm() {
    setSelectedPlatforms(["ANDROID", "IOS"]);
    setVersion("");
    setUpdateMode("FLEXIBLE");
    setReleaseNotes("");
    setSendPush(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (selectedPlatforms.length === 0) {
      toast.error("Select at least one platform.");
      return;
    }

    startTransition(async () => {
      const result = await createReleasesAction({
        platforms: selectedPlatforms,
        version,
        updateMode,
        releaseNotes,
        sendPush: hasMobilePlatform && sendPush,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const count = result.createdCount ?? selectedPlatforms.length;
      const platformSummary = selectedPlatforms.map((p) => PLATFORM_LABELS[p]).join(", ");
      if (hasMobilePlatform && sendPush) {
        if ((result.simulated ?? 0) > 0 && result.pushed === 0) {
          toast.warning(
            `Recorded v${version.trim()} for ${platformSummary}, but push was simulated (${result.simulated} devices) — check FIREBASE_SERVICE_ACCOUNT_KEY on the server.`,
          );
        } else if ((result.totalTokens ?? 0) === 0) {
          toast.warning(
            `Recorded v${version.trim()} for ${platformSummary}, but no active mobile push tokens were registered.`,
          );
        } else if ((result.failed ?? 0) > 0) {
          toast.warning(
            `Recorded v${version.trim()} for ${platformSummary}. Push delivered to ${result.pushed}/${result.totalTokens} devices (${result.failed} failed${result.pushError ? `: ${result.pushError}` : ""}).`,
          );
        } else {
          toast.success(
            `Recorded v${version.trim()} for ${platformSummary}. Push delivered to ${result.pushed} device${result.pushed === 1 ? "" : "s"}.`,
          );
        }
      } else {
        toast.success(
          `Recorded ${count} release${count === 1 ? "" : "s"} (v${version.trim()} — ${platformSummary}).`,
        );
      }
      resetForm();
      setDialogOpen(false);
    });
  }

  return (
    <PageShell>
      <PageHeader
        title="App Releases"
        description="Track Android, iOS, and Web releases and control in-app update prompts for staff."
        actions={
          canManage ? (
            <Button
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="size-4" />
              <span>Create release</span>
            </Button>
          ) : undefined
        }
      />

      {/* Latest Version KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Latest Android" value={latest("ANDROID")} icon={Smartphone} tone="good" />
        <StatCard label="Latest iOS" value={latest("IOS")} icon={Smartphone} tone="info" />
        <StatCard label="Latest Web" value={latest("WEB")} icon={Globe} tone="default" />
      </div>

      {/* Unified Filter Bar + Releases Table */}
      <div className="space-y-3">
        <FilterBar
          hasActiveFilters={platformFilter !== "ALL" || modeFilter !== "ALL"}
          search={
            <div className="relative w-full shrink-0 sm:w-64 md:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search version, notes, author..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>
          }
          filters={
            <>
              <NativeSelect
                aria-label="Filter by platform"
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value as "ALL" | AppPlatformKey)}
                className="h-9 text-xs"
                containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
              >
                <option value="ALL">All platforms</option>
                {APP_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>

              <NativeSelect
                aria-label="Filter by update type"
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value as "ALL" | "FLEXIBLE" | "REQUIRED")}
                className="h-9 text-xs"
                containerClassName="w-full sm:w-fit sm:min-w-[130px] sm:shrink-0"
              >
                <option value="ALL">All update types</option>
                <option value="FLEXIBLE">Flexible</option>
                <option value="REQUIRED">Required</option>
              </NativeSelect>

              {hasFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setPlatformFilter("ALL");
                    setModeFilter("ALL");
                  }}
                  className="h-9 gap-1.5 text-xs"
                  title="Reset filters"
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              )}
            </>
          }
        />

        <DataTable
          columns={columns}
          data={filteredReleases}
          ariaLabel="App releases"
          pageSize={20}
          emptyMessage={
            hasFilters
              ? "No releases match your current filters."
              : "No releases recorded yet."
          }
        />
      </div>

      {/* Create Release Modal */}
      {canManage && (
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Release</DialogTitle>
              <DialogDescription className="text-xs">
                Record a new version across one or more platforms after the build is live.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-4">
              {/* Platform Checkboxes */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Platforms</Label>
                <div className="grid grid-cols-3 gap-2">
                  {APP_PLATFORMS.map((p) => {
                    const checked = selectedPlatforms.includes(p);
                    return (
                      <label
                        key={p}
                        htmlFor={`platform-${p}`}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/25 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`platform-${p}`}
                          checked={checked}
                          onCheckedChange={(val) => togglePlatform(p, val === true)}
                        />
                        <span>{PLATFORM_LABELS[p]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="release-version" className="text-xs text-muted-foreground">
                    Version
                  </Label>
                  <Input
                    id="release-version"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.3.0"
                    className="h-9 text-xs tabular-nums"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="release-mode" className="text-xs text-muted-foreground">
                    Update Type
                  </Label>
                  <NativeSelect
                    id="release-mode"
                    value={updateMode}
                    onChange={(e) => setUpdateMode(e.target.value as "FLEXIBLE" | "REQUIRED")}
                    className="h-9 text-xs"
                  >
                    <option value="FLEXIBLE">Flexible (dismissible)</option>
                    <option value="REQUIRED">Required (blocks old builds)</option>
                  </NativeSelect>
                </div>
              </div>

              {updateMode === "REQUIRED" && hasMobilePlatform && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                  Staff on older mobile builds will be prompted to update before continuing.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="release-notes" className="text-xs text-muted-foreground">
                  Release Notes (optional)
                </Label>
                <Textarea
                  id="release-notes"
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  placeholder="What's new in this version..."
                  rows={3}
                  maxLength={2000}
                  className="text-xs"
                />
              </div>

              {hasMobilePlatform && (
                <label htmlFor="release-send-push" className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    id="release-send-push"
                    checked={sendPush}
                    onCheckedChange={(checked) => setSendPush(checked === true)}
                  />
                  <span>
                    Send push notification to{" "}
                    {selectedPlatforms
                      .filter((p) => p !== "WEB")
                      .map((p) => PLATFORM_LABELS[p])
                      .join(" & ")}{" "}
                    staff
                  </span>
                </label>
              )}

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !version.trim() || selectedPlatforms.length === 0}
                >
                  {isPending ? "Saving..." : "Record Release"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
