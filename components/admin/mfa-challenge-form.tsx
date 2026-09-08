"use client";

import { useActionState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { MfaFormState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function MfaChallengeForm({
  action,
}: {
  action: (prevState: MfaFormState, formData: FormData) => Promise<MfaFormState>;
}) {
  const [state, formAction, isPending] = useActionState<MfaFormState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="code">Authentication code</Label>
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
        <p className="text-xs text-muted-foreground">
          From your authenticator app. If you have lost your phone, enter one of your
          recovery codes instead.
        </p>
      </div>

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        Verify
      </Button>
    </form>
  );
}
