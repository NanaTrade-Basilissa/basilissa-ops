"use client";

import { useActionState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { MfaFormState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function MfaChallengeForm({
  action,
}: {
  action: (prevState: MfaFormState, formData: FormData) => Promise<MfaFormState>;
}) {
  const [state, formAction, isPending] = useActionState<MfaFormState, FormData>(action, undefined);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Two-step verification</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Your password was accepted. One more step.
          </p>
        </div>

        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="code">Authentication code</FieldLabel>
          <Input
            id="code"
            name="code"
            // inputMode numeric brings up a number pad, but the field stays text
            // so a hyphenated recovery code can be pasted in here too.
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            placeholder="123456"
            className="text-center font-mono text-lg tracking-widest"
          />
          <FieldDescription>
            From your authenticator app. If you have lost your phone, enter one of your
            recovery codes instead.
          </FieldDescription>
        </Field>

        <Field>
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Verify
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
