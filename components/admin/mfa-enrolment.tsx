"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Loader2, ShieldCheck, ShieldPlus } from "lucide-react";
import type { EnrolmentState } from "@/lib/modules/identity/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function MfaEnrolment({
  start,
  confirm,
  enabled,
  required,
  remainingRecoveryCodes,
}: {
  start: () => Promise<EnrolmentState>;
  confirm: (prev: EnrolmentState, formData: FormData) => Promise<EnrolmentState>;
  enabled: boolean;
  required: boolean;
  remainingRecoveryCodes: number;
}) {
  const [started, setStarted] = useState<EnrolmentState | null>(null);
  const [isStarting, startTransition] = useTransition();
  const [state, formAction, isPending] = useActionState<EnrolmentState, FormData>(confirm, {
    step: "idle",
  });

  if (state.step === "confirmed") {
    return (
      <div className="space-y-4">
        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>Two-step verification is on</AlertTitle>
          <AlertDescription>
            You will be asked for a code from your app each time you sign in.
          </AlertDescription>
        </Alert>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <div>
            <h3 className="font-medium">Recovery codes</h3>
            <p className="text-sm text-muted-foreground">
              Save these somewhere safe now. Each works once, and they are the only way
              back in if you lose your phone.{" "}
              <strong>They are stored hashed, so they cannot be shown again</strong>,
              not to you, and not to an administrator.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {state.recoveryCodes.map((code) => (
              <li key={code} className="rounded-md bg-muted px-3 py-2">
                {code}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(state.recoveryCodes.join("\n"))}
            >
              <Copy className="size-4" />
              Copy all
            </Button>
            <Link href="/admin" className={buttonVariants({ size: "sm" })}>
              Continue to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="space-y-4">
        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>Two-step verification is on</AlertTitle>
          <AlertDescription>
            {remainingRecoveryCodes} recovery {remainingRecoveryCodes === 1 ? "code" : "codes"}{" "}
            remaining.
            {remainingRecoveryCodes <= 2 &&
              " Set up your authenticator again to get a fresh set."}
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Setting it up again replaces your current authenticator and invalidates every
          existing recovery code.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={isStarting}
          onClick={() => startTransition(async () => setStarted(await start()))}
        >
          Set up again
        </Button>
        {started?.step === "started" && <Secret state={started} formAction={formAction} isPending={isPending} error={state.step === "error" ? state.error : undefined} />}
      </div>
    );
  }

  const active = started?.step === "started" ? started : null;

  return (
    <div className="space-y-4">
      {required && (
        <Alert variant="destructive">
          <AlertTitle>Required for your role</AlertTitle>
          <AlertDescription>
            Your account can grant roles or change the rules that decide what people are
            paid. A password on its own is not enough for that.
          </AlertDescription>
        </Alert>
      )}

      {!active ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={isStarting}
            onClick={() => startTransition(async () => setStarted(await start()))}
          >
            {isStarting ? <Loader2 className="size-4 animate-spin" /> : <ShieldPlus className="size-4" />}
            Set up two-step verification
          </Button>
          {!required && (
            <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
              Skip to dashboard
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Secret
            state={active}
            formAction={formAction}
            isPending={isPending}
            error={state.step === "error" ? state.error : undefined}
          />
          {!required && (
            <div>
              <Link href="/admin" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Skip for now
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Secret({
  state,
  formAction,
  isPending,
  error,
}: {
  state: Extract<EnrolmentState, { step: "started" }>;
  formAction: (formData: FormData) => void;
  isPending: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          Open your authenticator app and add an account.
          <div className="mt-2 space-y-1">
            <p className="text-muted-foreground">Enter this key:</p>
            <code className="block rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
              {state.secret}
            </code>
          </div>
        </li>
        <li>Enter the six-digit code it shows, to prove the app is working.</li>
      </ol>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code from the app</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="w-32 text-center font-mono tracking-widest"
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Confirm
        </Button>
      </form>
    </div>
  );
}
