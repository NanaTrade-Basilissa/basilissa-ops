"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, Send, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import type { BulkInviteState, InviteState } from "@/lib/modules/assessments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AssessmentInviteDialog({
  employees,
  invitations,
  inviteAction,
  inviteManyAction,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  employees: { id: string; label: string }[];
  invitations: { employeeId: string | null; revokedAt: Date | null; response: { submittedAt: Date | null } | null }[];
  inviteAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  inviteManyAction: (prev: BulkInviteState, formData: FormData) => Promise<BulkInviteState>;
  trigger?: React.ReactElement | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const [who, setWho] = useState<"employee" | "many" | "other">("employee");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const [inviteState, invite, inviting] = useActionState<InviteState, FormData>(inviteAction, undefined);
  const [bulkState, inviteMany, invitingMany] = useActionState<BulkInviteState, FormData>(inviteManyAction, undefined);

  // Live links that have not been completed or revoked
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

  useEffect(() => {
    if (inviteState?.link) {
      if (inviteState.link.emailed) {
        toast.success(`Invitation emailed to ${inviteState.link.name}`);
      } else {
        toast.info(`Link created for ${inviteState.link.name}. Copy and share it below.`);
      }
    } else if (inviteState?.error) {
      toast.error(inviteState.error);
    }
  }, [inviteState]);

  useEffect(() => {
    if (bulkState?.summary) {
      const { invited, emailed, failures } = bulkState.summary;
      if (failures.length > 0) {
        toast.warning(`Sent ${invited} invitations (${failures.length} failed)`);
      } else {
        toast.success(`Sent to ${invited} staff members (${emailed} emailed)`);
      }
    } else if (bulkState?.error) {
      toast.error(bulkState.error);
    }
  }, [bulkState]);

  const link = inviteState?.link;

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invitation link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button size="sm" className="gap-1.5 h-9">
                <UserPlus className="size-4" />
                Invite someone
              </Button>
            )
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Invite to assessment
          </DialogTitle>
          <DialogDescription>
            Send personal, single-use assessment links to employees or external candidates.
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="flex rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setWho("employee")}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
              who === "employee"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Staff member
          </button>
          <button
            type="button"
            onClick={() => setWho("many")}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
              who === "many"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Multiple staff
          </button>
          <button
            type="button"
            onClick={() => setWho("other")}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
              who === "other"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            External person
          </button>
        </div>

        {/* Link Alert */}
        {link && (
          <Alert>
            <AlertTitle>Link generated for {link.name}</AlertTitle>
            <AlertDescription className="space-y-2 pt-1 text-xs">
              <p>
                {link.emailed
                  ? "Emailed to them automatically."
                  : "Email sending is not configured (or not on file). Send this link yourself:"}
              </p>
              <div className="flex items-center gap-2 w-full min-w-0">
                <code className="flex-1 min-w-0 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">
                  {link.url}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1 text-xs"
                  onClick={() => copyLink(link.url)}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {link.expiresAt
                  ? `Expires: ${new Date(link.expiresAt).toLocaleString("en-GB")}. Single-use only.`
                  : "Does not expire until submitted or withdrawn. Single-use only."}
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Bulk Summary Alert */}
        {bulkState?.summary && (
          <Alert>
            <Users className="size-4" />
            <AlertTitle>
              Invitations sent ({bulkState.summary.invited})
            </AlertTitle>
            <AlertDescription className="space-y-1 text-xs">
              <p>{bulkState.summary.emailed} emailed automatically.</p>
              {bulkState.summary.failures.length > 0 && (
                <p className="text-destructive">
                  Failures: {bulkState.summary.failures.map((f) => `${f.name} (${f.message})`).join("; ")}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {(inviteState?.error || bulkState?.error) && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">
              {inviteState?.error ?? bulkState?.error}
            </AlertDescription>
          </Alert>
        )}

        {who === "many" ? (
          <form action={inviteMany} className="space-y-4 w-full min-w-0">
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active employees found.{" "}
                <Link href="/admin/employees" className="underline underline-offset-4 text-primary">
                  Add employees
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Select staff members</Label>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-primary hover:underline underline-offset-4"
                  >
                    {selected.size === employees.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {employees.map((employee) => (
                    <label
                      key={employee.id}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        name="employeeId"
                        value={employee.id}
                        checked={selected.has(employee.id)}
                        onChange={() => toggle(employee.id)}
                        className="size-4 shrink-0 accent-primary rounded"
                      />
                      <span className="font-medium text-foreground">{employee.label}</span>
                      {alreadyInvited.has(employee.id) && (
                        <Badge variant="outline" className="ml-auto text-[10px] py-0">
                          already sent
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-9 gap-1.5"
                    disabled={invitingMany || selected.size === 0}
                  >
                    {invitingMany ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Users className="size-4" />
                    )}
                    {selected.size > 0 ? `Send to ${selected.size}` : "Send invitations"}
                  </Button>
                </div>
              </>
            )}
          </form>
        ) : (
          <form action={invite} className="space-y-4 w-full min-w-0">
            {who === "employee" ? (
              <div className="space-y-1.5">
                <Label htmlFor="assessmentEmployeeId">Staff member</Label>
                {employees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active employees yet.{" "}
                    <Link href="/admin/employees" className="underline underline-offset-4 text-primary">
                      Add an employee
                    </Link>
                    , or send to somebody without a record.
                  </p>
                ) : (
                  <NativeSelect
                    id="assessmentEmployeeId"
                    name="employeeId"
                    defaultValue=""
                    className="h-9"
                    required
                  >
                    <option value="" disabled>
                      Select an employee…
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
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="externalName">Candidate / Person name</Label>
                  <Input
                    id="externalName"
                    name="name"
                    placeholder="e.g. Ama Mensah"
                    required
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="externalEmail">
                    Email address <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="externalEmail"
                    name="email"
                    type="email"
                    placeholder="ama@example.com"
                    className="h-9"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
              <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={inviting}>
                {inviting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Create invitation
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
