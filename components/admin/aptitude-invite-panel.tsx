"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Loader2, RotateCw, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { AptitudeFormState, InviteState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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

export type AptitudeInvitation = {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  expiresAt: Date | null;
  openedAt: Date | null;
  revokedAt: Date | null;
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

function progressOf(invitation: AptitudeInvitation): { label: string; tone: "done" | "open" | "idle" | "timeout" } {
  if (invitation.revokedAt) return { label: "withdrawn", tone: "idle" };
  if (invitation.attempt?.submittedAt) {
    return invitation.attempt.autoSubmitted ? { label: "timed out", tone: "timeout" } : { label: "completed", tone: "done" };
  }
  if (invitation.openedAt) return { label: "started", tone: "open" };
  if (invitation.expiresAt && invitation.expiresAt <= new Date()) return { label: "expired", tone: "idle" };
  return { label: "not started", tone: "idle" };
}

export function AptitudeInvitePanel({
  testId,
  canWrite,
  invitations,
  resendAction,
  revokeAction,
}: {
  testId: string;
  canWrite: boolean;
  invitations: AptitudeInvitation[];
  resendAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  revokeAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  inviteAction?: unknown;
  inviteManyAction?: unknown;
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
          <AlertTitle>New link for {resentLink.name}</AlertTitle>
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
            <p className="text-[11px] text-muted-foreground">
              {resentLink.expiresAt
                ? `Expires: ${new Date(resentLink.expiresAt).toLocaleString("en-GB")}. Single-use only.`
                : "Does not expire until submitted or withdrawn. Single-use only."}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {invitations.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyMedia variant="icon">
            <Users className="size-5" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No invitations yet</EmptyTitle>
            <EmptyDescription>
              Invite candidates via email or share the public test link to collect responses.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {canWrite && (
            <p className="text-xs text-muted-foreground">
              Resending issues a brand new link and immediately revokes the old one.
            </p>
          )}

          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {invitations.map((invitation) => {
              const progress = progressOf(invitation);
              const attempt = invitation.attempt;
              const isFinished = !!attempt?.submittedAt;
              const isRevoked = !!invitation.revokedAt;
              const canModify = canWrite && !isFinished && !isRevoked;

              return (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm hover:bg-muted/20 transition-colors"
                >
                  <div className="space-y-0.5 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{invitation.candidateName}</span>
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
                    </div>
                    {invitation.candidateEmail && (
                      <p className="text-xs text-muted-foreground">{invitation.candidateEmail}</p>
                    )}
                  </div>

                  {/* Score & Mismatch flags */}
                  <div className="flex flex-wrap items-center gap-2">
                    {isFinished && (attempt.maxPoints ?? 0) > 0 && (
                      <span className="font-mono text-xs font-semibold text-foreground bg-muted px-2 py-0.5 rounded">
                        {attempt.scoredPoints}/{attempt.maxPoints} (
                        {Math.round((attempt.scoredPoints! / attempt.maxPoints!) * 100)}%)
                      </span>
                    )}

                    {attempt?.identityMismatch && (
                      <Badge variant="destructive" className="text-xs">
                        typed &ldquo;{attempt.declaredName}&rdquo;
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    {isFinished && (
                      <Link
                        href={`/admin/aptitude-tests/${testId}/attempts/${attempt.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4 px-2 py-1"
                      >
                        See answers
                        <ExternalLink className="size-3" />
                      </Link>
                    )}

                    {canModify && (
                      <form action={resend}>
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={resending}
                          className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                          title="Sends a new link and invalidates the old one"
                        >
                          {resending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                          Resend
                        </Button>
                      </form>
                    )}

                    {canModify && (
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
                            <AlertDialogDescription>
                              This will immediately revoke access for{" "}
                              <strong>{invitation.candidateName}</strong>. Their test link will no longer work.
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
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
