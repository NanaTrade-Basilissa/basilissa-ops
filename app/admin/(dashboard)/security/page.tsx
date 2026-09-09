import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import {
  MFA_REQUIRED_ROLES,
  hasMfaEnabled,
  remainingRecoveryCodes,
  requireAuth,
  requiresMfa,
} from "@/lib/modules/identity/server";
import { confirmMfa, startMfaEnrolment } from "@/lib/modules/identity/actions";
import { MfaEnrolment } from "@/components/admin/mfa-enrolment";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // requireAuth, not requirePermission — this page has to stay reachable for
  // someone who has been sent here precisely because they cannot reach the
  // privileged ones yet.
  const actor = await requireAuth();
  const redirectedHere = (await searchParams).enrol === "required";
  const roles = actor.assignments.map((assignment) => assignment.role);

  const [enabled, remaining] = await Promise.all([
    hasMfaEnabled(actor.userId),
    remainingRecoveryCodes(actor.userId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Security</h1>
        <p className="text-sm text-muted-foreground">Signed in as {actor.email}.</p>
      </div>

      {redirectedHere && !enabled && (
        <Alert variant="destructive">
          <AlertTitle>Set this up to continue</AlertTitle>
          <AlertDescription>
            The page you tried to open needs two-step verification because of your role.
            You can still sign in and reach this page, nothing else until it is set up.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Two-step verification
          </CardTitle>
          <CardDescription>
            A code from your phone, on top of your password. Required for{" "}
            {MFA_REQUIRED_ROLES.join(", ").toLowerCase().replace(/_/g, " ")}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaEnrolment
            start={startMfaEnrolment}
            confirm={confirmMfa}
            enabled={enabled}
            required={requiresMfa(roles)}
            remainingRecoveryCodes={remaining}
          />
        </CardContent>
      </Card>
    </div>
  );
}
