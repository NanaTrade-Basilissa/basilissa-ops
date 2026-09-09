"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { BranchFormState } from "@/lib/modules/branches/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BranchForm({
  action,
  defaultValues,
  submitLabel,
  onSuccess,
}: {
  action: (prevState: BranchFormState, formData: FormData) => Promise<BranchFormState>;
  defaultValues?: { name: string; slug: string; location: string; isActive: boolean };
  submitLabel: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<BranchFormState, FormData>(action, undefined);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [slug, setSlug] = useState(defaultValues?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(defaultValues?.slug));
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (state?.success) onSuccess?.();
  }, [state, onSuccess]);

  // `window` is an external system unavailable during SSR, so reading it in a
  // lazy useState initializer would break hydration. `origin` starts empty and
  // fills in after mount, which is why the rule is disabled here rather than
  // the effect restructured.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <form action={formAction} className="max-w-lg space-y-5" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Branch name</Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="Basilissa Cantonments"
        />
        {state?.fieldErrors?.name && <p className="text-xs text-destructive">{state.fieldErrors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="cantonments"
          className="font-mono"
        />
        {state?.fieldErrors?.slug && <p className="text-xs text-destructive">{state.fieldErrors.slug}</p>}
        <p className="text-xs text-muted-foreground">
          Feedback link:{" "}
          <span className="font-mono">
            {origin || "https://your-domain"}/feedback?branch={slug || "…"}
          </span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          required
          defaultValue={defaultValues?.location}
          placeholder="Cantonments Road, Accra"
        />
        {state?.fieldErrors?.location && (
          <p className="text-xs text-destructive">{state.fieldErrors.location}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Switch id="isActive" name="isActive" defaultChecked={defaultValues?.isActive ?? true} />
        <div>
          <Label htmlFor="isActive" className="mb-0">
            Active
          </Label>
          <p className="text-xs text-muted-foreground">Inactive branches stop accepting new feedback.</p>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {submitLabel}
      </Button>
    </form>
  );
}
