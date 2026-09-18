"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  RotateCw,
  Send,
  XCircle,
} from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatAccraDateTime } from "@/lib/platform/date";
import type { FormattedEmailJob } from "@/lib/modules/identity/constants";
import {
  cancelEmailJobAction,
  resendEmailJobAction,
  retryEmailJobAction,
} from "@/lib/modules/identity/actions";

const columnHelper = createColumnHelper<typeof dataTableFeatures, FormattedEmailJob>();

export function EmailQueueTable({
  jobs,
  canManage,
}: {
  jobs: FormattedEmailJob[];
  canManage: boolean;
}) {
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [selectedErrorJob, setSelectedErrorJob] = useState<FormattedEmailJob | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRetry = (jobId: string) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await retryEmailJobAction(jobId);
        if (res.success) {
          toast.success("Job re-queued for immediate delivery");
        } else {
          toast.error(res.error ?? "Failed to retry job");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error retrying job");
      } finally {
        setPendingJobId(null);
      }
    });
  };

  const handleResend = (jobId: string) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await resendEmailJobAction(jobId);
        if (res.success) {
          toast.success("New email job queued for delivery");
        } else {
          toast.error(res.error ?? "Failed to resend email");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error resending email");
      } finally {
        setPendingJobId(null);
      }
    });
  };

  const handleCancel = (jobId: string) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await cancelEmailJobAction(jobId);
        if (res.success) {
          toast.success("Pending job cancelled");
        } else {
          toast.error(res.error ?? "Failed to cancel job");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error cancelling job");
      } finally {
        setPendingJobId(null);
      }
    });
  };

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("status", {
          header: "Status",
          cell: (info) => {
            const status = info.getValue();
            if (status === "SUCCEEDED") {
              return (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                >
                  <CheckCircle2 className="mr-1 size-3 text-emerald-600 dark:text-emerald-400" />
                  Sent
                </Badge>
              );
            }
            if (status === "RUNNING") {
              return (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-50 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                >
                  <Loader2 className="mr-1 size-3 animate-spin text-amber-600 dark:text-amber-400" />
                  Sending
                </Badge>
              );
            }
            if (status === "PENDING") {
              return (
                <Badge variant="secondary" className="font-medium text-muted-foreground">
                  <Clock className="mr-1 size-3" />
                  Queued
                </Badge>
              );
            }
            return (
              <Badge variant="destructive" className="font-medium">
                <AlertCircle className="mr-1 size-3" />
                Failed
              </Badge>
            );
          },
        }),
        columnHelper.display({
          id: "recipient",
          header: "Recipient & Type",
          cell: ({ row }) => (
            <div className="space-y-1">
              <span className="block font-medium text-foreground">{row.original.recipient}</span>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs">
                  <Mail className="mr-1 size-3 text-muted-foreground" />
                  {row.original.typeLabel}
                </Badge>
              </div>
            </div>
          ),
        }),
        columnHelper.display({
          id: "subject",
          header: "Subject / Purpose",
          cell: ({ row }) => (
            <div className="max-w-md space-y-0.5">
              <span className="block font-medium text-foreground">{row.original.subject}</span>
              <span className="block text-xs font-mono text-muted-foreground">id: {row.original.id}</span>
              {row.original.lastError && (
                <button
                  type="button"
                  onClick={() => setSelectedErrorJob(row.original)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-destructive underline-offset-4 hover:underline"
                >
                  <AlertCircle className="size-3" />
                  View error details
                </button>
              )}
            </div>
          ),
        }),
        columnHelper.display({
          id: "attempts",
          header: "Attempts",
          cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
              {row.original.attempts} / {row.original.maxAttempts}
            </span>
          ),
        }),
        columnHelper.accessor("runAt", {
          header: "Scheduled For",
          cell: (info) => (
            <span className="text-xs text-muted-foreground">{formatAccraDateTime(info.getValue())}</span>
          ),
        }),
        columnHelper.accessor("createdAt", {
          header: "Created",
          cell: (info) => (
            <span className="text-xs text-muted-foreground">{formatAccraDateTime(info.getValue())}</span>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
          cell: ({ row }) => {
            const job = row.original;
            const isLoading = isPending && pendingJobId === job.id;

            return (
              <TableRowActions
                actions={[
                  Boolean(job.lastError) && {
                    id: "error",
                    label: "Error details",
                    icon: AlertCircle,
                    onClick: () => setSelectedErrorJob(job),
                  },
                  canManage && job.status === "DEAD" && {
                    id: "retry",
                    label: "Retry email",
                    icon: RotateCw,
                    disabled: isLoading,
                    onClick: () => handleRetry(job.id),
                  },
                  canManage && job.status === "SUCCEEDED" && {
                    id: "resend",
                    label: "Resend email",
                    icon: Send,
                    disabled: isLoading,
                    onClick: () => handleResend(job.id),
                  },
                  canManage && job.status === "PENDING" && {
                    id: "send-now",
                    label: "Send now",
                    icon: RotateCw,
                    disabled: isLoading,
                    onClick: () => handleRetry(job.id),
                  },
                  canManage && job.status === "PENDING" && {
                    id: "cancel",
                    label: "Cancel email",
                    icon: XCircle,
                    variant: "destructive",
                    disabled: isLoading,
                    dialog: (props) => (
                      <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel pending email?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will cancel the queued email to{" "}
                              <strong>{job.recipient}</strong> and prevent the worker from sending it.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep queued</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancel(job.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Cancel email
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ),
                  },
                ]}
              />
            );
          },
        }),
      ]),
    [canManage, isPending, pendingJobId],
  );

  return (
    <>
      <DataTable columns={columns} data={jobs} emptyMessage="No email jobs match this filter." />

      {/* Error Details Inspection Dialog */}
      <AlertDialog
        open={selectedErrorJob !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedErrorJob(null);
        }}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              Delivery Failure Details
            </AlertDialogTitle>
            <AlertDialogDescription>
              Error recorded for job to <strong>{selectedErrorJob?.recipient}</strong> (
              {selectedErrorJob?.typeLabel}):
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[300px] overflow-y-auto rounded-lg bg-muted p-4 font-mono text-xs text-foreground">
            {selectedErrorJob?.lastError || "No detailed error message logged."}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            {canManage && selectedErrorJob && selectedErrorJob.status === "DEAD" && (
              <AlertDialogAction
                onClick={() => {
                  const id = selectedErrorJob.id;
                  setSelectedErrorJob(null);
                  handleRetry(id);
                }}
              >
                <RotateCw className="mr-1.5 size-4" />
                Retry now
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
