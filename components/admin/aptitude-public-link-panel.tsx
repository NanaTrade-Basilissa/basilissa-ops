"use client";

import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { IdentityFieldMode } from "@prisma/client";
import type { AptitudeFormState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyLinkButton } from "@/components/admin/copy-link-button";

const MODE_OPTIONS: { value: IdentityFieldMode; label: string }[] = [
  { value: "REQUIRED", label: "Required" },
  { value: "OPTIONAL", label: "Optional" },
  { value: "HIDDEN", label: "Not asked at all" },
];

export function AptitudePublicLinkPanel({
  action,
  linkUrl,
  values,
}: {
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  /** Null until the link has been enabled at least once. */
  linkUrl: string | null;
  values: { enabled: boolean; nameMode: IdentityFieldMode; emailMode: IdentityFieldMode };
}) {
  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(action, undefined);
  const [enabled, setEnabled] = useState(values.enabled);
  const [nameMode, setNameMode] = useState(values.nameMode);
  const [emailMode, setEmailMode] = useState(values.emailMode);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-start gap-3">
        <Switch
          id="publicLinkEnabled"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <div className="space-y-1">
          <Label htmlFor="publicLinkEnabled" className="font-medium">
            One link you can share anywhere
          </Label>
          <p className="text-xs text-muted-foreground">
            Copy it into a job posting, an email, or wherever candidates will find it. Each
            person who opens it gets their own attempt — it does not let anyone sit it twice.
          </p>
        </div>
      </div>

      {!enabled && (
        <>
          <input type="hidden" name="nameMode" value={nameMode} />
          <input type="hidden" name="emailMode" value={emailMode} />
        </>
      )}

      {enabled && (
        <>
          {linkUrl && (
            <div className="pl-[calc(1rem+0.75rem)]">
              <CopyLinkButton url={linkUrl} />
            </div>
          )}

          <div className="grid gap-3 pl-[calc(1rem+0.75rem)] sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="publicLinkNameMode">Name</Label>
              <NativeSelect
                id="publicLinkNameMode"
                name="nameMode"
                value={nameMode}
                onChange={(e) => setNameMode(e.target.value as IdentityFieldMode)}
              >
                {MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publicLinkEmailMode">Email</Label>
              <NativeSelect
                id="publicLinkEmailMode"
                name="emailMode"
                value={emailMode}
                onChange={(e) => setEmailMode(e.target.value as IdentityFieldMode)}
              >
                {MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <p className="pl-[calc(1rem+0.75rem)] text-xs text-muted-foreground">
            Both default to required — a result HR can&rsquo;t follow up on by email isn&rsquo;t
            much use for hiring — but stay adjustable per test.
          </p>
        </>
      )}

      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save
      </Button>
    </form>
  );
}
