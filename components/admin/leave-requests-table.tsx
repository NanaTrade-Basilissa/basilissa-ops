"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { FileText, RotateCcw, Search } from "lucide-react";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { EmployeeDetailSheet } from "@/components/admin/employee-detail-sheet";
import { FilterBar } from "@/components/admin/filter-bar";
import { LeaveReviewDialog } from "@/components/admin/leave-review-dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export interface SerializedLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  jobTitle?: string | null;
  branchId: string | null;
  branchName: string | null;
  type: "ANNUAL" | "SICK" | "CASUAL" | "EMERGENCY" | "UNPAID" | "DAY_OFF" | string;
  startDate: string;
  endDate: string;
  isoWeek: string | null;
  attachmentUrl: string | null;
  daysCount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewedBy: string | null;
  reviewedAt: string | null;
  managerNotes: string | null;
  createdAt: string;
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, SerializedLeaveRequest>();

function getTypeBadge(type: SerializedLeaveRequest["type"]) {
  switch (type) {
    case "ANNUAL":
      return <StatusBadge tone="info">Annual Leave</StatusBadge>;
    case "SICK":
      return <StatusBadge tone="critical">Sick Leave</StatusBadge>;
    case "EMERGENCY":
      return <StatusBadge tone="warning">Emergency</StatusBadge>;
    case "DAY_OFF":
      return <StatusBadge tone="brand">Day Off</StatusBadge>;
    case "CASUAL":
      return <StatusBadge tone="neutral">Casual Leave</StatusBadge>;
    case "UNPAID":
      return <StatusBadge tone="neutral">Unpaid</StatusBadge>;
    default:
      return <StatusBadge tone="neutral">{type.replace(/_/g, " ")}</StatusBadge>;
  }
}

function getStatusBadge(status: SerializedLeaveRequest["status"]) {
  switch (status) {
    case "PENDING":
      return (
        <StatusBadge tone="warning" dot>
          Pending
        </StatusBadge>
      );
    case "APPROVED":
      return (
        <StatusBadge tone="good" dot>
          Approved
        </StatusBadge>
      );
    case "REJECTED":
      return (
        <StatusBadge tone="critical" dot>
          Declined
        </StatusBadge>
      );
    case "CANCELLED":
    default:
      return <StatusBadge tone="neutral">Cancelled</StatusBadge>;
  }
}

export function LeaveRequestsTable({
  requests,
  canReview = true,
}: {
  requests: SerializedLeaveRequest[];
  canReview?: boolean;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState<SerializedLeaveRequest | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        (r.branchName ?? "").toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    });
  }, [requests, search, statusFilter]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "employee",
          header: "Employee",
          cell: ({ row }) => (
            <div className="min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEmployeeId(row.original.employeeId);
                }}
                className="cursor-pointer text-left font-medium text-foreground underline-offset-4 hover:underline"
              >
                {row.original.employeeName}
              </button>
              <span className="block text-xs text-muted-foreground">
                <span className="font-mono">{row.original.employeeCode}</span>
                {row.original.branchName ? ` · ${row.original.branchName}` : ""}
              </span>
            </div>
          ),
        }),
        columnHelper.accessor("type", {
          header: "Type",
          cell: ({ row }) => (
            <div className="space-y-1">
              {getTypeBadge(row.original.type)}
              {row.original.attachmentUrl && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <FileText className="size-3" />
                  Medical report attached
                </span>
              )}
            </div>
          ),
        }),
        columnHelper.display({
          id: "dates",
          header: "Requested Dates",
          cell: ({ row }) => (
            <div className="space-y-0.5 tabular-nums">
              <span className="font-medium text-foreground">
                {row.original.startDate}
                {row.original.startDate !== row.original.endDate ? ` to ${row.original.endDate}` : ""}
              </span>
              <span className="block text-xs text-muted-foreground">
                {row.original.daysCount} {row.original.daysCount === 1 ? "day" : "days"}
              </span>
            </div>
          ),
        }),
        columnHelper.accessor("reason", {
          header: "Reason",
          cell: (info) => (
            <p className="max-w-[260px] truncate text-sm text-muted-foreground" title={info.getValue()}>
              {info.getValue()}
            </p>
          ),
        }),
        columnHelper.accessor("status", {
          header: "Status",
          cell: (info) => getStatusBadge(info.getValue()),
        }),
        columnHelper.display({
          id: "review",
          header: "Reviewed By",
          cell: ({ row }) =>
            row.original.reviewedBy ? (
              <div className="space-y-0.5">
                <span className="font-medium text-foreground">{row.original.reviewedBy}</span>
                {row.original.managerNotes && (
                  <span
                    className="block max-w-[180px] truncate text-xs text-muted-foreground"
                    title={row.original.managerNotes}
                  >
                    &ldquo;{row.original.managerNotes}&rdquo;
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">&mdash;</span>
            ),
        }),
      ]),
    [],
  );

  return (
    <div className="space-y-3">
      <FilterBar
        hasActiveFilters={statusFilter !== "ALL"}
        search={
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, code, branch..."
              className="h-9 pl-8 text-xs"
            />
          </div>
        }
        filters={
          <>
            <NativeSelect
              id="leave-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "ALL" | "PENDING" | "APPROVED" | "REJECTED")
              }
              className="h-9 text-xs"
              containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Declined</option>
            </NativeSelect>

            {(search || statusFilter !== "ALL") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("ALL");
                }}
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
        data={filteredRequests}
        ariaLabel="Leave requests"
        pageSize={20}
        emptyMessage={
          search || statusFilter !== "ALL"
            ? "No leave requests match your current filter."
            : "No leave or day-off requests have been submitted."
        }
        onRowClick={(row) => setSelectedLeaveRequest(row)}
      />

      {selectedLeaveRequest && (
        <LeaveReviewDialog
          open={selectedLeaveRequest !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedLeaveRequest(null);
          }}
          leaveRequestId={selectedLeaveRequest.id}
          employeeName={selectedLeaveRequest.employeeName}
          employeeCode={selectedLeaveRequest.employeeCode}
          leaveType={selectedLeaveRequest.type}
          startDate={selectedLeaveRequest.startDate}
          endDate={selectedLeaveRequest.endDate}
          daysCount={selectedLeaveRequest.daysCount}
          reason={selectedLeaveRequest.reason}
          branchName={selectedLeaveRequest.branchName}
          attachmentUrl={selectedLeaveRequest.attachmentUrl}
          status={selectedLeaveRequest.status}
          reviewedBy={selectedLeaveRequest.reviewedBy}
          managerNotes={selectedLeaveRequest.managerNotes}
          canReview={canReview}
        />
      )}

      <EmployeeDetailSheet
        employeeId={selectedEmployeeId}
        open={selectedEmployeeId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEmployeeId(null);
        }}
      />
    </div>
  );
}
