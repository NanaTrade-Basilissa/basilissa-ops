"use client";

import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { LeaveReviewDialog } from "@/components/admin/leave-review-dialog";
import { EmployeeDetailSheet } from "@/components/admin/employee-detail-sheet";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

export interface SerializedLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  jobTitle?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  type: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  managerNotes?: string | null;
  createdAt: string;
}

function getLeaveTypeBadge(type: string) {
  switch (type) {
    case "SICK":
      return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Sick Leave</Badge>;
    case "ANNUAL":
      return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Annual Leave</Badge>;
    case "EMERGENCY":
      return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Emergency</Badge>;
    case "CASUAL":
      return <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">Casual</Badge>;
    case "UNPAID":
      return <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-700">Unpaid</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

function getStatusBadge(status: SerializedLeaveRequest["status"]) {
  switch (status) {
    case "PENDING":
      return (
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 gap-1 font-medium">
          <Clock className="size-3" />
          <span>Pending</span>
        </Badge>
      );
    case "APPROVED":
      return (
        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 gap-1 font-medium">
          <CheckCircle2 className="size-3" />
          <span>Approved</span>
        </Badge>
      );
    case "REJECTED":
      return (
        <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800 gap-1 font-medium">
          <XCircle className="size-3" />
          <span>Declined</span>
        </Badge>
      );
    case "CANCELLED":
      return (
        <Badge variant="outline" className="border-muted bg-muted text-muted-foreground gap-1">
          <span>Cancelled</span>
        </Badge>
      );
  }
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, SerializedLeaveRequest>();

export function LeaveRequestsTable({
  requests,
  canReview = false,
}: {
  requests: SerializedLeaveRequest[];
  canReview?: boolean;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const columns = columnHelper.columns([
    columnHelper.accessor("employeeName", {
      header: "Employee",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <span className="font-medium text-foreground">{row.original.employeeName}</span>
          <span className="block font-mono text-xs text-muted-foreground">
            {row.original.employeeCode}
            {row.original.jobTitle ? <span className="font-sans"> &middot; {row.original.jobTitle}</span> : null}
          </span>
        </div>
      ),
    }),
    columnHelper.accessor("branchName", {
      header: "Branch",
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() || "-"}</span>,
    }),
    columnHelper.accessor("type", {
      header: "Type",
      cell: (info) => getLeaveTypeBadge(info.getValue()),
    }),
    columnHelper.display({
      id: "dates",
      header: "Requested Dates",
      cell: ({ row }) => (
        <div className="space-y-0.5">
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
        <p className="max-w-[280px] truncate" title={info.getValue()}>
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
      header: "Review Details",
      cell: ({ row }) =>
        row.original.reviewedBy ? (
          <div className="space-y-0.5">
            <span className="font-medium text-foreground">{row.original.reviewedBy}</span>
            {row.original.managerNotes && (
              <span className="block max-w-[180px] truncate text-xs text-muted-foreground" title={row.original.managerNotes}>
                &ldquo;{row.original.managerNotes}&rdquo;
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    }),
    ...(canReview
      ? [
          columnHelper.display({
            id: "actions",
            header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
            cell: ({ row }) => {
              const r = row.original;
              return (
                <div className="flex justify-end">
                  {r.status === "PENDING" ? (
                    <TableRowActions
                      actions={[
                        {
                          label: "Review request",
                          icon: Clock,
                          dialog: (props) => (
                            <LeaveReviewDialog
                              {...props}
                              leaveRequestId={r.id}
                              employeeName={r.employeeName}
                              employeeCode={r.employeeCode}
                              leaveType={r.type}
                              startDate={r.startDate}
                              endDate={r.endDate}
                              daysCount={r.daysCount}
                              reason={r.reason}
                              branchName={r.branchName}
                            />
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Settled</span>
                  )}
                </div>
              );
            },
          }),
        ]
      : []),
  ]);

  return (
    <>
      <DataTable
        columns={columns}
        data={requests}
        emptyMessage="No leave or day-off requests have been submitted."
        onRowClick={(row) => setSelectedEmployeeId(row.employeeId)}
      />
      <EmployeeDetailSheet
        employeeId={selectedEmployeeId}
        open={selectedEmployeeId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEmployeeId(null);
        }}
      />
    </>
  );
}
