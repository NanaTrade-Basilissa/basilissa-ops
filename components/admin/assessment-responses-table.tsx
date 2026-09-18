"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Loader2, RotateCw, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { AssessmentFormState, InviteState } from "@/lib/modules/assessments/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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

export type AssessmentInvitationRow = {
  id: string;
  employeeId: string | null;
  inviteeName: string;
  inviteeEmail: string | null;
  expiresAt: Date | null;
  openedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  response: {
    id: string;
    submittedAt: Date | null;
    scoredPoints: number | null;
    maxPoints: number | null;
    identityMismatch: boolean;
    declaredName: string | null;
  } | null;
};

function progressOf(invitation: AssessmentInvitationRow): {
  label: string;
  tone: "done" | "open" | "idle";
} {
  if (invitation.revokedAt) return { label: "withdrawn", tone: "idle" };
  if (invitation.response?.submittedAt) return { label: "completed", tone: "done" };
  if (invitation.openedAt) return { label: "started", tone: "open" };
  if (invitation.expiresAt && invitation.expiresAt <= new Date()) return { label: "expired", tone: "idle" };
  return { label: "not started", tone: "idle" };
}

export function AssessmentResponsesTable({
  assessmentId,
  canWrite,
  invitations,
  resendAction,
  revokeAction,
}: {
  assessmentId: string;
  canWrite: boolean;
  invitations: AssessmentInvitationRow[];
  resendAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  revokeAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
}) {
  const [resendState, resend, resending] = useActionState<InviteState, FormData>(resendAction, undefined);
  const [revokeState, revoke, revoking] = useActionState<AssessmentFormState, FormData>(revokeAction, undefined);
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
                ? "Emailed to participant automatically. The previous link has been invalidated."
                : "The previous link has been withdrawn. Send this replacement link to the participant:"}
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
            <EmptyTitle>No participant responses yet</EmptyTitle>
            <EmptyDescription className="text-xs">
              Invite staff via email or share the public assessment link to collect responses.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
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
                const response = invitation.response;
                const isFinished = !!response?.submittedAt;
                const isRevoked = !!invitation.revokedAt;
                const canModify = canWrite && !isFinished && !isRevoked;

                return (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground">{invitation.inviteeName}</span>
                          {response?.identityMismatch && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              name mismatch: &ldquo;{response.declaredName}&rdquo;
                            </Badge>
                          )}
                        </div>
                        {invitation.inviteeEmail && (
                          <p className="text-xs text-muted-foreground">{invitation.inviteeEmail}</p>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={progress.tone === "done" ? "default" : "outline"}
                        className="text-xs capitalize"
                      >
                        {progress.label}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {isFinished && (response.maxPoints ?? 0) > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold">
                            {response.scoredPoints}/{response.maxPoints}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            ({Math.round((response.scoredPoints! / response.maxPoints!) * 100)}%)
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
                      {response?.submittedAt ? formatAccraDateTime(response.submittedAt) : "-"}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isFinished && (
                          <Link
                            href={`/admin/assessments/${assessmentId}/responses/${response.id}`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            <span>Answers</span>
                            <ExternalLink className="size-3.5" />
                          </Link>
                        )}

                        {canModify && (
                          <>
                            <form action={resend}>
                              <input type="hidden" name="invitationId" value={invitation.id} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                disabled={resending}
                                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                title="Issues a fresh link"
                              >
                                {resending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                                Resend
                              </Button>
                            </form>

                            <AlertDialog>
                              <AlertDialogTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={revoking}
                                    className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  >
                                    <X className="size-3.5" />
                                    Withdraw
                                  </Button>
                                }
                              />
                              <AlertDialogContent size="sm">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Withdraw invitation?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs">
                                    This will immediately revoke access for{" "}
                                    <strong>{invitation.inviteeName}</strong>.
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
                          </>
                        )}
                      </div>
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
