"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Copy, Loader2, RotateCw, Send, Users, X } from "lucide-react";
import type { AptitudeFormState, BulkInviteState, InviteState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Invitation = {
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

function progressOf(invitation: Invitation): { label: string; tone: "done" | "open" | "idle" | "timeout" } {
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
  inviteAction,
  inviteManyAction,
  resendAction,
  revokeAction,
}: {
  testId: string;
  canWrite: boolean;
  invitations: Invitation[];
  inviteAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  inviteManyAction: (prev: BulkInviteState, formData: FormData) => Promise<BulkInviteState>;
  resendAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  revokeAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
}) {
  const [inviteState, invite, inviting] = useActionState<InviteState, FormData>(inviteAction, undefined);
  const [bulkState, inviteMany, invitingMany] = useActionState<BulkInviteState, FormData>(inviteManyAction, undefined);
  const [resendState, resend, resending] = useActionState<InviteState, FormData>(resendAction, undefined);
  const [revokeState, revoke, revoking] = useActionState<AptitudeFormState, FormData>(revokeAction, undefined);
  const [mode, setMode] = useState<"one" | "many">("one");

  const link = resendState?.link ?? inviteState?.link;

  return (
    <div className="space-y-5">
      {link && (
        <Alert>
          <AlertTitle>Link for {link.name}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {link.emailed
                ? "Emailed to them just now. "
                : "Email is not set up (or none is on file), so send this yourself. "}
              It works once, is tied to them alone, and{" "}
              {link.expiresAt
                ? `expires ${new Date(link.expiresAt).toLocaleString("en-GB")}.`
                : "does not expire — only submitting it (or withdrawing it) ends it."}
            </p>
            <code className="block overflow-x-auto rounded-md bg-background p-2 text-xs">{link.url}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link.url)}>
              <Copy className="size-4" /> Copy link
            </Button>
            <p className="text-xs">Shown once. It is not stored anywhere it can be looked up again.</p>
          </AlertDescription>
        </Alert>
      )}

      {(inviteState?.error || bulkState?.error || resendState?.error || revokeState?.error) && (
        <Alert variant="destructive">
          <AlertDescription>
            {inviteState?.error ?? bulkState?.error ?? resendState?.error ?? revokeState?.error}
          </AlertDescription>
        </Alert>
      )}

      {bulkState?.summary && (
        <Alert>
          <Users className="size-4" />
          <AlertTitle>
            Sent to {bulkState.summary.invited} {bulkState.summary.invited === 1 ? "person" : "people"}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            <p>
              {bulkState.summary.emailed} emailed automatically
              {bulkState.summary.invited > bulkState.summary.emailed &&
                `; the rest have no address on file or email is not set up, so send those links yourself from the list below`}
              .
            </p>
            {bulkState.summary.failures.length > 0 && (
              <p className="text-destructive">
                Could not invite: {bulkState.summary.failures.map((f) => `${f.name} (${f.message})`).join("; ")}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {canWrite && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="mode">Send by email</Label>
            <NativeSelect
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "one" | "many")}
              className="max-w-xs"
            >
              <option value="one">One candidate</option>
              <option value="many">Several at once</option>
            </NativeSelect>
          </div>

          {mode === "one" ? (
            <form action={invite} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Their name</Label>
                  <Input id="name" name="name" placeholder="Ama Mensah" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={inviting}>
                {inviting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send invitation
              </Button>
            </form>
          ) : (
            <form action={inviteMany} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="candidates">Candidates, one per line</Label>
                <Textarea
                  id="candidates"
                  name="candidates"
                  rows={5}
                  placeholder={"Ama Mensah <ama@example.com>\nkwesi@example.com"}
                  aria-describedby="candidates-hint"
                />
                <p id="candidates-hint" className="text-xs text-muted-foreground">
                  A name is optional. Accepts &ldquo;Name &lt;email&gt;&rdquo;, &ldquo;Name, email&rdquo;, or a bare
                  email per line.
                </p>
              </div>
              <Button type="submit" size="sm" disabled={invitingMany}>
                {invitingMany ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
                Send to all
              </Button>
            </form>
          )}
        </div>
      )}

      {invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has been sent this yet.</p>
      ) : (
        <>
          {canWrite && (
            <p className="text-xs text-muted-foreground">
              Resend sends a new link and withdraws the old one. The two are not the same link.
            </p>
          )}
          <ul className="space-y-1.5 text-sm">
            {invitations.map((invitation) => {
              const progress = progressOf(invitation);
              const attempt = invitation.attempt;

              return (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2.5"
                >
                  <span className="font-medium">{invitation.candidateName}</span>
                  <Badge
                    variant={progress.tone === "done" ? "default" : progress.tone === "timeout" ? "destructive" : "outline"}
                    className="text-xs"
                  >
                    {progress.label}
                  </Badge>

                  {attempt?.submittedAt && (attempt.maxPoints ?? 0) > 0 && (
                    <span className="text-muted-foreground">
                      {attempt.scoredPoints}/{attempt.maxPoints} · {Math.round((attempt.scoredPoints! / attempt.maxPoints!) * 100)}%
                    </span>
                  )}

                  {attempt?.identityMismatch && (
                    <Badge variant="destructive" className="text-xs">
                      typed &ldquo;{attempt.declaredName}&rdquo;
                    </Badge>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    {attempt?.submittedAt && (
                      <Link
                        href={`/admin/aptitude-tests/${testId}/attempts/${attempt.id}`}
                        className="text-xs underline underline-offset-4"
                      >
                        See answers
                      </Link>
                    )}
                    {canWrite && !attempt?.submittedAt && !invitation.revokedAt && (
                      <form action={resend}>
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={resending}
                          title="Sends a new link and withdraws this one"
                        >
                          {resending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />} Resend
                        </Button>
                      </form>
                    )}
                    {canWrite && !attempt?.submittedAt && !invitation.revokedAt && (
                      <form action={revoke}>
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <Button type="submit" variant="ghost" size="sm" disabled={revoking}>
                          <X className="size-4" /> Withdraw
                        </Button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
