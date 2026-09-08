"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, MailCheck, Send } from "lucide-react";
import { requestPasswordReset, type ForgotPasswordState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <div className="space-y-5">
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
    <form action={formAction} className="space-y-5" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@basilissa.gh"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Send a reset link
      </Button>

      <Link
        href="/admin/login"
        className="block text-center text-sm text-muted-foreground underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </form>
  );
}
