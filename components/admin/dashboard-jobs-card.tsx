"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  RotateCw,
  Send,
  XCircle,
  Eye,
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
import { formatAccraDateTime } from "@/lib/platform/date";
import type { FormattedEmailJob } from "@/lib/modules/identity/constants";
import type { EmailQueueStats } from "@/lib/modules/identity/email-queue";
import {
  cancelEmailJobAction,
  resendEmailJobAction,
  retryEmailJobAction,
} from "@/lib/modules/identity/actions";
import { cn } from "@/lib/utils";

export function DashboardJobsCard({
  stats,
  jobs,
}: {
  stats: EmailQueueStats;
  jobs: FormattedEmailJob[];
}) {
  const router = useRouter();
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [selectedErrorJob, setSelectedErrorJob] = useState<FormattedEmailJob | null>(null);
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
        const res = await retryEmailJobAction(jobId);
        if (res.success) {
          toast.success("Job re-queued for immediate processing");
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

  const handleResend = (jobId: string) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await resendEmailJobAction(jobId);
        if (res.success) {
          toast.success("New job queued for delivery");
          router.refresh();
        } else {
          toast.error(res.error ?? "Failed to resend email job");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error resending email job");
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
                Super Admin
              </Badge>
            </div>
            <CardDescription className="text-xs mt-1">
              Monitor background worker queues, inspect failure reasons, and control transactional delivery tasks.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
              href="/admin/email-queue"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs gap-1")}
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
              <p className="text-[11px] text-muted-foreground mt-0.5">Waiting for pickup</p>
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
                <span>Delivered</span>
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-foreground mt-2">
                {stats.succeeded}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Successfully sent</p>
            </div>

            <div className={cn(
              "rounded-xl p-3 border flex flex-col justify-between transition-colors",
              stats.dead > 0
                ? "bg-rose-50/80 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40"
                : "bg-slate-50/90 dark:bg-muted/40 border-border/40",
            )}>
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className={cn(stats.dead > 0 && "text-rose-700 dark:text-rose-400 font-semibold")}>
                  Failed
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
                  <strong>{stats.dead}</strong> failed job{stats.dead > 1 ? "s" : ""} require attention. Inspect failure errors and trigger retries below.
                </span>
              </div>
              <Link
                href="/admin/email-queue?status=DEAD"
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
                              <CheckCircle2 className="size-2.5" /> Sent
                            </Badge>
                          )}
                          {job.status === "DEAD" && (
                            <Badge variant="outline" className="border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 gap-1 text-[10px] py-0">
                              <AlertCircle className="size-2.5" /> Failed
                            </Badge>
                          )}

                          <span className="text-[11px] text-muted-foreground">
                            Attempt {job.attempts}/{job.maxAttempts}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground text-[11px] truncate">
                          <span className="text-foreground font-medium truncate">
                            {job.recipient}
                          </span>
                          <span>&middot;</span>
                          <span className="truncate">{job.subject}</span>
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
                              <Eye className="size-3 mr-1" /> View
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Action Controls for Super Admin */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        {job.status === "DEAD" && (
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

                        {job.status === "SUCCEEDED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResend(job.id)}
                            disabled={isJobPending || isPending}
                            className="h-7 text-xs gap-1 px-2.5"
                          >
                            {isJobPending ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Send className="size-3" />
                            )}
                            Resend
                          </Button>
                        )}

                        {job.status === "PENDING" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancel(job.id)}
                            disabled={isJobPending || isPending}
                            className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10 px-2.5"
                          >
                            {isJobPending ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <XCircle className="size-3" />
                            )}
                            Cancel
                          </Button>
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

      {/* Error Inspection Dialog */}
      <AlertDialog
        open={selectedErrorJob != null}
        onOpenChange={(open) => !open && setSelectedErrorJob(null)}
      >
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <AlertCircle className="size-5" />
              Job Execution Error
            </AlertDialogTitle>
            <AlertDialogDescription>
              Inspection details for failed job <span className="font-mono text-foreground font-semibold">{selectedErrorJob?.id}</span> ({selectedErrorJob?.typeLabel}).
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5">
              <div>
                <span className="text-muted-foreground">Recipient:</span>{" "}
                <strong className="text-foreground">{selectedErrorJob?.recipient}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Attempts:</span>{" "}
                <strong className="text-foreground">
                  {selectedErrorJob?.attempts} of {selectedErrorJob?.maxAttempts}
                </strong>
              </div>
            </div>

            <div>
              <span className="font-semibold text-foreground mb-1 block">Failure Details:</span>
              <pre className="rounded-lg bg-muted p-3 font-mono text-[11px] text-foreground overflow-x-auto whitespace-pre-wrap max-h-56 leading-relaxed border border-border/60">
                {selectedErrorJob?.lastError || "No detailed error message captured."}
              </pre>
            </div>
          </div>

          <AlertDialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <AlertDialogCancel>Close</AlertDialogCancel>
            {selectedErrorJob && (
              <AlertDialogAction
                onClick={() => {
                  const id = selectedErrorJob.id;
                  setSelectedErrorJob(null);
                  handleRetry(id);
                }}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1.5"
              >
                <RotateCw className="size-3.5" />
                Retry Job Now
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
