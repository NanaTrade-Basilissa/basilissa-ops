"use client";

import { useActionState } from "react";
import { CheckCircle2, Copy, Loader2, TriangleAlert, UserPlus } from "lucide-react";
import type { CreateUserState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function CreateUserForm({
  action,
  emailConfigured,
  onClose,
  onAddAnother,
}: {
  action: (prev: CreateUserState, formData: FormData) => Promise<CreateUserState>;
  emailConfigured: boolean;
  /** Renders inside a Dialog: closes it, or resets the form for another. */
  onClose: () => void;
  onAddAnother: () => void;
}) {
  const [state, formAction, isPending] = useActionState<CreateUserState, FormData>(
    action,
    undefined,
  );
  const errors = state?.fieldErrors ?? {};

  if (state?.created) {
    return (
      <div className="space-y-5">
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>{state.created.name}&rsquo;s account is ready</AlertTitle>
          <AlertDescription>
            {state.inviteUrl
              ? "They cannot sign in until they use the link below to choose a password."
              : `A link to choose a password has been sent to ${state.created.email}. It expires in an hour.`}
          </AlertDescription>
        </Alert>

        {state.inviteUrl && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
            {/*
              Only reachable when email is unconfigured. Said plainly, because
              handing this to the wrong person hands over the account, and
              because the alternative — a silent dead end — is worse.
            */}
            <div className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                Email is not set up, so nothing was sent. Give this link to{" "}
                {state.created.name} directly and ask them to use it now. It works once,
                expires in an hour, and until then anyone holding it can set the password on
                this account.
              </p>
            </div>
            <code className="block overflow-x-auto rounded-md bg-background p-2 text-xs">
              {state.inviteUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(state.inviteUrl!)}
            >
              <Copy className="size-4" /> Copy link
            </Button>
            <p className="text-xs text-muted-foreground">
              This is shown once. If it is lost, they can use &ldquo;Forgotten
              password&rdquo; on the sign-in page.
            </p>
          </div>
        )}

        <Alert>
          <AlertDescription>
            The account has no role yet, so signing in will show them a no-access page. A
            super admin grants roles from the user&rsquo;s page.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="ghost" onClick={onAddAnother}>
            Add another
          </Button>
        </div>
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

      {!emailConfigured && (
        <Alert>
          <TriangleAlert className="size-4" />
          <AlertTitle>Email is not set up</AlertTitle>
          <AlertDescription>
            You will be shown a link to pass on by hand instead of one being sent.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" required autoComplete="off" placeholder="Ama Mensah" />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="ama@basilissa.gh"
          aria-describedby="email-hint"
        />
        <p id="email-hint" className="text-xs text-muted-foreground">
          What they sign in with, and where the link goes.
        </p>
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        Create account
      </Button>
    </form>
  );
}
