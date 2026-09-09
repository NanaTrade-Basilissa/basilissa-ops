"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCode2,
  Filter,
  RotateCcw,
  Search,
  Shield,
} from "lucide-react";
import type { AuditLogSearchResult, AuditLogItem } from "@/lib/modules/identity/constants";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

const ENTITY_TYPES = [
  { value: "all", label: "All Entities" },
  { value: "AttendanceDay", label: "Attendance Day" },
  { value: "AttendancePolicy", label: "Attendance Policy" },
  { value: "Employee", label: "Employee" },
  { value: "Shift", label: "Shift" },
  { value: "Branch", label: "Branch" },
  { value: "User", label: "User" },
  { value: "Assessment", label: "Assessment" },
  { value: "AptitudeTest", label: "Aptitude Test" },
];

const ACTION_CATEGORIES = [
  { value: "all", label: "All Actions" },
  { value: "attendance.", label: "attendance.*" },
  { value: "policy.", label: "policy.*" },
  { value: "employee.", label: "employee.*" },
  { value: "shift.", label: "shift.*" },
  { value: "branch.", label: "branch.*" },
  { value: "user.", label: "user.*" },
];

export function AuditLogTable({ data }: { data: AuditLogSearchResult }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [inspectingItem, setInspectingItem] = useState<AuditLogItem | null>(null);

  const currentSearch = searchParams.get("search") ?? "";
  const currentEntity = searchParams.get("entityType") ?? "all";
  const currentAction = searchParams.get("action") ?? "all";
  const currentStart = searchParams.get("startDate") ?? "";
  const currentEnd = searchParams.get("endDate") ?? "";

  const [searchInput, setSearchInput] = useState(currentSearch);
  const [entityInput, setEntityInput] = useState(currentEntity);
  const [actionInput, setActionInput] = useState(currentAction);
  const [startDateInput, setStartDateInput] = useState(currentStart);
  const [endDateInput, setEndDateInput] = useState(currentEnd);

  const applyFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "audit");
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

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({
      search: searchInput.trim() || null,
      entityType: entityInput,
      action: actionInput,
      startDate: startDateInput || null,
      endDate: endDateInput || null,
    });
  };

  const handleReset = () => {
    setSearchInput("");
    setEntityInput("all");
    setActionInput("all");
    setStartDateInput("");
    setEndDateInput("");
    const params = new URLSearchParams();
    params.set("tab", "audit");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const goToPage = (newPage: number) => {
    applyFilters({ page: String(newPage) });
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <form
        onSubmit={handleSearchSubmit}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm"
      >
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search action, email, entity..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        <select
          value={entityInput}
          onChange={(e) => setEntityInput(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {ACTION_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={startDateInput}
            onChange={(e) => setStartDateInput(e.target.value)}
            className="h-9 w-[130px]"
            title="Start date"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            value={endDateInput}
            onChange={(e) => setEndDateInput(e.target.value)}
            className="h-9 w-[130px]"
            title="End date"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Button type="submit" size="sm" disabled={isPending}>
            <Filter className="size-3.5 mr-1" />
            Filter
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isPending}
            title="Reset filters"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </form>

      {/* Audit Log Table */}
      <div className="rounded-md border border-border bg-card">
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
              <TableRow>
                <TableHead>Time (Accra)</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {formatAccraDateTime(new Date(item.occurredAt))}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {item.actorEmail ?? "SYSTEM"}
                      </span>
                      {item.actorRole && (
                        <span className="text-[10px] text-muted-foreground">
                          {item.actorRole}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {item.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{item.entityType}</span>
                      <span className="font-mono text-[10px] text-muted-foreground max-w-[150px] truncate" title={item.entityId}>
                        {item.entityId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInspectingItem(item)}
                      className="h-8 gap-1 text-xs"
                    >
                      <Eye className="size-3.5" />
                      <span>Inspect</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination Footer */}
      {data.total > 0 && (
        <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
          <div>
            Showing {(data.page - 1) * data.pageSize + 1} to{" "}
            {Math.min(data.page * data.pageSize, data.total)} of {data.total} entries
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(data.page - 1)}
              disabled={data.page <= 1 || isPending}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span>
              Page {data.page} of {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(data.page + 1)}
              disabled={data.page >= data.totalPages || isPending}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Payload Inspection Dialog */}
      {inspectingItem && (
        <Dialog open={true} onOpenChange={(open) => !open && setInspectingItem(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-mono text-base">
                <FileCode2 className="size-4" />
                {inspectingItem.action}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Audited at {formatAccraDateTime(new Date(inspectingItem.occurredAt))} by{" "}
                {inspectingItem.actorEmail ?? "SYSTEM"} ({inspectingItem.actorRole ?? "SYSTEM"})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              <div className="rounded-md border p-2 bg-muted/40 font-mono">
                <div>
                  <span className="text-muted-foreground">Entity:</span> {inspectingItem.entityType} (
                  {inspectingItem.entityId})
                </div>
              </div>

              {Boolean(inspectingItem.before) && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-muted-foreground">State Before:</div>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(inspectingItem.before, null, 2)}
                  </pre>
                </div>
              )}

              {Boolean(inspectingItem.after) && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-muted-foreground">State After:</div>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(inspectingItem.after, null, 2)}
                  </pre>
                </div>
              )}

              {Boolean(inspectingItem.metadata) && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-muted-foreground">Metadata:</div>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(inspectingItem.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {!inspectingItem.before && !inspectingItem.after && !inspectingItem.metadata ? (
                <p className="text-muted-foreground italic">No state changes or metadata recorded.</p>
              ) : null}

            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
