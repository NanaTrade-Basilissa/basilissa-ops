import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, User } from "lucide-react";
import {
  MFA_RECOMMENDED_ROLES,
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
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SettingsRow } from "@/components/admin/settings-row";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // requireAuth, not requirePermission — this page must stay reachable for
  // someone directed here to set up required MFA before accessing privileged areas.
  const actor = await requireAuth();
  const sp = await searchParams;
  const roles = actor.assignments.map((assignment) => assignment.role);
  const isRequiredRole = requiresMfa(roles);
  const enrolParam = first(sp.enrol);
  const isEnrolPrompt = enrolParam === "required" || enrolParam === "suggested";

  const [enabled, remaining] = await Promise.all([
    hasMfaEnabled(actor.userId),
    remainingRecoveryCodes(actor.userId),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage your account profile and security settings.
        </p>
      </div>

      {isEnrolPrompt && !enabled && (
        isRequiredRole ? (
          <Alert variant="destructive">
            <AlertTitle>Set this up to continue</AlertTitle>
            <AlertDescription>
              The page you tried to open requires two-step verification because of your administrative role.
              Please complete enrollment below to proceed.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-amber-200 bg-amber-50/50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <ShieldCheck className="size-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Two-step verification recommended</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">
                We recommend setting up two-step verification to safeguard administrative features. You can set it up now or skip to the dashboard.
              </span>
              <Link
                href="/admin"
                className={buttonVariants({ variant: "outline", size: "sm", className: "shrink-0 bg-background" })}
              >
                Skip to dashboard
              </Link>
            </AlertDescription>
          </Alert>
        )
      )}

      {/* Profile Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4" />
            Account profile
          </CardTitle>
          <CardDescription>
            Your signed-in account details and assigned roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            <SettingsRow label="Name" control={<span className="text-sm font-medium">{actor.name}</span>} />
            <SettingsRow
              label="Email"
              control={<span className="font-mono text-xs">{actor.email}</span>}
            />
            <SettingsRow
              label="Assigned roles"
              control={
                <div className="flex flex-wrap justify-end gap-1.5">
                  {roles.map((r, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {r.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Two-step verification
          </CardTitle>
          <CardDescription>
            A security code from your authenticator app, on top of your password. Required for{" "}
            {MFA_REQUIRED_ROLES.join(", ").toLowerCase().replace(/_/g, " ")}.
            {MFA_RECOMMENDED_ROLES.length > 0 &&
              ` Recommended for ${MFA_RECOMMENDED_ROLES.join(" and ").toLowerCase().replace(/_/g, " ")}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaEnrolment
            start={startMfaEnrolment}
            confirm={confirmMfa}
            enabled={enabled}
            required={isRequiredRole}
            remainingRecoveryCodes={remaining}
          />
        </CardContent>
      </Card>
    </div>
  );
}
