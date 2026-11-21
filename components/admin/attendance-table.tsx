"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import {
  AlertTriangle,
  Clock,
  Download,
  RotateCcw,
  Search,
  SearchX,
} from "lucide-react";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { FilterBar } from "@/components/admin/filter-bar";
import { ResolveExceptionDialog } from "@/components/admin/resolve-exception-dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type AttendanceRow = {
  id: string;
  employeeId: string;
  branchId?: string;
  date: string;
  employeeName: string | null;
  employeeCode: string | null;
  branchName: string;
  actualInLabel: string;
  actualOutLabel: string;
  workedLabel: string;
  overtimeLabel: string;
  calculatedOvertimeMinutes?: number;
  payableOvertimeMinutes?: number;
  lateMinutes: number;
  status: string;
  flags: string[];
  canWrite?: boolean;
};

// Apple-style critically damped spring: responsive, interruptible, zero overshoot
const LAYOUT_SPRING = {
  type: "spring" as const,
  bounce: 0,
  duration: 0.35,
};

const LIVE_POLL_INTERVAL_MS = 15_000;

export function AttendanceTable({
  days,
  date,
  todayKey,
  branches = [],
  branchId,
  exceptionsOnly = false,
  isLive = false,
}: {
  days: AttendanceRow[];
  date?: string;
  todayKey?: string;
  branches?: { id: string; name: string }[];
  branchId?: string;
  exceptionsOnly?: boolean;
  isLive?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Live mode automatically switches the roster into the animated grid layout + 15s polling
  const liveActive =
    searchParams.get("live") === "1" ||
    searchParams.get("view") === "live" ||
    (isLive && searchParams.size === 0);
  const [liveMode, setLiveMode] = useState(liveActive);

  useEffect(() => {
    setLiveMode(liveActive);
  }, [liveActive]);

  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, LIVE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [liveMode, router]);

  const viewMode: "rows" | "grid" = liveMode ? "grid" : "rows";

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    if (key === "date" && todayKey && value !== todayKey) {
      next.delete("live");
      setLiveMode(false);
    }
    setPage(1);
    router.replace(`?${next.toString()}`);
  }

  function handleToggleLive(enabled: boolean) {
    setLiveMode(enabled);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("view");
    if (enabled) {
      next.set("live", "1");
      if (todayKey) next.set("date", todayKey);
    } else {
      next.delete("live");
    }
    router.replace(`?${next.toString()}`);
  }

  function handleResetFilters() {
    setSearch("");
    setPage(1);
    const next = new URLSearchParams();
    if (liveMode) {
      next.set("live", "1");
      if (todayKey) next.set("date", todayKey);
    }
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "/admin/attendance");
  }

  const hasActiveFilters = Boolean(
    search.trim() ||
      branchId ||
      exceptionsOnly ||
      (date && todayKey && date !== todayKey),
  );

  const filteredDays = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return days;
    return days.filter((d) => {
      const name = (d.employeeName ?? "").toLowerCase();
      const code = (d.employeeCode ?? "").toLowerCase();
      const branch = d.branchName.toLowerCase();
      return name.includes(q) || code.includes(q) || branch.includes(q);
    });
  }, [days, search]);

  const totalPages = Math.max(1, Math.ceil(filteredDays.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedDays = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredDays.slice(start, start + pageSize);
  }, [filteredDays, safePage, pageSize]);

  function handleExportCsv() {
    const exportDate = date || (days[0]?.date ?? "export");
    const headers = [
      "Employee Name",
      "Employee Code",
      "Branch",
      "Date",
      "Clock In",
      "Clock Out",
      "Worked",
      "Overtime",
      "Late (mins)",
      "Status",
      "Flags",
    ];
    const rows = filteredDays.map((day) => [
      `"${(day.employeeName ?? day.employeeId).replace(/"/g, '""')}"`,
      `"${(day.employeeCode ?? "").replace(/"/g, '""')}"`,
      `"${day.branchName.replace(/"/g, '""')}"`,
      `"${day.date}"`,
      `"${day.actualInLabel}"`,
      `"${day.actualOutLabel}"`,
      `"${day.workedLabel}"`,
      `"${day.overtimeLabel}"`,
      day.lateMinutes,
      `"${day.status}"`,
      `"${day.flags.join("; ")}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance-${exportDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleItemClick(e: React.MouseEvent, item: AttendanceRow) {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [role='menuitem'], [data-prevent-row-click]")) {
      return;
    }
    router.push(`/admin/attendance/${item.employeeId}/${item.date}`);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-3">
        <FilterBar
          hasActiveFilters={hasActiveFilters}
          search={
            <div className="relative w-full shrink-0 sm:w-64 md:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="attendance-search"
                placeholder="Search employee or branch..."
                className="h-9 pl-8 text-xs"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          }
          filters={
            <>
              {date && (
                <Input
                  id="attendance-date"
                  type="date"
                  aria-label="Attendance date"
                  value={date}
                  disabled={liveMode}
                  onChange={(e) => updateParam("date", e.target.value)}
                  className="h-9 w-full text-xs sm:w-36 sm:shrink-0"
                />
              )}

              {branches.length > 1 && (
                <NativeSelect
                  id="attendance-branch"
                  aria-label="Filter by branch"
                  value={branchId ?? ""}
                  onChange={(e) => updateParam("branchId", e.target.value || null)}
                  className="h-9 text-xs"
                  containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
                >
                  <option value="">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </NativeSelect>
              )}

              <NativeSelect
                id="attendance-attention"
                aria-label="Filter by attention status"
                value={exceptionsOnly ? "1" : ""}
                onChange={(e) => updateParam("exceptions", e.target.value || null)}
                className="h-9 text-xs"
                containerClassName="w-full sm:w-fit sm:min-w-[145px] sm:shrink-0"
              >
                <option value="">All records</option>
                <option value="1">Needs attention</option>
              </NativeSelect>

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-9 gap-1.5 text-xs"
                  title="Reset filters"
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              )}
            </>
          }
          actions={
            <div className="flex items-center gap-3">
              <div className="flex h-9 items-center gap-2">
                <Switch
                  id="live-mode"
                  checked={liveMode}
                  onChange={(event) => handleToggleLive(event.target.checked)}
                />
                <Label htmlFor="live-mode" className="cursor-pointer whitespace-nowrap text-xs font-medium text-foreground">
                  Live mode
                </Label>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="h-9 shrink-0 gap-1.5 text-xs"
              >
                <Download className="size-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">Export</span>
              </Button>
            </div>
          }
        />

        {paginatedDays.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-foreground/10">
            <Empty className="border-0 py-10">
              <EmptyMedia variant="icon">
                <SearchX className="size-4" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No records</EmptyTitle>
                <EmptyDescription>No attendance records match your current search.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <LayoutGroup>
            <div
              className={cn(
                viewMode === "rows"
                  ? "overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10"
                  : "",
              )}
            >
              {/* Column header visible in Rows mode on desktop */}
              {viewMode === "rows" && (
                <div className="hidden min-w-[900px] grid-cols-[minmax(160px,1.8fr)_minmax(110px,1.1fr)_minmax(115px,1fr)_72px_76px_76px_minmax(150px,1.4fr)_104px] items-center gap-3 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
                  <span>Employee</span>
                  <span>Branch</span>
                  <span>In</span>
                  <span>Out</span>
                  <span>Worked</span>
                  <span>Overtime</span>
                  <span>Attention</span>
                  <span className="text-right">Action</span>
                </div>
              )}

              <div
                className={cn(
                  viewMode === "rows"
                    ? "divide-y divide-border/70"
                    : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
                )}
              >
                {paginatedDays.map((item) => {
                  const needsReview =
                    item.status === "NEEDS_REVIEW" &&
                    Boolean(item.branchId) &&
                    item.canWrite !== false;

                  const actionControl = needsReview ? (
                    <div data-prevent-row-click>
                      <TableRowActions
                        actions={[
                          {
                            id: "review",
                            label: "Review",
                            icon: AlertTriangle,
                            dialog: (props) => (
                              <ResolveExceptionDialog
                                open={props.open}
                                onOpenChange={props.onOpenChange}
                                employeeId={item.employeeId}
                                employeeName={item.employeeName ?? "Staff Member"}
                                branchId={item.branchId!}
                                dateKey={item.date}
                                flags={item.flags}
                                calculatedOvertimeMinutes={item.calculatedOvertimeMinutes ?? 0}
                                payableOvertimeMinutes={item.payableOvertimeMinutes ?? 0}
                                canAuthorizeOvertime={Boolean(item.canWrite)}
                              />
                            ),
                          },
                        ]}
                      />
                    </div>
                  ) : null;

                  if (viewMode === "grid") {
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        layoutId={`att-item-${item.id}`}
                        transition={LAYOUT_SPRING}
                        onClick={(e) => handleItemClick(e, item)}
                        className="flex cursor-pointer flex-col justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {item.employeeName ?? item.employeeId}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.employeeCode ? `${item.employeeCode} · ` : ""}
                              {item.branchName}
                            </p>
                          </div>
                          {actionControl}
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs tabular-nums">
                          <div>
                            <span className="text-[11px] text-muted-foreground">In</span>
                            <p className="font-medium text-foreground">{item.actualInLabel}</p>
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground">Out</span>
                            <p className="font-medium text-foreground">{item.actualOutLabel}</p>
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground">Worked</span>
                            <p className="font-medium text-foreground">{item.workedLabel}</p>
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground">Overtime</span>
                            <p className="font-medium text-foreground">{item.overtimeLabel}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.lateMinutes > 0 && (
                            <StatusBadge tone="warning">
                              <Clock className="size-3" />
                              {item.lateMinutes}m late
                            </StatusBadge>
                          )}
                          {item.status === "NEEDS_REVIEW" ? (
                            item.flags.map((flag) => (
                              <StatusBadge key={flag} tone="critical">
                                {flag.toLowerCase().replace(/_/g, " ")}
                              </StatusBadge>
                            ))
                          ) : item.actualInLabel !== "-" ? (
                            <StatusBadge tone="good">
                              On track
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral">Not clocked in</StatusBadge>
                          )}
                        </div>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      layoutId={`att-item-${item.id}`}
                      transition={LAYOUT_SPRING}
                      onClick={(e) => handleItemClick(e, item)}
                      className="grid cursor-pointer grid-cols-1 items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-muted/30 lg:min-w-[900px] lg:grid-cols-[minmax(160px,1.8fr)_minmax(110px,1.1fr)_minmax(115px,1fr)_72px_76px_76px_minmax(150px,1.4fr)_104px] lg:gap-3"
                    >
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {item.employeeName ?? item.employeeId}
                        </span>
                        {item.employeeCode && (
                          <span className="block font-mono text-xs text-muted-foreground">
                            {item.employeeCode}
                          </span>
                        )}
                      </div>

                      <div className="truncate text-sm text-muted-foreground">
                        {item.branchName}
                      </div>

                      <div className="flex items-center gap-1.5 text-sm tabular-nums">
                        <span>{item.actualInLabel}</span>
                        {item.lateMinutes > 0 && (
                          <StatusBadge tone="warning">{item.lateMinutes}m late</StatusBadge>
                        )}
                      </div>

                      <div className="text-sm tabular-nums">{item.actualOutLabel}</div>
                      <div className="text-sm tabular-nums">{item.workedLabel}</div>
                      <div className="text-sm tabular-nums">{item.overtimeLabel}</div>

                      <div className="flex min-w-0 flex-wrap gap-1">
                        {item.status === "NEEDS_REVIEW" ? (
                          item.flags.map((flag) => (
                            <StatusBadge key={flag} tone="critical">
                              {flag.toLowerCase().replace(/_/g, " ")}
                            </StatusBadge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">&mdash;</span>
                        )}
                      </div>

                      <div className="flex shrink-0 justify-end">{actionControl}</div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </LayoutGroup>
        )}

        <DataTablePagination
          page={safePage}
          totalPages={totalPages}
          total={filteredDays.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          alwaysShow={filteredDays.length > 0}
        />
      </div>
    </MotionConfig>
  );
}
