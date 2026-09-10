"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeaveReviewDialog } from "@/components/admin/leave-review-dialog";
import { CalendarCheck, CheckCircle2, Clock, XCircle } from "lucide-react";

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

export function LeaveRequestsTable({
  requests,
  canReview = false,
}: {
  requests: SerializedLeaveRequest[];
  canReview?: boolean;
}) {
  if (requests.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <CalendarCheck className="size-5" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-foreground">No leave requests</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          No employee leave or day-off requests have been submitted for the selected filter.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-[200px] text-xs font-semibold">Employee</TableHead>
            <TableHead className="text-xs font-semibold">Branch</TableHead>
            <TableHead className="text-xs font-semibold">Type</TableHead>
            <TableHead className="text-xs font-semibold">Requested Dates</TableHead>
            <TableHead className="min-w-[200px] text-xs font-semibold">Reason</TableHead>
            <TableHead className="text-xs font-semibold">Status</TableHead>
            <TableHead className="text-xs font-semibold">Review Details</TableHead>
            {canReview && <TableHead className="text-right text-xs font-semibold">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((r) => (
            <TableRow key={r.id} className="hover:bg-muted/30">
              <TableCell className="font-medium text-xs">
                <div className="font-semibold text-foreground">{r.employeeName}</div>
                <div className="text-[11px] text-muted-foreground">{r.employeeCode} {r.jobTitle ? `• ${r.jobTitle}` : ""}</div>
              </TableCell>

              <TableCell className="text-xs text-muted-foreground">
                {r.branchName || "—"}
              </TableCell>

              <TableCell className="text-xs">
                {getLeaveTypeBadge(r.type)}
              </TableCell>

              <TableCell className="text-xs">
                <div className="font-medium text-foreground">
                  {r.startDate} {r.startDate !== r.endDate ? `to ${r.endDate}` : ""}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {r.daysCount} {r.daysCount === 1 ? "day" : "days"}
                </div>
              </TableCell>

              <TableCell className="text-xs text-foreground max-w-[280px]">
                <p className="truncate" title={r.reason}>
                  {r.reason}
                </p>
              </TableCell>

              <TableCell className="text-xs">
                {getStatusBadge(r.status)}
              </TableCell>

              <TableCell className="text-xs text-muted-foreground">
                {r.reviewedBy ? (
                  <div>
                    <span className="font-medium text-foreground">{r.reviewedBy}</span>
                    {r.managerNotes && (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[180px]" title={r.managerNotes}>
                        &ldquo;{r.managerNotes}&rdquo;
                      </div>
                    )}
                  </div>
                ) : (
                  "—"
                )}
              </TableCell>

              {canReview && (
                <TableCell className="text-right text-xs">
                  {r.status === "PENDING" ? (
                    <LeaveReviewDialog
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
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Settled</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
