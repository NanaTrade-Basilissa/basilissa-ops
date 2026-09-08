"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { IdentityFieldMode } from "@prisma/client";
import type { DeclarationState } from "@/lib/modules/assessments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Deliberately not told who the invitation was for.
 *
 * Passing the expected name in would put it in the page payload, and if this
 * link reached the wrong person it would tell them exactly what to type. The
 * comparison happens on the server, where the answer stays.
 *
 * `nameMode`/`emailMode` come from the invitation: fixed at
 * (required, optional) for a personal link, or the assessment's own choice
 * for a public one. A page only renders this component at all when at least
 * one field isn't `HIDDEN` — see `app/assessment/[token]/page.tsx`, which
 * skips it entirely (and auto-declares) when both are.
 */
export function IdentityDeclaration({
  action,
  nameMode,
  emailMode,
  personal,
}: {
  action: (prev: DeclarationState, formData: FormData) => Promise<DeclarationState>;
  nameMode: IdentityFieldMode;
  emailMode: IdentityFieldMode;
  /** A personal, HR-issued link — shows the "please don't pass this on" note. */
  personal: boolean;
}) {
  const [state, formAction, isPending] = useActionState<DeclarationState, FormData>(
    action,
    undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Before you start</CardTitle>
        <CardDescription>
          {nameMode === "HIDDEN" && emailMode === "HIDDEN"
            ? "One more moment before the questions."
            : "Confirm who you are so your answers are recorded against the right person."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5" noValidate>
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/*
            The expected name is NOT pre-filled. Showing it and asking them to
            type it turns the check into a copying exercise — and if this link
            reached the wrong person, it would tell them exactly what to write.
          */}
          {nameMode !== "HIDDEN" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Your full name
                {nameMode === "OPTIONAL" && (
                  <span className="text-muted-foreground"> (optional)</span>
                )}
              </Label>
              <Input
                id="name"
                name="name"
                required={nameMode === "REQUIRED"}
                autoComplete="name"
                autoFocus
              />
            </div>
          )}

          {emailMode !== "HIDDEN" && (
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Your email
                {emailMode === "OPTIONAL" && (
                  <span className="text-muted-foreground"> (optional)</span>
                )}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required={emailMode === "REQUIRED"}
                autoComplete="email"
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            Start
          </Button>

          {personal && (
            <p className="text-xs text-muted-foreground">
              This link was sent to one person. Please do not pass it on. Answers are recorded
              against whoever it was sent to.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
