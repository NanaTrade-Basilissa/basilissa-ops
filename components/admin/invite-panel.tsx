"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Loader2, RotateCw, Send, Users, X } from "lucide-react";
import type { AssessmentFormState, BulkInviteState, InviteState } from "@/lib/modules/assessments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Invitation = {
  id: string;
  employeeId: string | null;
  inviteeName: string;
  inviteeEmail: string | null;
  /** Null means it never expires on its own — see `Assessment.invitationsExpire`. */
  expiresAt: Date | null;
  openedAt: Date | null;
  revokedAt: Date | null;
  response: {
    id: string;
    submittedAt: Date | null;
    scoredPoints: number | null;
    maxPoints: number | null;
    identityMismatch: boolean;
    declaredName: string | null;
  } | null;
};

function progressOf(invitation: Invitation): { label: string; tone: "done" | "open" | "idle" } {
  if (invitation.revokedAt) return { label: "withdrawn", tone: "idle" };
  if (invitation.response?.submittedAt) return { label: "completed", tone: "done" };
  if (invitation.openedAt) return { label: "started", tone: "open" };
  if (invitation.expiresAt && invitation.expiresAt <= new Date()) return { label: "expired", tone: "idle" };
  return { label: "not started", tone: "idle" };
}

export function InvitePanel({
  assessmentId,
  canWrite,
  employees,
  invitations,
  inviteAction,
  inviteManyAction,
  resendAction,
  revokeAction,
}: {
  assessmentId: string;
  canWrite: boolean;
  employees: { id: string; label: string }[];
  invitations: Invitation[];
  inviteAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  inviteManyAction: (prev: BulkInviteState, formData: FormData) => Promise<BulkInviteState>;
  resendAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  revokeAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
}) {
  const [inviteState, invite, inviting] = useActionState<InviteState, FormData>(
    inviteAction,
    undefined,
  );
  const [bulkState, inviteMany, invitingMany] = useActionState<BulkInviteState, FormData>(
    inviteManyAction,
    undefined,
  );
  const [resendState, resend, resending] = useActionState<InviteState, FormData>(
    resendAction,
    undefined,
  );
  const [revokeState, revoke, revoking] = useActionState<AssessmentFormState, FormData>(
    revokeAction,
    undefined,
  );
  const [who, setWho] = useState<"employee" | "many" | "other">("employee");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Whichever of the two forms produced it most recently. Both feed the same
  // alert, since a resend and a fresh invitation show the same thing: one link.
  const link = resendState?.link ?? inviteState?.link;

  // Anyone with a link that is still live — not withdrawn, not already sat —
  // shown as a hint in the bulk list rather than a block. Sending it again is
  // a choice HR might genuinely want to make, not a mistake to prevent.
  const alreadyInvited = useMemo(() => {
    const ids = new Set<string>();
    for (const invitation of invitations) {
      if (invitation.employeeId && !invitation.revokedAt && !invitation.response?.submittedAt) {
        ids.add(invitation.employeeId);
      }
    }
    return ids;
  }, [invitations]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === employees.length ? new Set() : new Set(employees.map((e) => e.id))));
  }

  return (
    <div className="space-y-5">
      {/*
        The link is shown once and never stored anywhere readable — only its
        hash is kept, exactly as with password resets. If HR loses it before
        sending it, the answer is a new invitation, not a lookup.
      */}
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
            <code className="block overflow-x-auto rounded-md bg-background p-2 text-xs">
              {link.url}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(link.url)}
            >
              <Copy className="size-4" /> Copy link
            </Button>
            <p className="text-xs">
              Shown once. It is not stored anywhere it can be looked up again.
            </p>
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
            <Label htmlFor="who">Send to</Label>
            <NativeSelect
              id="who"
              value={who}
              onChange={(e) => setWho(e.target.value as "employee" | "many" | "other")}
              className="max-w-xs"
            >
              <option value="employee">A member of staff</option>
              <option value="many">Several members of staff at once</option>
              <option value="other">Somebody without an employee record</option>
            </NativeSelect>
          </div>

          {who === "many" ? (
            <form action={inviteMany} className="space-y-3">
              {employees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active employees yet.{" "}
                  <Link href="/admin/employees" className="underline underline-offset-4">
                    Add one
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Who</Label>
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-xs text-muted-foreground underline underline-offset-4"
                    >
                      {selected.size === employees.length ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {employees.map((employee) => (
                      <label
                        key={employee.id}
                        className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          name="employeeId"
                          value={employee.id}
                          checked={selected.has(employee.id)}
                          onChange={() => toggle(employee.id)}
                          className="size-4 shrink-0 accent-primary"
                        />
                        {employee.label}
                        {alreadyInvited.has(employee.id) && (
                          <Badge variant="outline" className="text-xs">
                            already sent
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>
                  <Button type="submit" size="sm" disabled={invitingMany || selected.size === 0}>
                    {invitingMany ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Users className="size-4" />
                    )}
                    {selected.size > 0 ? `Send to ${selected.size}` : "Send"}
                  </Button>
                </>
              )}
            </form>
          ) : (
            <form action={invite} className="space-y-3">
              {who === "employee" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="employeeId">Employee</Label>
                  {employees.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active employees yet.{" "}
                      <Link href="/admin/employees" className="underline underline-offset-4">
                        Add one
                      </Link>
                      , or send to somebody without a record.
                    </p>
                  ) : (
                    <NativeSelect id="employeeId" name="employeeId" defaultValue="" className="max-w-sm">
                      <option value="" disabled>
                        Choose…
                      </option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Their name</Label>
                    <Input id="name" name="name" placeholder="Ama Mensah" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">
                      Email <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input id="email" name="email" type="email" />
                  </div>
                </div>
              )}

              <Button type="submit" size="sm" disabled={inviting}>
                {inviting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Create a link
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
            const response = invitation.response;

            return (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="font-medium">{invitation.inviteeName}</span>
                <Badge variant={progress.tone === "done" ? "default" : "outline"} className="text-xs">
                  {progress.label}
                </Badge>

                {response?.submittedAt && (response.maxPoints ?? 0) > 0 && (
                  <span className="text-muted-foreground">
                    {response.scoredPoints}/{response.maxPoints} ·{" "}
                    {Math.round((response.scoredPoints! / response.maxPoints!) * 100)}%
                  </span>
                )}

                {/*
                  Flagged, not blocked. A link can be forwarded, and refusing a
                  misspelt name would throw away a real submission — so the
                  system notices and HR decides what it means.
                */}
                {response?.identityMismatch && (
                  <Badge variant="destructive" className="text-xs">
                    typed “{response.declaredName}”
                  </Badge>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {response?.submittedAt && (
                    <Link
                      href={`/admin/assessments/${assessmentId}/responses/${response.id}`}
                      className="text-xs underline underline-offset-4"
                    >
                      See answers
                    </Link>
                  )}
                  {canWrite && !response?.submittedAt && !invitation.revokedAt && (
                    <form action={resend}>
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        disabled={resending}
                        title="Sends a new link and withdraws this one"
                      >
                        {resending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCw className="size-4" />
                        )}{" "}
                        Resend
                      </Button>
                    </form>
                  )}
                  {canWrite && !response?.submittedAt && !invitation.revokedAt && (
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
