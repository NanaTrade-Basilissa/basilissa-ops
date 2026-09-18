"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Loader2,
  Mail,
  RefreshCw,
  RotateCw,
  Server,
  Wrench,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAccraDateTime } from "@/lib/platform/date";
import type { FormattedJob, JobCategory } from "@/lib/modules/identity/constants";
import { cancelAnyJobAction, retryAnyJobAction } from "@/lib/modules/identity/actions";

const columnHelper = createColumnHelper<typeof dataTableFeatures, FormattedJob>();

function CategoryBadge({ category }: { category: JobCategory }) {
  switch (category) {
    case "email":
      return (
        <Badge variant="outline" className="border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 text-[11px] font-medium gap-1">
          <Mail className="size-3" />
          Email
        </Badge>
      );
    case "sync":
      return (
        <Badge variant="outline" className="border-indigo-500/30 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 text-[11px] font-medium gap-1">
          <RefreshCw className="size-3" />
          Sync
        </Badge>
      );
    case "maintenance":
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[11px] font-medium gap-1">
          <Wrench className="size-3" />
          Maintenance
        </Badge>
      );
    case "system":
    default:
      return (
        <Badge variant="outline" className="border-slate-500/30 bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 text-[11px] font-medium gap-1">
          <Server className="size-3" />
          System
        </Badge>
      );
  }
}

export function JobsTable({
  jobs,
  canManage,
}: {
  jobs: FormattedJob[];
  canManage: boolean;
}) {
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [selectedErrorJob, setSelectedErrorJob] = useState<FormattedJob | null>(null);
  const [selectedPayloadJob, setSelectedPayloadJob] = useState<FormattedJob | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRetry = (jobId: string) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await retryAnyJobAction(jobId);
        if (res.success) {
          toast.success("Job re-queued for immediate execution");
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

  const handleCancel = (jobId: string) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await cancelAnyJobAction(jobId);
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

  const handleCopyPayload = (payload: unknown) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setHasCopied(true);
      toast.success("Payload copied to clipboard");
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast.error("Failed to copy payload");
    }
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
                  Succeeded
                </Badge>
              );
            }
            if (status === "RUNNING") {
              return (
                <Badge
                  variant="outline"
                  className="border-blue-500/30 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                >
                  <Loader2 className="mr-1 size-3 animate-spin text-blue-600 dark:text-blue-400" />
                  Running
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
                Dead / Failed
              </Badge>
            );
          },
        }),
        columnHelper.display({
          id: "type",
          header: "Job Type",
          cell: ({ row }) => (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">{row.original.typeLabel}</span>
                <CategoryBadge category={row.original.category} />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{row.original.type}</span>
              </div>
            </div>
          ),
        }),
        columnHelper.display({
          id: "details",
          header: "Job ID & Payload",
          cell: ({ row }) => (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedPayloadJob(row.original)}
                  className="font-mono text-xs text-foreground underline-offset-4 hover:underline cursor-pointer truncate max-w-[140px] sm:max-w-[180px] text-left"
                  title="Inspect job payload"
                >
                  {row.original.id}
                </button>
              </div>

              {row.original.lastError && (
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedErrorJob(row.original)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-destructive underline-offset-4 hover:underline cursor-pointer"
                  >
                    <AlertCircle className="size-3" />
                    Error details
                  </button>
                </div>
              )}
            </div>
          ),
        }),
        columnHelper.display({
          id: "attempts",
          header: "Attempts",
          cell: ({ row }) => (
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-foreground">
                {row.original.attempts} / {row.original.maxAttempts}
              </span>
              {row.original.lockedBy && (
                <span className="block text-[10px] text-blue-600 dark:text-blue-400 font-mono truncate max-w-[100px]" title={`Worker: ${row.original.lockedBy}`}>
                  {row.original.lockedBy}
                </span>
              )}
            </div>
          ),
        }),
        columnHelper.accessor("runAt", {
          header: "Scheduled For",
          cell: (info) => (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatAccraDateTime(info.getValue())}
            </span>
          ),
        }),
        columnHelper.accessor("createdAt", {
          header: "Created",
          cell: (info) => (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatAccraDateTime(info.getValue())}
            </span>
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
                  {
                    id: "payload",
                    label: "Inspect payload",
                    icon: Code2,
                    onClick: () => setSelectedPayloadJob(job),
                  },
                  Boolean(job.lastError) && {
                    id: "error",
                    label: "Error details",
                    icon: AlertCircle,
                    onClick: () => setSelectedErrorJob(job),
                  },
                  canManage && (job.status === "DEAD" || job.status === "RUNNING") && {
                    id: "retry",
                    label: "Retry job",
                    icon: RotateCw,
                    disabled: isLoading,
                    onClick: () => handleRetry(job.id),
                  },
                  canManage && job.status === "PENDING" && {
                    id: "run-now",
                    label: "Run now",
                    icon: RotateCw,
                    disabled: isLoading,
                    onClick: () => handleRetry(job.id),
                  },
                  canManage && job.status === "PENDING" && {
                    id: "cancel",
                    label: "Cancel job",
                    icon: XCircle,
                    variant: "destructive",
                    disabled: isLoading,
                    dialog: (props) => (
                      <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Background Job?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will cancel job <code className="font-mono text-xs">{job.id}</code> ({job.typeLabel}).
                              The job will be marked as DEAD and will not be processed by background workers.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Queued</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancel(job.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Cancel Job
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
      <DataTable
        columns={columns}
        data={jobs}
        emptyMessage="No background jobs found matching the active filters."
      />

      {/* Payload Inspector Dialog */}
      <Dialog
        open={selectedPayloadJob !== null}
        onOpenChange={(open) => !open && setSelectedPayloadJob(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Code2 className="size-5 text-primary" />
                <span>Job Payload Inspector</span>
              </DialogTitle>
            </div>
            <DialogDescription>
              Inspecting job parameters and data payload for <code className="font-mono text-xs text-foreground font-semibold">{selectedPayloadJob?.id}</code>
            </DialogDescription>
          </DialogHeader>

          {selectedPayloadJob && (
            <div className="space-y-4 overflow-hidden flex flex-col flex-1">
              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3 rounded-lg border">
                <div>
                  <span className="text-muted-foreground block">Type:</span>
                  <span className="font-mono font-medium">{selectedPayloadJob.type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Category:</span>
                  <span className="capitalize font-medium">{selectedPayloadJob.category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Created At:</span>
                  <span>{formatAccraDateTime(selectedPayloadJob.createdAt)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Run At:</span>
                  <span>{formatAccraDateTime(selectedPayloadJob.runAt)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Payload Data (JSON):</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handleCopyPayload(selectedPayloadJob.payload)}
                >
                  {hasCopied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                  {hasCopied ? "Copied" : "Copy JSON"}
                </Button>
              </div>

              <pre className="flex-1 overflow-auto rounded-lg bg-slate-950 p-4 text-xs font-mono text-emerald-400 border border-border/50 max-h-[350px]">
                {JSON.stringify(selectedPayloadJob.payload, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Error Details Dialog */}
      <AlertDialog
        open={selectedErrorJob !== null}
        onOpenChange={(open) => !open && setSelectedErrorJob(null)}
      >
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5 shrink-0" />
              <AlertDialogTitle>Background Job Failure Log</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs">
              Error recorded during worker execution for job{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground font-semibold">
                {selectedErrorJob?.id}
              </code>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedErrorJob && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-mono">{selectedErrorJob.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attempts made:</span>
                  <span className="font-medium">
                    {selectedErrorJob.attempts} / {selectedErrorJob.maxAttempts}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatAccraDateTime(selectedErrorJob.createdAt)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">Stack Trace / Failure Message:</p>
                <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs font-mono text-rose-400 border border-border/50 whitespace-pre-wrap break-all">
                  {selectedErrorJob.lastError ?? "No error details available."}
                </pre>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            {canManage && selectedErrorJob && (
              <AlertDialogAction
                onClick={() => handleRetry(selectedErrorJob.id)}
                className="gap-1.5"
              >
                <RotateCw className="size-3.5" />
                Retry This Job
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
