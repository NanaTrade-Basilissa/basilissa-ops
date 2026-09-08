"use client";

import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { IdentityFieldMode } from "@prisma/client";
import type { AssessmentFormState } from "@/lib/modules/assessments/actions";
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

export function PublicLinkPanel({
  action,
  linkUrl,
  values,
}: {
  action: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  /** Null until the link has been enabled at least once — there is nothing to show yet. */
  linkUrl: string | null;
  values: { enabled: boolean; nameMode: IdentityFieldMode; emailMode: IdentityFieldMode };
}) {
  const [state, formAction, isPending] = useActionState<AssessmentFormState, FormData>(
    action,
    undefined,
  );
  const [enabled, setEnabled] = useState(values.enabled);
  // Tracked even while hidden, and always submitted (see the hidden inputs
  // below): turning the link off must not lose HR's configured modes, and
  // the schema requires both fields regardless of `enabled`, since nothing
  // else can tell whether an absent field means "unchanged" or "cleared."
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
            Anyone with the link can take this
          </Label>
          <p className="text-xs text-muted-foreground">
            One reusable link instead of a personal invitation per person. Each person who opens
            it gets their own attempt — it does not let anyone sit it twice.
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
            &ldquo;Not asked at all&rdquo; means the taker never sees the field, and their result
            is not attributable to anyone — HR only sees a submission, not who made it.
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
