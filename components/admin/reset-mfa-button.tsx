"use client";

import { useActionState, useEffect } from "react";
import { Loader2, ShieldOff } from "lucide-react";
import type { UserAdminState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ResetMfaButton({
  action,
  userId,
  label,
  onMutated,
}: {
  action: (prev: UserAdminState, formData: FormData) => Promise<UserAdminState>;
  userId: string;
  label: string;
  onMutated?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<UserAdminState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state?.saved) onMutated?.();
  }, [state, onMutated]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={isPending}
        // Not a confirmation dialog — this is reversible by re-enrolling, and
        // an extra click on a rare, audited action buys nothing.
        title={`Clear two-step verification for ${label}`}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
        Reset
      </Button>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.saved && (
        <Alert>
          <AlertDescription className="text-xs">{state.saved}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
