"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Laptop,
  Loader2,
  Mail,
  RotateCw,
  Send,
  Smartphone,
  UserCheck,
  XCircle,
} from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { FormattedEmailJob } from "@/lib/modules/identity/constants";
import {
  cancelEmailJobAction,
  getEmailJobInspectionAction,
  resendEmailJobAction,
  retryEmailJobAction,
  type EmailJobInspectionDetail,
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
  const [selectedEmailJob, setSelectedEmailJob] = useState<FormattedEmailJob | null>(null);
  const [inspectionDetail, setInspectionDetail] = useState<EmailJobInspectionDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [editRecipientOpen, setEditRecipientOpen] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleOpenJob = (job: FormattedEmailJob) => {
    setSelectedEmailJob(job);
    setEditRecipientOpen(false);
    setIsLoadingDetail(true);
    getEmailJobInspectionAction(job.id)
      .then((res) => {
        if (res.success && res.data) {
          setInspectionDetail(res.data);
          setRecipientInput(res.data.recipient || "");
        } else {
          toast.error(res.error ?? "Failed to load email preview");
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Error fetching email details");
      })
      .finally(() => {
        setIsLoadingDetail(false);
      });
  };

  const handleRetry = (jobId: string) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await retryEmailJobAction(jobId);
        if (res.success) {
          toast.success("Job triggered for immediate delivery");
          if (selectedEmailJob?.id === jobId) {
            const updated = await getEmailJobInspectionAction(jobId);
            if (updated.success && updated.data) setInspectionDetail(updated.data);
          }
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

  const handleResend = (
    jobId: string,
    options?: { overrideRecipient?: string; sendImmediately?: boolean },
  ) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const res = await resendEmailJobAction(jobId, options);
        if (res.success) {
          toast.success(
            options?.sendImmediately
              ? "Email sent immediately"
              : "New email job queued for delivery",
          );
          setEditRecipientOpen(false);
          if (selectedEmailJob?.id === jobId) {
            const updated = await getEmailJobInspectionAction(jobId);
            if (updated.success && updated.data) setInspectionDetail(updated.data);
          }
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
          if (selectedEmailJob?.id === jobId) {
            const updated = await getEmailJobInspectionAction(jobId);
            if (updated.success && updated.data) setInspectionDetail(updated.data);
          }
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedErrorJob(row.original);
                  }}
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
                  {
                    id: "preview",
                    label: "Inspect email & template",
                    icon: Mail,
                    onClick: () => handleOpenJob(job),
                  },
                  Boolean(job.lastError) && {
                    id: "error",
                    label: "Error details",
                    icon: AlertCircle,
                    onClick: () => setSelectedErrorJob(job),
                  },
                  canManage &&
                    job.status === "DEAD" && {
                      id: "retry",
                      label: "Retry email now",
                      icon: RotateCw,
                      disabled: isLoading,
                      onClick: () => handleRetry(job.id),
                    },
                  canManage &&
                    job.status === "SUCCEEDED" && {
                      id: "resend",
                      label: "Resend email",
                      icon: Send,
                      disabled: isLoading,
                      onClick: () => handleResend(job.id, { sendImmediately: true }),
                    },
                  canManage &&
                    job.status === "PENDING" && {
                      id: "send-now",
                      label: "Send now",
                      icon: RotateCw,
                      disabled: isLoading,
                      onClick: () => handleRetry(job.id),
                    },
                  canManage &&
                    job.status === "PENDING" && {
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
      <DataTable
        columns={columns}
        data={jobs}
        onRowClick={(row) => handleOpenJob(row)}
        emptyMessage="No email jobs match this filter."
      />

      {/* Rich Email Inspection Modal */}
      <Dialog
        open={selectedEmailJob !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEmailJob(null);
            setInspectionDetail(null);
            setEditRecipientOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-3 border-b shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                  <Mail className="size-5 text-primary shrink-0" />
                  <span className="truncate max-w-lg">
                    {inspectionDetail?.subject || selectedEmailJob?.subject || "Email Details"}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs flex flex-wrap items-center gap-2">
                  <span>Job ID:</span>
                  <code className="font-mono text-xs text-foreground font-semibold bg-muted px-1.5 py-0.5 rounded">
                    {selectedEmailJob?.id}
                  </code>
                  <span>· Type:</span>
                  <Badge variant="outline" className="text-xs">
                    {selectedEmailJob?.typeLabel}
                  </Badge>
                  <span>· Status:</span>
                  <Badge
                    variant={
                      selectedEmailJob?.status === "SUCCEEDED"
                        ? "default"
                        : selectedEmailJob?.status === "DEAD"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-xs"
                  >
                    {selectedEmailJob?.status}
                  </Badge>
                </DialogDescription>
              </div>

              {/* Header Direct Actions */}
              {canManage && selectedEmailJob && (
                <div className="flex items-center gap-2">
                  {selectedEmailJob.status === "PENDING" && (
                    <Button
                      size="sm"
                      onClick={() => handleRetry(selectedEmailJob.id)}
                      disabled={isPending && pendingJobId === selectedEmailJob.id}
                      className="gap-1.5 text-xs h-8"
                    >
                      <RotateCw className="size-3.5" />
                      Send Now
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditRecipientOpen((v) => !v)}
                    className="gap-1.5 text-xs h-8"
                  >
                    <Mail className="size-3.5" />
                    Edit Recipient & Resend
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => handleResend(selectedEmailJob.id, { sendImmediately: true })}
                    disabled={isPending && pendingJobId === selectedEmailJob.id}
                    className="gap-1.5 text-xs h-8"
                  >
                    <Send className="size-3.5" />
                    Resend Now
                  </Button>
                </div>
              )}
            </div>

            {/* Recipient update form */}
            {editRecipientOpen && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg border flex flex-wrap items-center gap-2 text-xs">
                <Label htmlFor="override-email" className="font-medium shrink-0">
                  Recipient Email:
                </Label>
                <Input
                  id="override-email"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  placeholder="recipient@example.com"
                  className="h-8 text-xs max-w-sm"
                />
                <Button
                  size="sm"
                  onClick={() =>
                    handleResend(selectedEmailJob!.id, {
                      overrideRecipient: recipientInput,
                      sendImmediately: true,
                    })
                  }
                  disabled={!recipientInput || (isPending && pendingJobId === selectedEmailJob!.id)}
                  className="h-8 text-xs gap-1"
                >
                  <Send className="size-3" />
                  Send to this address
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditRecipientOpen(false)}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </DialogHeader>

          {isLoadingDetail ? (
            <div className="flex flex-col items-center justify-center p-16 space-y-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Rendering email preview & delivery logs...</p>
            </div>
          ) : inspectionDetail ? (
            <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0 pt-3">
              <div className="flex items-center justify-between pb-2">
                <TabsList className="h-8">
                  <TabsTrigger value="preview" className="text-xs gap-1.5">
                    <Mail className="size-3.5" /> Email Preview
                  </TabsTrigger>
                  <TabsTrigger value="recipients" className="text-xs gap-1.5">
                    <UserCheck className="size-3.5" /> Recipients & Delivery (
                    {inspectionDetail.deliveries.length > 0 ? inspectionDetail.deliveries.length : 1})
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="text-xs gap-1.5">
                    <ExternalLink className="size-3.5" /> Technical Logs
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-1 bg-muted p-0.5 rounded border">
                  <Button
                    size="icon"
                    variant={previewDevice === "desktop" ? "default" : "ghost"}
                    className="size-6 text-xs"
                    onClick={() => setPreviewDevice("desktop")}
                    title="Desktop Preview"
                  >
                    <Laptop className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant={previewDevice === "mobile" ? "default" : "ghost"}
                    className="size-6 text-xs"
                    onClick={() => setPreviewDevice("mobile")}
                    title="Mobile Preview"
                  >
                    <Smartphone className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Tab 1: Email HTML Preview */}
              <TabsContent value="preview" className="flex-1 min-h-0 pt-1">
                <div className="h-full flex justify-center bg-slate-100 dark:bg-slate-900 rounded-lg p-3 border overflow-hidden">
                  <div
                    className="h-full transition-all duration-200 bg-white shadow-sm rounded border overflow-hidden"
                    style={{
                      width: previewDevice === "desktop" ? "100%" : "385px",
                    }}
                  >
                    <iframe
                      title="Email Preview"
                      sandbox="allow-same-origin"
                      srcDoc={inspectionDetail.htmlPreview}
                      className="w-full h-full border-0 bg-white"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Recipients & Delivery Status */}
              <TabsContent value="recipients" className="flex-1 overflow-auto space-y-4 pt-2">
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Recipient Delivery Confirmation
                  </h4>

                  {inspectionDetail.deliveries.length > 0 ? (
                    <div className="divide-y rounded-lg border">
                      {inspectionDetail.deliveries.map((del, i) => (
                        <div key={i} className="flex items-center justify-between p-3 text-xs">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-foreground block">{del.recipient}</span>
                            <span className="text-muted-foreground text-[11px]">
                              Confirmed sent at {formatAccraDateTime(del.sentAt)}
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1"
                          >
                            <CheckCircle2 className="size-3" />
                            Delivered
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-muted/40 border text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{inspectionDetail.recipient}</span>
                        <Badge
                          variant={
                            inspectionDetail.status === "SUCCEEDED"
                              ? "outline"
                              : inspectionDetail.status === "DEAD"
                                ? "destructive"
                                : "secondary"
                          }
                          className="gap-1"
                        >
                          {inspectionDetail.status === "SUCCEEDED" ? (
                            <>
                              <CheckCircle2 className="size-3 text-emerald-600" />
                              Delivered via Provider
                            </>
                          ) : inspectionDetail.status === "DEAD" ? (
                            <>
                              <AlertCircle className="size-3" />
                              Failed
                            </>
                          ) : (
                            <>
                              <Clock className="size-3" />
                              {inspectionDetail.status}
                            </>
                          )}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {inspectionDetail.status === "SUCCEEDED"
                          ? "This message was processed successfully by the email gateway."
                          : inspectionDetail.status === "DEAD"
                            ? "Email was rejected by provider or expired without delivery."
                            : "Waiting for worker execution."}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tab 3: Technical Logs & Payload */}
              <TabsContent value="logs" className="flex-1 overflow-auto space-y-4 pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-muted/30 p-3 rounded-lg border">
                  <div>
                    <span className="text-muted-foreground block">Attempts:</span>
                    <span className="font-medium">
                      {inspectionDetail.attempts} / {inspectionDetail.maxAttempts}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Created:</span>
                    <span>{formatAccraDateTime(inspectionDetail.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Scheduled:</span>
                    <span>{formatAccraDateTime(inspectionDetail.runAt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Completed:</span>
                    <span>
                      {inspectionDetail.completedAt
                        ? formatAccraDateTime(inspectionDetail.completedAt)
                        : "Not yet completed"}
                    </span>
                  </div>
                </div>

                {inspectionDetail.lastError && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                      <AlertCircle className="size-3.5" />
                      Recorded Delivery Error:
                    </p>
                    <pre className="max-h-36 overflow-auto rounded-lg bg-slate-950 p-3 text-xs font-mono text-rose-400 border border-border/50 whitespace-pre-wrap break-all">
                      {inspectionDetail.lastError}
                    </pre>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Raw Job Payload:</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs font-mono text-emerald-400 border border-border/50 whitespace-pre-wrap break-all">
                    {JSON.stringify(inspectionDetail.payload, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Error Details Alert Dialog */}
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
