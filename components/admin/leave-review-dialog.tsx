"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, FileText, X } from "lucide-react";
import { InspectorSheet } from "@/components/admin/inspector-sheet";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { reviewLeaveRequestAction } from "@/lib/modules/attendance/actions";
import { cn } from "@/lib/utils";

function isPdfAttachment(url: string): boolean {
  const cleanUrl = url.split("?")[0]?.toLowerCase() ?? "";
  return cleanUrl.endsWith(".pdf");
}

interface LeaveReviewDialogProps {
  leaveRequestId: string;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  branchName?: string | null;
  attachmentUrl?: string | null;
  status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewedBy?: string | null;
  managerNotes?: string | null;
  canReview?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
}

export function LeaveReviewDialog({
  leaveRequestId,
  employeeName,
  employeeCode,
  leaveType,
  startDate,
  endDate,
  daysCount,
  reason,
  branchName,
  attachmentUrl,
  status = "PENDING",
  reviewedBy,
  managerNotes,
  canReview = true,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: LeaveReviewDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [notes, setNotes] = useState(managerNotes ?? "");
  const [isPending, startTransition] = useTransition();

  const isActionable = status === "PENDING" && canReview;
  const isPdf = attachmentUrl ? isPdfAttachment(attachmentUrl) : false;

  const statusTone =
    status === "APPROVED"
      ? "good"
      : status === "PENDING"
        ? "warning"
        : status === "REJECTED"
          ? "critical"
          : "neutral";

  function handleDecision(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      try {
        const res = await reviewLeaveRequestAction(leaveRequestId, decision, notes);
        if (res.ok) {
          toast.success(res.message);
          setOpen(false);
        } else {
          toast.error(res.error || "Failed to submit review.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    });
  }

  return (
    <InspectorSheet
      open={open}
      onOpenChange={setOpen}
      title={employeeName}
      description={[employeeCode, branchName].filter(Boolean).join(" · ")}
      badge={
        <StatusBadge tone={statusTone} dot>
          {status.charAt(0) + status.slice(1).toLowerCase()}
        </StatusBadge>
      }
      footer={
        isActionable ? (
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDecision("REJECTED")}
              disabled={isPending}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-3.5" />
              <span>Decline</span>
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleDecision("APPROVED")}
                disabled={isPending}
                className="gap-1.5"
              >
                <Check className="size-3.5" />
                <span>Approve Leave</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5 text-sm">
        {/* Request Summary */}
        <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Leave Type</span>
              <div className="mt-1">
                <StatusBadge tone="neutral">{leaveType.replace(/_/g, " ")}</StatusBadge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p className="mt-1 font-semibold tabular-nums text-foreground">
                {daysCount} {daysCount === 1 ? "day" : "days"}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Requested Period</span>
              <p className="mt-1 font-medium tabular-nums text-foreground">
                {startDate}
                {startDate !== endDate ? ` to ${endDate}` : ""}
              </p>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3">
            <span className="text-xs font-medium text-muted-foreground">Employee&apos;s Reason</span>
            <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-foreground">
              {reason}
            </p>
          </div>
        </div>

        {/* Attached Medical Report / Certificate */}
        {attachmentUrl && (
          <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <FileText className="size-3.5 text-primary" />
                <span>Medical Certificate</span>
              </div>
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 gap-1 px-2 text-xs")}
              >
                <span>Open original</span>
                <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
              {isPdf ? (
                <iframe
                  src={`${attachmentUrl}#toolbar=1&navpanes=0`}
                  title="Medical Certificate PDF"
                  className="h-80 w-full border-0"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachmentUrl}
                  alt="Attached Medical Certificate"
                  className="max-h-96 w-full object-contain p-2"
                />
              )}
            </div>
          </div>
        )}

        {/* Review History or Manager Notes Input */}
        {!isActionable && (reviewedBy || managerNotes) && (
          <div className="space-y-2 rounded-xl border border-border/70 bg-card p-4 text-xs">
            {reviewedBy && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reviewed By</span>
                <span className="font-medium text-foreground">{reviewedBy}</span>
              </div>
            )}
            {managerNotes && (
              <div className="pt-1">
                <span className="text-muted-foreground">Manager Notes</span>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-2.5 text-foreground">
                  {managerNotes}
                </p>
              </div>
            )}
          </div>
        )}

        {isActionable && (
          <div className="space-y-1.5">
            <label htmlFor="manager-notes" className="text-xs font-medium text-foreground">
              Manager Notes (Optional, shared with employee)
            </label>
            <Textarea
              id="manager-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Approved. Cover arranged with team."
              className="h-24 resize-none text-xs"
              disabled={isPending}
            />
          </div>
        )}
      </div>
    </InspectorSheet>
  );
}
