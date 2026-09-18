"use client";

import { useState, useTransition } from "react";
import { Mail, Plus, Trash2, UserCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveBranchRecipientsAction } from "@/lib/modules/branches/recipient-actions";
import type { ConfigurableRecipient } from "@/lib/modules/feedback/recipients";

interface BranchFeedbackRecipientsCardProps {
  branchId: string;
  initialRecipients: ConfigurableRecipient[];
  canWrite: boolean;
}

export function BranchFeedbackRecipientsCard({
  branchId,
  initialRecipients,
  canWrite,
}: BranchFeedbackRecipientsCardProps) {
  const [recipients, setRecipients] = useState<ConfigurableRecipient[]>(initialRecipients);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleToggle = (email: string) => {
    if (!canWrite) return;
    setRecipients((prev) =>
      prev.map((r) =>
        r.email.toLowerCase() === email.toLowerCase() ? { ...r, enabled: !r.enabled } : r,
      ),
    );
  };

  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;

    const trimmedEmail = newEmail.trim().toLowerCase();
    const trimmedName = newName.trim();

    if (!trimmedEmail) {
      toast.error("Please enter a valid email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      toast.error("Please provide a valid email format.");
      return;
    }

    if (recipients.some((r) => r.email.toLowerCase() === trimmedEmail)) {
      toast.error("This email address is already in the recipient list.");
      return;
    }

    setRecipients((prev) => [
      ...prev,
      {
        email: trimmedEmail,
        name: trimmedName || trimmedEmail,
        roleLabel: "Additional Recipient",
        enabled: true,
        isDefaultManager: false,
      },
    ]);

    setNewEmail("");
    setNewName("");
    toast.success("Recipient added to draft list. Click Save Changes to apply.");
  };

  const handleRemove = (email: string) => {
    if (!canWrite) return;
    setRecipients((prev) => prev.filter((r) => r.email.toLowerCase() !== email.toLowerCase()));
  };

  const handleSave = () => {
    if (!canWrite) return;

    startTransition(async () => {
      const payload = recipients.map((r) => ({
        email: r.email,
        name: r.name,
        roleLabel: r.roleLabel,
        userId: r.userId,
        enabled: r.enabled,
      }));

      const res = await saveBranchRecipientsAction(branchId, payload);
      if (res.success) {
        toast.success("Feedback email recipients saved successfully.");
      } else {
        toast.error(res.error || "Failed to save recipients.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4 text-primary" />
              Customer Feedback Email Routing
            </CardTitle>
            <CardDescription className="text-xs">
              Staff receiving email notifications for this branch.
            </CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {recipients.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <UserCheck className="mx-auto size-8 text-muted-foreground/60 mb-2" />
            <p>No recipients currently assigned.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add branch personnel or managers below to start receiving feedback alerts.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {recipients.map((recipient) => (
              <div
                key={recipient.email}
                className="flex flex-wrap items-center justify-between gap-3 p-3.5 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Switch
                    id={`recipient-${recipient.email}`}
                    checked={recipient.enabled}
                    onChange={() => handleToggle(recipient.email)}
                    disabled={!canWrite || isPending}
                    aria-label={`Toggle feedback notifications for ${recipient.name || recipient.email}`}
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {recipient.name || recipient.email}
                      </span>
                      {recipient.roleLabel && (
                        <Badge
                          variant={recipient.isDefaultManager ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {recipient.roleLabel}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{recipient.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={recipient.enabled ? "outline" : "secondary"} className="text-xs">
                    {recipient.enabled ? "Active recipient" : "Disabled"}
                  </Badge>
                  {canWrite && !recipient.isDefaultManager && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleRemove(recipient.email)}
                      disabled={isPending}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${recipient.email}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canWrite && (
          <form
            onSubmit={handleAddRecipient}
            className="rounded-lg border border-border bg-muted/20 p-4 space-y-3"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add Additional Recipient
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Full name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isPending}
              />
              <Input
                type="email"
                placeholder="Email address (required)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="outline" disabled={isPending}>
                <Plus className="size-4" /> Add recipient
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
