"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FileCode2,
  Filter,
  RotateCcw,
  Search,
  Shield,
  User as UserIcon,
} from "lucide-react";
import type { AuditLogSearchResult, AuditLogItem } from "@/lib/modules/identity/constants";
import {
  extractAuditDetails,
  extractAuditDiffs,
  formatAuditEntry,
  type AuditCategoryTone,
} from "@/lib/modules/identity/audit-format";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAccraDateTime } from "@/lib/platform/date";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { FilterBar } from "@/components/admin/filter-bar";

const ENTITY_TYPES = [
  { value: "all", label: "All Areas" },
  { value: "Employee", label: "Employees" },
  { value: "AttendanceDay", label: "Attendance" },
  { value: "AttendancePolicy", label: "Attendance Policy" },
  { value: "LeaveRequest", label: "Leave Requests" },
  { value: "LeaveCycle", label: "Annual Leave Cycle" },
  { value: "BranchLeaveQuota", label: "Branch Leave Quotas" },
  { value: "Shift", label: "Shift Templates" },
  { value: "ScheduleException", label: "Shift Overrides" },
  { value: "TrainingCourse", label: "Training Courses" },
  { value: "MealPlan", label: "Staff Meals" },
  { value: "HostedFile", label: "Hosted Files" },
  { value: "Branch", label: "Branches" },
  { value: "Device", label: "Devices" },
  { value: "Question", label: "Feedback Questions" },
  { value: "Announcement", label: "Announcements" },
  { value: "AppRelease", label: "App Releases" },
  { value: "Assessment", label: "Assessments" },
  { value: "AptitudeTest", label: "Aptitude Tests" },
  { value: "User", label: "Users & Security" },
  { value: "CustomRole", label: "Roles & Permissions" },
];

const ACTION_CATEGORIES = [
  { value: "all", label: "All Activities" },
  { value: "employee.", label: "Staff Management" },
  { value: "attendance", label: "Attendance" },
  { value: "leave", label: "Leave & Annual Planning" },
  { value: "shift.", label: "Shifts & Rota" },
  { value: "training.", label: "Training Hub" },
  { value: "meals.", label: "Staff Meals" },
  { value: "file.", label: "Hosted Files" },
  { value: "branch.", label: "Branches" },
  { value: "question.", label: "Feedback Questions" },
  { value: "announcement.", label: "Announcements" },
  { value: "release.", label: "App Releases" },
  { value: "odoo.", label: "Odoo ERP Sync" },
  { value: "policy.", label: "Policies" },
  { value: "auth.", label: "Sign-ins & Security" },
  { value: "user.", label: "Users" },
  { value: "role.", label: "Roles & Permissions" },
];

const CATEGORY_BADGE_CLASSES: Record<AuditCategoryTone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  slate: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

export function AuditLogTable({ data }: { data: AuditLogSearchResult }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [inspectingItem, setInspectingItem] = useState<AuditLogItem | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const currentSearch = searchParams.get("search") ?? "";
  const currentActor = searchParams.get("actorEmail") ?? "all";
  const currentEntity = searchParams.get("entityType") ?? "all";
  const currentAction = searchParams.get("action") ?? "all";
  const currentStart = searchParams.get("startDate") ?? "";
  const currentEnd = searchParams.get("endDate") ?? "";

  const [searchInput, setSearchInput] = useState(currentSearch);
  const [actorInput, setActorInput] = useState(currentActor);
  const [entityInput, setEntityInput] = useState(currentEntity);
  const [actionInput, setActionInput] = useState(currentAction);
  const [startDateInput, setStartDateInput] = useState(currentStart);
  const [endDateInput, setEndDateInput] = useState(currentEnd);

  const applyFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    // Always reset to page 1 on filter change
    if (!updates.page) {
      params.delete("page");
    }

    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const handleSearchSubmit = () => {
    applyFilters({
      search: searchInput.trim() || null,
      actorEmail: actorInput,
      entityType: entityInput,
      action: actionInput,
      startDate: startDateInput || null,
      endDate: endDateInput || null,
    });
  };

  const handleReset = () => {
    setSearchInput("");
    setActorInput("all");
    setEntityInput("all");
    setActionInput("all");
    setStartDateInput("");
    setEndDateInput("");
    startTransition(() => {
      router.push(pathname);
    });
  };

  const goToPage = (newPage: number) => {
    applyFilters({ page: String(newPage) });
  };

  const handlePageSizeChange = (newSize: number) => {
    applyFilters({ pageSize: String(newSize), page: "1" });
  };

  const hasActiveFilters = Boolean(
    currentSearch ||
      currentActor !== "all" ||
      currentEntity !== "all" ||
      currentAction !== "all" ||
      currentStart ||
      currentEnd,
  );

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <FilterBar
        hasActiveFilters={hasActiveFilters}
        search={
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search action, email, entity..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearchSubmit();
                }
              }}
              className="pl-8 h-9 text-xs"
            />
          </div>
        }
        filters={
          <>
            <NativeSelect
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              className="h-9 text-xs"
              containerClassName="w-full sm:w-fit sm:min-w-[165px] sm:shrink-0"
              aria-label="Filter by who performed the action"
            >
              <option value="all">All Actors (Who)</option>
              <option value="__system__">Automated System</option>
              <option value="__users__">All Users (Human)</option>
              {data.actorOptions.length > 0 && (
                <optgroup label="Individual Users">
                  {data.actorOptions.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </optgroup>
              )}
            </NativeSelect>

            <NativeSelect
              value={entityInput}
              onChange={(e) => setEntityInput(e.target.value)}
              className="h-9 text-xs"
              containerClassName="w-full sm:w-fit sm:min-w-[150px] sm:shrink-0"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>

            <NativeSelect
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              className="h-9 text-xs"
              containerClassName="w-full sm:w-fit sm:min-w-[150px] sm:shrink-0"
            >
              {ACTION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>

            <div className="flex items-center gap-1.5 sm:shrink-0">
              <Input
                type="date"
                value={startDateInput}
                onChange={(e) => setStartDateInput(e.target.value)}
                className="h-9 flex-1 min-w-0 px-2.5 text-xs sm:w-[150px] sm:flex-none"
                title="Start date"
              />
              <span className="text-muted-foreground text-xs shrink-0">to</span>
              <Input
                type="date"
                value={endDateInput}
                onChange={(e) => setEndDateInput(e.target.value)}
                className="h-9 flex-1 min-w-0 px-2.5 text-xs sm:w-[150px] sm:flex-none"
                title="End date"
              />
            </div>

            <div className="flex items-center gap-1.5 sm:shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={handleSearchSubmit}
                disabled={isPending}
                className="h-9 flex-1 text-xs sm:flex-none"
              >
                <Filter className="size-3.5 mr-1" />
                Filter
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isPending}
                className="h-9 flex-1 gap-1 text-xs sm:flex-none"
                title="Reset filters"
              >
                <RotateCcw className="size-3.5 mr-1" />
                Reset
              </Button>
            </div>
          </>
        }
      />

      {/* Audit Log Table */}
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {data.items.length === 0 ? (
          <Empty className="py-12">
            <Shield className="size-8 text-muted-foreground" />
            <EmptyTitle>No audit logs found</EmptyTitle>
            <EmptyDescription>
              No system or security activity matching your filters was found.
            </EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What Happened</TableHead>
                <TableHead>Area</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const formatted = formatAuditEntry(item);
                return (
                  <TableRow
                    key={item.id}
                    onClick={() => {
                      setShowRawJson(false);
                      setInspectingItem(item);
                    }}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatAccraDateTime(new Date(item.occurredAt))}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {item.actorEmail ?? "Automated System"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatted.roleLabel}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">
                          {formatted.title}
                        </span>
                        {formatted.summary && (
                          <span className="text-xs text-muted-foreground line-clamp-1">
                            {formatted.summary}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-medium ${CATEGORY_BADGE_CLASSES[formatted.categoryTone]}`}
                        >
                          {formatted.categoryLabel}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {formatted.entityLabel}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Standardized Pagination Footer */}
      <DataTablePagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        pageSize={data.pageSize}
        onPageChange={goToPage}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[10, 20, 50]}
        alwaysShow
      />

      {/* Executive-Readable Activity Detail Dialog */}
      {inspectingItem && (() => {
        const formatted = formatAuditEntry(inspectingItem);
        const diffs = extractAuditDiffs(inspectingItem);
        const details = diffs.length === 0 ? extractAuditDetails(inspectingItem) : [];
        return (
          <Dialog open={true} onOpenChange={(open) => !open && setInspectingItem(null)}>
            <DialogContent className="sm:max-w-xl max-h-[88vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-medium ${CATEGORY_BADGE_CLASSES[formatted.categoryTone]}`}
                  >
                    {formatted.categoryLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatted.entityLabel}</span>
                </div>
                <DialogTitle className="text-base font-semibold">
                  {formatted.title}
                </DialogTitle>
                {formatted.summary && (
                  <DialogDescription className="text-xs text-foreground/90 pt-0.5">
                    {formatted.summary}
                  </DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-4 pt-1 text-xs">
                {/* Who & When Card */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-lg border border-border/80 bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    <UserIcon className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-[11px] text-muted-foreground">Performed By</div>
                      <div className="font-medium text-foreground">
                        {inspectingItem.actorEmail ?? "Automated System"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{formatted.roleLabel}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-[11px] text-muted-foreground">Date & Time (Accra)</div>
                      <div className="font-medium text-foreground">
                        {formatAccraDateTime(new Date(inspectingItem.occurredAt))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Human-Readable Changes Table (Before -> After) */}
                {diffs.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-semibold text-foreground">What Changed</div>
                    <div className="overflow-hidden rounded-lg border border-border/80">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="text-xs h-8">Field</TableHead>
                            <TableHead className="text-xs h-8">Before</TableHead>
                            <TableHead className="text-xs h-8">After</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diffs.map((row) => (
                            <TableRow key={row.field}>
                              <TableCell className="font-medium text-foreground py-2">
                                {row.label}
                              </TableCell>
                              <TableCell className="text-muted-foreground line-through py-2">
                                {row.before}
                              </TableCell>
                              <TableCell className="font-medium text-emerald-700 py-2">
                                {row.after}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Human-Readable Activity Details */}
                {details.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-semibold text-foreground">Activity Details</div>
                    <div className="divide-y divide-border/60 rounded-lg border border-border/80 bg-card">
                      {details.map((row) => (
                        <div key={row.field} className="flex items-start justify-between gap-4 px-3 py-2">
                          <span className="text-muted-foreground shrink-0">{row.label}</span>
                          <span className="font-medium text-foreground text-right break-words">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {diffs.length === 0 && details.length === 0 && (
                  <p className="text-muted-foreground italic">
                    No additional details were recorded for this activity.
                  </p>
                )}

                {/* Collapsible Technical Details for Developers */}
                <div className="border-t border-border/60 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRawJson((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showRawJson ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    <FileCode2 className="size-3.5" />
                    <span>Technical details (raw event)</span>
                  </button>

                  {showRawJson && (
                    <div className="mt-2 space-y-2">
                      <div className="rounded-md border p-2 bg-muted/40 font-mono text-[11px]">
                        <div>Action: {inspectingItem.action}</div>
                        <div>
                          Record: {inspectingItem.entityType} ({inspectingItem.entityId})
                        </div>
                      </div>
                      {Boolean(inspectingItem.before) && (
                        <pre className="overflow-x-auto rounded-md bg-muted p-2.5 font-mono text-[10px]">
                          {JSON.stringify(inspectingItem.before, null, 2)}
                        </pre>
                      )}
                      {Boolean(inspectingItem.after) && (
                        <pre className="overflow-x-auto rounded-md bg-muted p-2.5 font-mono text-[10px]">
                          {JSON.stringify(inspectingItem.after, null, 2)}
                        </pre>
                      )}
                      {Boolean(inspectingItem.metadata) && (
                        <pre className="overflow-x-auto rounded-md bg-muted p-2.5 font-mono text-[10px]">
                          {JSON.stringify(inspectingItem.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
