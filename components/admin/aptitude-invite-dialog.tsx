"use client";

import { useActionState, useEffect, useState } from "react";
import { Copy, Check, Loader2, Send, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import type { BulkInviteState, InviteState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AptitudeInviteDialog({
  inviteAction,
  inviteManyAction,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  inviteAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  inviteManyAction: (prev: BulkInviteState, formData: FormData) => Promise<BulkInviteState>;
  trigger?: React.ReactElement | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const [mode, setMode] = useState<"one" | "many">("one");
  const [copied, setCopied] = useState(false);

  const [inviteState, invite, inviting] = useActionState<InviteState, FormData>(inviteAction, undefined);
  const [bulkState, inviteMany, invitingMany] = useActionState<BulkInviteState, FormData>(inviteManyAction, undefined);

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
        toast.success(`Sent to ${invited} candidates (${emailed} emailed)`);
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
                Invite candidates
              </Button>
            )
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Invite candidates
          </DialogTitle>
          <DialogDescription>
            Send private, single-use test links to candidates via email.
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="flex rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMode("one")}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
              mode === "one"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Single candidate
          </button>
          <button
            type="button"
            onClick={() => setMode("many")}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
              mode === "many"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Bulk invite (multiple)
          </button>
        </div>

        {/* Link Result Alert */}
        {link && (
          <Alert>
            <AlertTitle>Link generated for {link.name}</AlertTitle>
            <AlertDescription className="space-y-2 pt-1 text-xs">
              <p>
                {link.emailed
                  ? "Emailed to candidate automatically."
                  : "Email sending is not configured (or not on file). Copy and send this link directly:"}
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

        {mode === "one" ? (
          <form action={invite} className="space-y-4 w-full min-w-0">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="candidateName">Candidate full name</Label>
                <Input
                  id="candidateName"
                  name="name"
                  placeholder="e.g. Ama Mensah"
                  required
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="candidateEmail">Email address</Label>
                <Input
                  id="candidateEmail"
                  name="email"
                  type="email"
                  placeholder="ama@example.com"
                  required
                  className="h-9"
                />
              </div>
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
              <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={inviting}>
                {inviting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send invitation
              </Button>
            </div>
          </form>
        ) : (
          <form action={inviteMany} className="space-y-4 w-full min-w-0">
            <div className="space-y-1.5">
              <Label htmlFor="candidatesList">Candidates list (one per line)</Label>
              <Textarea
                id="candidatesList"
                name="candidates"
                rows={5}
                placeholder={"Ama Mensah <ama@example.com>\nKwesi Appiah, kwesi@example.com\nkofi@example.com"}
                required
              />
              <p className="text-xs text-muted-foreground">
                Accepts &ldquo;Name &lt;email&gt;&rdquo;, &ldquo;Name, email&rdquo;, or bare email per line.
              </p>
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
              <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={invitingMany}>
                {invitingMany ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
                Send all invitations
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
