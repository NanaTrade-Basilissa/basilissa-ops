"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, MailCheck, Send } from "lucide-react";
import { requestPasswordReset, type ForgotPasswordState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    undefined,
  );

  /*
    One confirmation for every outcome — unknown address, suspended account,
    live super admin. The wording avoids promising an email actually went
    anywhere, because for most of those cases it did not, and it must not read
    differently depending on which case you are in.
  */
  if (state?.sent) {
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <MailCheck className="size-4" />
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            If that address has an account, a link to set a new password is on its way.
            It works once and expires in an hour.
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Nothing arrived? Check spam, then ask an administrator. Some accounts cannot
          reset their own password.
        </p>
        <Link href="/admin/login" className="text-sm font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Forgotten password</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Give us the address you sign in with and we will send a link to set a new
            password.
          </p>
        </div>

        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@basilissa.gh" />
        </Field>

        <Field>
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send a reset link
          </Button>
          <FieldDescription className="text-center">
            <Link href="/admin/login" className="underline underline-offset-4">
              Back to sign in
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
