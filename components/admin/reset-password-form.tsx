"use client";

import { useActionState } from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";
import { submitPasswordReset, type ResetPasswordState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<ResetPasswordState, FormData>(
    submitPasswordReset,
    undefined,
  );
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="token" value={token} />

      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <p className="text-sm text-balance text-muted-foreground">Choose something you have not used elsewhere.</p>
        </div>

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

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-describedby="password-hint"
            aria-invalid={errors.password ? true : undefined}
          />
          <FieldDescription id="password-hint">
            At least 12 characters. Length beats punctuation. A phrase you will remember
            is stronger than a short password with a symbol bolted on.
          </FieldDescription>
          <FieldError errors={errors.password ? [{ message: errors.password }] : undefined} />
        </Field>

        <Field data-invalid={Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={errors.confirmPassword ? true : undefined}
          />
          <FieldError errors={errors.confirmPassword ? [{ message: errors.confirmPassword }] : undefined} />
        </Field>

        <Field>
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Set new password
          </Button>
          <FieldDescription className="text-center">
            Setting a new password signs out every device already using this account.
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
