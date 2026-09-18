"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, ShieldAlert, Timer } from "lucide-react";
import type { IdentityFieldMode } from "@prisma/client";
import type { DeclarationState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Deliberately not told who the invitation was for — same reasoning as
 * Assessments' identity-declaration component. The comparison happens on
 * the server, where the answer stays.
 */
export function IdentityDeclaration({
  action,
  nameMode,
  emailMode,
  personal,
  timeLimitMinutes,
  isSectionTimed,
}: {
  action: (prev: DeclarationState, formData: FormData) => Promise<DeclarationState>;
  nameMode: IdentityFieldMode;
  emailMode: IdentityFieldMode;
  /** A personal, HR-issued link — shows the "please don't pass this on" note. */
  personal: boolean;
  /** Null means untimed. The clock itself starts on first open, not on this
   * screen — this is purely so nobody discovers it's timed only after
   * starting. */
  timeLimitMinutes: number | null;
  isSectionTimed?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<DeclarationState, FormData>(action, undefined);

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
      <CardContent className="space-y-4">
        {isSectionTimed ? (
          <Alert>
            <Timer className="size-4" />
            <AlertDescription>
              This test is timed section-by-section. When each section&apos;s time expires, the test
              automatically advances to the next section.
            </AlertDescription>
          </Alert>
        ) : timeLimitMinutes !== null ? (
          <Alert>
            <Timer className="size-4" />
            <AlertDescription>
              This test is timed: {timeLimitMinutes} {timeLimitMinutes === 1 ? "minute" : "minutes"} once you
              start. The clock does not pause.
            </AlertDescription>
          </Alert>
        ) : null}
        <Alert>
          <ShieldAlert className="size-4" />
          <AlertDescription>
            Once you start, copying, pasting, and selecting text are turned off. Leaving this
            tab is recorded and shown with your result.
          </AlertDescription>
        </Alert>
        <form action={formAction} className="space-y-5" noValidate>
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {nameMode !== "HIDDEN" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Your full name
                {nameMode === "OPTIONAL" && <span className="text-muted-foreground"> (optional)</span>}
              </Label>
              <Input id="name" name="name" required={nameMode === "REQUIRED"} autoComplete="name" autoFocus />
            </div>
          )}

          {emailMode !== "HIDDEN" && (
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Your email
                {emailMode === "OPTIONAL" && <span className="text-muted-foreground"> (optional)</span>}
              </Label>
              <Input id="email" name="email" type="email" required={emailMode === "REQUIRED"} autoComplete="email" />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
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
