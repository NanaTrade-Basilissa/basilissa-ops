"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy, Globe, Link2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { IdentityFieldMode } from "@prisma/client";
import type { AptitudeFormState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MODE_OPTIONS: { value: IdentityFieldMode; label: string }[] = [
  { value: "REQUIRED", label: "Required" },
  { value: "OPTIONAL", label: "Optional" },
  { value: "HIDDEN", label: "Not asked at all" },
];

export function AptitudePublicLinkDialog({
  action,
  linkUrl,
  values,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  linkUrl: string | null;
  values: { enabled: boolean; nameMode: IdentityFieldMode; emailMode: IdentityFieldMode };
  trigger?: React.ReactElement | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(action, undefined);
  const [enabled, setEnabled] = useState(values.enabled);
  const [nameMode, setNameMode] = useState(values.nameMode);
  const [emailMode, setEmailMode] = useState(values.emailMode);
  const [copied, setCopied] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setEnabled(values.enabled);
      setNameMode(values.nameMode);
      setEmailMode(values.emailMode);
    }
  }

  useEffect(() => {
    if (state?.saved) {
      toast.success("Public link settings updated");
      const timer = setTimeout(() => setOpen(false), 0);
      return () => clearTimeout(timer);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, setOpen]);

  async function handleCopy() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      toast.success("Public test link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== null && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button variant="outline" size="sm" className="gap-1.5 h-9">
                <Link2 className="size-4" />
                {values.enabled ? "Public link settings" : "Configure public link"}
              </Button>
            )
          }
        />
      )}
      <DialogContent className="m:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-5 text-primary" />
            Public link settings
          </DialogTitle>
          <DialogDescription>
            Allow candidates to self-register and sit the test via a single shareable link.
          </DialogDescription>
        </DialogHeader>

        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{state.error}</AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="space-y-4 w-full min-w-0">
          <div className="flex items-start gap-3 rounded-lg border border-border p-3.5 w-full min-w-0">
            <Switch
              id="aptitudePublicLinkEnabled"
              name="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <div className="space-y-1 min-w-0 flex-1">
              <Label htmlFor="aptitudePublicLinkEnabled" className="font-medium cursor-pointer">
                Enable public link access
              </Label>
              <p className="text-xs text-muted-foreground">
                Candidates can sit the test from this link. Each person gets their own timed attempt.
              </p>
            </div>
          </div>

          {!enabled ? (
            <>
              <input type="hidden" name="nameMode" value={nameMode} />
              <input type="hidden" name="emailMode" value={emailMode} />
            </>
          ) : (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5 w-full min-w-0">
              {linkUrl && (
                <div className="space-y-1.5 w-full min-w-0">
                  <Label className="text-xs font-medium text-muted-foreground">Shareable URL</Label>
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <code className="flex-1 min-w-0 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">
                      {linkUrl}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 gap-1 text-xs"
                      onClick={handleCopy}
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 pt-1 w-full min-w-0">
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="aptitudePublicNameMode">Candidate name</Label>
                  <NativeSelect
                    id="aptitudePublicNameMode"
                    name="nameMode"
                    value={nameMode}
                    onChange={(e) => setNameMode(e.target.value as IdentityFieldMode)}
                    className="h-9 w-full"
                  >
                    {MODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="aptitudePublicEmailMode">Candidate email</Label>
                  <NativeSelect
                    id="aptitudePublicEmailMode"
                    name="emailMode"
                    value={emailMode}
                    onChange={(e) => setEmailMode(e.target.value as IdentityFieldMode)}
                    className="h-9 w-full"
                  >
                    {MODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Both default to required so hiring managers can follow up on test scores.
              </p>
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
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save settings
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
