"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X, CalendarCheck, Clock, FileText, Eye, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { reviewLeaveRequestAction } from "@/lib/modules/attendance/actions";

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
  trigger,
}: LeaveReviewDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [notes, setNotes] = useState(managerNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const isActionable = status === "PENDING" && canReview;
  const isPdf = attachmentUrl ? isPdfAttachment(attachmentUrl) : false;

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
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger ? (
          <DialogTrigger render={trigger} />
        ) : controlledOpen === undefined ? (
          <DialogTrigger
            render={
              <Button variant="outline" size="sm" className="gap-1.5 text-xs font-medium">
                <Clock className="size-3.5 text-amber-500" />
                <span>{isActionable ? "Review" : "Details"}</span>
              </Button>
            }
          />
        ) : null}
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <CalendarCheck className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  {isActionable ? "Review Leave Request" : "Leave Request Details"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {isActionable
                    ? "Inspect attached documentation and decide whether to grant time off."
                    : `Status: ${status.charAt(0) + status.slice(1).toLowerCase()}`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-lg border border-border/80 bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Employee</span>
                <span className="font-medium text-foreground">
                  {employeeName} <span className="text-xs text-muted-foreground">({employeeCode})</span>
                </span>
              </div>

              {branchName && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Branch</span>
                  <span className="text-xs text-foreground font-medium">{branchName}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Leave Type</span>
                <Badge variant="outline" className="text-xs font-medium">
                  {leaveType}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Requested Period</span>
                <span className="text-xs font-semibold text-foreground">
                  {startDate} to {endDate} ({daysCount} {daysCount === 1 ? "day" : "days"})
                </span>
              </div>

              <div className="pt-1">
                <span className="text-xs font-medium text-muted-foreground">Employee&apos;s Reason:</span>
                <p className="mt-1 text-xs text-foreground bg-background p-2 rounded border border-border/60 whitespace-pre-wrap">
                  {reason}
                </p>
              </div>

              {attachmentUrl && (
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Attached Medical Report / Certificate:
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setZoomLevel(1);
                        setIsLightboxOpen(true);
                      }}
                      className="h-7 px-2 text-xs gap-1 text-primary"
                    >
                      <Maximize2 className="size-3.5" />
                      <span>Full View</span>
                    </Button>
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setZoomLevel(1);
                      setIsLightboxOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setZoomLevel(1);
                        setIsLightboxOpen(true);
                      }
                    }}
                    className="group relative overflow-hidden rounded-lg border border-border bg-background cursor-pointer transition hover:border-primary/60"
                  >
                    {isPdf ? (
                      <div className="relative h-52 w-full bg-muted/30">
                        <iframe
                          src={`${attachmentUrl}#toolbar=0&navpanes=0`}
                          title="Medical Certificate Preview"
                          className="h-full w-full pointer-events-none border-0"
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 py-2 text-white">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <FileText className="size-3.5 text-rose-400" />
                            <span>PDF Medical Document</span>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
                            <Eye className="size-3" />
                            Click to view
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex max-h-56 min-h-36 w-full items-center justify-center bg-muted/30 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={attachmentUrl}
                          alt="Attached Medical Certificate"
                          className="max-h-52 w-auto max-w-full rounded object-contain"
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 py-2 text-white">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <FileText className="size-3.5 text-emerald-400" />
                            <span>Medical Certificate Image</span>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
                            <Eye className="size-3" />
                            Click to view
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isActionable && (reviewedBy || managerNotes) && (
                <div className="pt-2 border-t border-border/60 space-y-1">
                  {reviewedBy && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Reviewed By</span>
                      <span className="font-medium text-foreground">{reviewedBy}</span>
                    </div>
                  )}
                  {managerNotes && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">Manager Notes:</span>
                      <p className="mt-1 text-xs text-foreground bg-background p-2 rounded border border-border/60">
                        {managerNotes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isActionable && (
              <div className="space-y-1.5">
                <label htmlFor="manager-notes" className="text-xs font-medium text-foreground">
                  Manager Notes / Reason (Optional, shared with employee)
                </label>
                <Textarea
                  id="manager-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Approved. Cover arranged with team."
                  className="h-20 resize-none text-xs"
                  disabled={isPending}
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            {isActionable ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDecision("REJECTED")}
                  disabled={isPending}
                  className="gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                >
                  <X className="size-3.5" />
                  <span>Decline Request</span>
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
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
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Check className="size-3.5" />
                    <span>Approve Leave</span>
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex w-full justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* In-App Full-Screen Attachment Lightbox Modal */}
      {attachmentUrl && (
        <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/40">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-rose-600" />
                <div>
                  <DialogTitle className="text-sm font-semibold">
                    Medical Certificate — {employeeName}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {leaveType} ({startDate} to {endDate})
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mr-6">
                {!isPdf && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoomLevel((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                      className="h-7 px-2 text-xs"
                    >
                      <ZoomOut className="size-3.5" />
                    </Button>
                    <span className="text-xs font-mono text-muted-foreground min-w-12 text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoomLevel((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                      className="h-7 px-2 text-xs"
                    >
                      <ZoomIn className="size-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsLightboxOpen(false)}
                  className="h-7 px-2.5 text-xs"
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-black/90 flex items-center justify-center min-h-[65vh] max-h-[80vh] p-4">
              {isPdf ? (
                <iframe
                  src={attachmentUrl}
                  title="Medical Certificate Full View"
                  className="h-[75vh] w-full rounded bg-white border-0"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={attachmentUrl}
                  alt="Medical Certificate Full View"
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center center" }}
                  className="max-h-[75vh] max-w-full rounded object-contain transition-transform duration-150"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
