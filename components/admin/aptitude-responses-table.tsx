"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Loader2, RotateCw, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { AptitudeFormState, InviteState } from "@/lib/modules/aptitude/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

export type AptitudeInvitationRow = {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  expiresAt: Date | null;
  openedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  attempt: {
    id: string;
    submittedAt: Date | null;
    scoredPoints: number | null;
    maxPoints: number | null;
    identityMismatch: boolean;
    declaredName: string | null;
    autoSubmitted: boolean;
  } | null;
};

function progressOf(invitation: AptitudeInvitationRow): {
  label: string;
  tone: "done" | "open" | "idle" | "timeout";
} {
  if (invitation.revokedAt) return { label: "withdrawn", tone: "idle" };
  if (invitation.attempt?.submittedAt) {
    return invitation.attempt.autoSubmitted
      ? { label: "timed out", tone: "timeout" }
      : { label: "completed", tone: "done" };
  }
  if (invitation.openedAt) return { label: "started", tone: "open" };
  if (invitation.expiresAt && invitation.expiresAt <= new Date()) return { label: "expired", tone: "idle" };
  return { label: "not started", tone: "idle" };
}

export function AptitudeResponsesTable({
  testId,
  canWrite,
  invitations,
  resendAction,
  revokeAction,
}: {
  testId: string;
  canWrite: boolean;
  invitations: AptitudeInvitationRow[];
  resendAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  revokeAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
}) {
  const [resendState, resend, resending] = useActionState<InviteState, FormData>(resendAction, undefined);
  const [revokeState, revoke, revoking] = useActionState<AptitudeFormState, FormData>(revokeAction, undefined);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (resendState?.link) {
      if (resendState.link.emailed) {
        toast.success(`New link emailed to ${resendState.link.name}`);
      } else {
        toast.info(`New link generated for ${resendState.link.name}`);
      }
    } else if (resendState?.error) {
      toast.error(resendState.error);
    }
  }, [resendState]);

  useEffect(() => {
    if (revokeState?.saved) {
      toast.success("Invitation link withdrawn");
    } else if (revokeState?.error) {
      toast.error(revokeState.error);
    }
  }, [revokeState]);

  const resentLink = resendState?.link;

  async function copyResentLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }

  return (
    <div className="space-y-4">
      {/* Newly resent link banner */}
      {resentLink && (
        <Alert>
          <AlertTitle className="text-sm">New link for {resentLink.name}</AlertTitle>
          <AlertDescription className="space-y-2 pt-1 text-xs">
            <p>
              {resentLink.emailed
                ? "Emailed to candidate automatically. The previous link has been invalidated."
                : "The previous link has been withdrawn. Send this replacement link to the candidate:"}
            </p>
            <div className="flex items-center gap-2 w-full min-w-0">
              <code className="flex-1 min-w-0 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">
                {resentLink.url}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1 text-xs"
                onClick={() => copyResentLink(resentLink.url)}
              >
                {copiedLink ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copiedLink ? "Copied" : "Copy"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {invitations.length === 0 ? (
        <Empty className="border-0 py-8">
          <EmptyMedia variant="icon">
            <Users className="size-5" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No candidate responses yet</EmptyTitle>
            <EmptyDescription className="text-xs">
              Invite candidates via email or share the public test link to collect responses.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Invited</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => {
                const progress = progressOf(invitation);
                const attempt = invitation.attempt;
                const isFinished = !!attempt?.submittedAt;
                const isRevoked = !!invitation.revokedAt;
                const canModify = canWrite && !isFinished && !isRevoked;

                return (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          {isFinished ? (
                            <Link
                              href={`/admin/aptitude-tests/${testId}/attempts/${attempt.id}`}
                              className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              {invitation.candidateName}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{invitation.candidateName}</span>
                          )}
                          {attempt?.identityMismatch && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              name mismatch: &ldquo;{attempt.declaredName}&rdquo;
                            </Badge>
                          )}
                        </div>
                        {invitation.candidateEmail && (
                          <p className="text-xs text-muted-foreground">{invitation.candidateEmail}</p>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          progress.tone === "done"
                            ? "default"
                            : progress.tone === "timeout"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-xs capitalize"
                      >
                        {progress.label}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {isFinished && (attempt.maxPoints ?? 0) > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold">
                            {attempt.scoredPoints}/{attempt.maxPoints}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            ({Math.round((attempt.scoredPoints! / attempt.maxPoints!) * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {formatAccraDateTime(invitation.createdAt)}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {attempt?.submittedAt ? formatAccraDateTime(attempt.submittedAt) : "-"}
                    </TableCell>

                    <TableCell className="text-right">
                      <TableRowActions
                        actions={[
                          isFinished && {
                            id: "answers",
                            label: "View answers",
                            href: `/admin/aptitude-tests/${testId}/attempts/${attempt.id}`,
                            icon: ExternalLink,
                          },
                          canModify && {
                            id: "resend",
                            label: "Resend link",
                            icon: RotateCw,
                            disabled: resending,
                            onClick: () => {
                              const fd = new FormData();
                              fd.append("invitationId", invitation.id);
                              resend(fd);
                            },
                          },
                          canModify && {
                            id: "withdraw",
                            label: "Withdraw link",
                            icon: X,
                            variant: "destructive",
                            dialog: (props) => (
                              <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
                                <AlertDialogContent size="sm">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Withdraw invitation?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-xs">
                                      This will immediately revoke access for{" "}
                                      <strong>{invitation.candidateName}</strong>.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <form action={revoke}>
                                      <input type="hidden" name="invitationId" value={invitation.id} />
                                      <AlertDialogAction
                                        type="submit"
                                        variant="destructive"
                                        disabled={revoking}
                                      >
                                        {revoking ? <Loader2 className="size-4 animate-spin" /> : "Withdraw link"}
                                      </AlertDialogAction>
                                    </form>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
