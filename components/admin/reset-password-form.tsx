"use client";

import { useActionState } from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";
import { submitPasswordReset, type ResetPasswordState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<ResetPasswordState, FormData>(
    submitPasswordReset,
    undefined,
  );
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {state.error}
            {/* The way out, offered where the dead end is, rather than left to
                be found back on the sign-in page. */}
            {!state.fieldErrors && (
              <>
                {" "}
                <Link href="/admin/forgot-password" className="font-medium underline underline-offset-4">
                  Request a new link
                </Link>
                .
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="password-hint"
          aria-invalid={errors.password ? true : undefined}
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 12 characters. Length beats punctuation. A phrase you will remember
          is stronger than a short password with a symbol bolted on.
        </p>
        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={errors.confirmPassword ? true : undefined}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        Set new password
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Setting a new password signs out every device already using this account.
      </p>
    </form>
  );
}
