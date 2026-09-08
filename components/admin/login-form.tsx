"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, LogIn } from "lucide-react";
import { login, type LoginFormState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function LoginForm({ passwordWasReset = false }: { passwordWasReset?: boolean }) {
  const [state, formAction, isPending] = useActionState<LoginFormState, FormData>(login, undefined);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Reassurance that the reset worked, since the reset flow deliberately
          does not sign anyone in and would otherwise look like it failed. */}
      {passwordWasReset && !state?.error && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>Sign in with your new password.</AlertDescription>
        </Alert>
      )}

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
          placeholder="admin@basilissa.gh"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/admin/forgot-password"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgotten?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>

      <Button type="submit" className="h-10 w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Signing in…
          </>
        ) : (
          <>
            <LogIn className="size-4" /> Sign in
          </>
        )}
      </Button>
    </form>
  );
}
