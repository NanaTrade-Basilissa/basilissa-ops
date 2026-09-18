"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Eye,
  Layers,
  Loader2,
  Mail,
  RefreshCw,
  RotateCw,
  Server,
  Wrench,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAccraDateTime } from "@/lib/platform/date";
import type { FormattedJob, JobCategory, JobQueueStats } from "@/lib/modules/identity/constants";
import {
  cancelAnyJobAction,
  retryAnyJobAction,
} from "@/lib/modules/identity/actions";
import { cn } from "@/lib/utils";

function CategoryBadge({ category }: { category: JobCategory }) {
  switch (category) {
    case "email":
      return (
        <Badge variant="outline" className="border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 text-[10px] py-0 gap-1 font-medium">
          <Mail className="size-2.5" />
          Email
        </Badge>
      );
    case "sync":
      return (
        <Badge variant="outline" className="border-indigo-500/30 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 text-[10px] py-0 gap-1 font-medium">
          <RefreshCw className="size-2.5" />
          Sync
        </Badge>
      );
    case "maintenance":
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] py-0 gap-1 font-medium">
          <Wrench className="size-2.5" />
          Maintenance
        </Badge>
      );
    case "system":
    default:
      return (
        <Badge variant="outline" className="border-slate-500/30 bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 text-[10px] py-0 gap-1 font-medium">
          <Server className="size-2.5" />
          System
        </Badge>
      );
  }
}

export function DashboardJobsCard({
  stats,
  jobs,
  canManage = true,
}: {
  stats: JobQueueStats;
  jobs: FormattedJob[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [selectedErrorJob, setSelectedErrorJob] = useState<FormattedJob | null>(null);
  const [selectedPayloadJob, setSelectedPayloadJob] = useState<FormattedJob | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleRetry = (jobId: string) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await retryAnyJobAction(jobId);
        if (res.success) {
          toast.success("Job re-queued for immediate execution");
          router.refresh();
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
          router.refresh();
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

  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-3 border-b border-border/40 bg-muted/20">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Layers className="size-4" />
              </div>
              <CardTitle className="text-base font-semibold text-foreground">
                Background & System Jobs
              </CardTitle>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-semibold">
                Queue
              </Badge>
            </div>
            <CardDescription className="text-xs mt-1">
              Physical Postgres job queue across all workers. Inspect execution payloads, track failures, and control tasks.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/admin/email-queue"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 text-xs gap-1 text-muted-foreground hover:text-foreground")}
            >
              <Mail className="size-3.5" />
              Email Queue
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isPending}
              className="h-8 text-xs gap-1.5"
            >
              <RotateCw className={cn("size-3.5", isPending && "animate-spin")} />
              Refresh
            </Button>
            <Link
              href="/admin/jobs"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-8 text-xs gap-1")}
            >
              Full Queue <ArrowRight className="size-3" />
            </Link>
          </div>
        </CardHeader>

        <CardContent className="pt-4 pb-4 space-y-4">
          {/* Quick Metrics Pods */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-50/90 dark:bg-muted/40 p-3 border border-border/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Queued</span>
                <Clock className="size-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-foreground mt-2">
                {stats.pending}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Waiting for worker pickup</p>
            </div>

            <div className="rounded-xl bg-slate-50/90 dark:bg-muted/40 p-3 border border-border/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Running</span>
                <Loader2 className="size-3.5 text-blue-600 animate-spin" />
              </div>
              <div className="text-xl font-bold text-foreground mt-2">
                {stats.running}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Actively processing</p>
            </div>

            <div className="rounded-xl bg-slate-50/90 dark:bg-muted/40 p-3 border border-border/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Succeeded</span>
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-foreground mt-2">
                {stats.succeeded}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Completed successfully</p>
            </div>

            <div className={cn(
              "rounded-xl p-3 border flex flex-col justify-between transition-colors",
              stats.dead > 0
                ? "bg-rose-50/80 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40"
                : "bg-slate-50/90 dark:bg-muted/40 border-border/40",
            )}>
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className={cn(stats.dead > 0 && "text-rose-700 dark:text-rose-400 font-semibold")}>
                  Dead / Failed
                </span>
                <AlertCircle className={cn("size-3.5", stats.dead > 0 ? "text-rose-600" : "text-muted-foreground")} />
              </div>
              <div className={cn("text-xl font-bold mt-2", stats.dead > 0 ? "text-rose-700 dark:text-rose-400" : "text-foreground")}>
                {stats.dead}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stats.dead > 0 ? "Needs human review" : "No failed jobs"}
              </p>
            </div>
          </div>

          {/* Failure Alert Banner if any dead jobs */}
          {stats.dead > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200/80 px-3.5 py-2.5 text-xs text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-rose-600" />
                <span>
                  <strong>{stats.dead}</strong> failed background job{stats.dead > 1 ? "s" : ""} require attention. Inspect failure errors and trigger retries.
                </span>
              </div>
              <Link
                href="/admin/jobs?status=DEAD"
                className="font-semibold underline underline-offset-2 shrink-0 ml-2 hover:text-rose-950 dark:hover:text-rose-100"
              >
                Filter failed
              </Link>
            </div>
          )}

          {/* Recent Jobs Interactive List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
              <span>Recent Queue Activity</span>
              <span>Controls</span>
            </div>

            {jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
                No recent background jobs found in the queue.
              </div>
            ) : (
              <div className="divide-y divide-border/40 rounded-xl border border-border/40 bg-card overflow-hidden">
                {jobs.map((job) => {
                  const isJobPending = pendingJobId === job.id;

                  return (
                    <div
                      key={job.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-3 hover:bg-muted/30 transition-colors text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">
                            {job.typeLabel}
                          </span>
                          <CategoryBadge category={job.category} />

                          {job.status === "PENDING" && (
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 gap-1 text-[10px] py-0">
                              <Clock className="size-2.5" /> Queued
                            </Badge>
                          )}
                          {job.status === "RUNNING" && (
                            <Badge variant="outline" className="border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 gap-1 text-[10px] py-0">
                              <Loader2 className="size-2.5 animate-spin" /> Running
                            </Badge>
                          )}
                          {job.status === "SUCCEEDED" && (
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 gap-1 text-[10px] py-0">
                              <CheckCircle2 className="size-2.5" /> Succeeded
                            </Badge>
                          )}
                          {job.status === "DEAD" && (
                            <Badge variant="outline" className="border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 gap-1 text-[10px] py-0">
                              <AlertCircle className="size-2.5" /> Failed
                            </Badge>
                          )}

                          <span className="text-[11px] text-muted-foreground font-mono">
                            Attempt {job.attempts}/{job.maxAttempts}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground text-[11px] truncate">
                          <span className="font-mono text-muted-foreground truncate max-w-[140px] sm:max-w-[180px]">
                            {job.id}
                          </span>
                          <span>&middot;</span>
                          <span className="font-mono text-foreground truncate">{job.type}</span>
                          <span>&middot;</span>
                          <span className="shrink-0">{formatAccraDateTime(job.createdAt)}</span>
                        </div>

                        {job.status === "DEAD" && job.lastError && (
                          <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 pt-0.5">
                            <span className="font-semibold shrink-0">Error:</span>
                            <span className="truncate font-mono">{job.lastError}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedErrorJob(job)}
                              className="h-5 px-1.5 text-[10px] text-rose-700 hover:text-rose-800 hover:bg-rose-100 dark:text-rose-300"
                            >
                              <Eye className="size-3 mr-1" /> View Error
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Action Controls */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPayloadJob(job)}
                          className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
                          title="Inspect Payload"
                        >
                          <Code2 className="size-3" />
                          Payload
                        </Button>

                        {canManage && (job.status === "DEAD" || job.status === "RUNNING") && (
                          <Button
                            size="sm"
                            onClick={() => handleRetry(job.id)}
                            disabled={isJobPending || isPending}
                            className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1 px-2.5"
                          >
                            {isJobPending ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <RotateCw className="size-3" />
                            )}
                            Retry Job
                          </Button>
                        )}

                        {canManage && job.status === "PENDING" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(job.id)}
                              disabled={isJobPending || isPending}
                              className="h-7 text-xs gap-1 px-2.5"
                            >
                              {isJobPending ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <RotateCw className="size-3" />
                              )}
                              Run Now
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(job.id)}
                              disabled={isJobPending || isPending}
                              className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2"
                            >
                              <XCircle className="size-3" />
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payload Inspector Dialog */}
      <Dialog
        open={selectedPayloadJob !== null}
        onOpenChange={(open) => !open && setSelectedPayloadJob(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="size-5 text-primary" />
              <span>Job Payload Inspector</span>
            </DialogTitle>
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
