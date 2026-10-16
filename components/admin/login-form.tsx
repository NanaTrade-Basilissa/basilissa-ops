"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { login, type LoginFormState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Adapted from shadcn's `login-02` block: same Field-based structure, but
 * the real `login` Server Action in place of the block's placeholder form,
 * and no social sign-in or sign-up link — this app has neither.
 */
export function LoginForm({ passwordWasReset = false }: { passwordWasReset?: boolean }) {
  const [state, formAction, isPending] = useActionState<LoginFormState, FormData>(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Admin dashboard</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Sign in to Basilissa Operations
          </p>
        </div>

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

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="admin@basilissa.gh"
          />
        </Field>

        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link href="/admin/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">
              Forgotten?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center focus-visible:outline-hidden"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </Field>

        <Field>
          <Button type="submit" size="lg" disabled={isPending}>
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
          <FieldDescription className="text-center">
            Access is by invitation. Contact an administrator if you need an account.
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
