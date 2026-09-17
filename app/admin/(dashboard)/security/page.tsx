import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, History } from "lucide-react";
import {
  MFA_RECOMMENDED_ROLES,
  MFA_REQUIRED_ROLES,
  can,
  hasMfaEnabled,
  listAuditLogs,
  remainingRecoveryCodes,
  requireAuth,
  requiresMfa,
} from "@/lib/modules/identity/server";
import { confirmMfa, startMfaEnrolment } from "@/lib/modules/identity/actions";
import { MfaEnrolment } from "@/components/admin/mfa-enrolment";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditLogTable } from "@/components/admin/audit-log-table";

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
  const sp = await searchParams;
  const roles = actor.assignments.map((assignment) => assignment.role);
  const isRequiredRole = requiresMfa(roles);
  const isEnrolPrompt = sp.enrol === "required" || sp.enrol === "suggested";

  const [enabled, remaining] = await Promise.all([
    hasMfaEnabled(actor.userId),
    remainingRecoveryCodes(actor.userId),
  ]);

  // A user whose role requires MFA must not invoke permission-gated queries
  // (like listAuditLogs -> requirePermission -> requireMfaIfNeeded) before
  // completing enrolment, or the page will redirect to itself in an infinite loop.
  const canViewAudit = can(actor, "user:read") && (!isRequiredRole || enabled);

  const auditData = canViewAudit
    ? await listAuditLogs({
        search: typeof sp.search === "string" ? sp.search : undefined,
        action: typeof sp.action === "string" ? sp.action : undefined,
        entityType: typeof sp.entityType === "string" ? sp.entityType : undefined,
        actorEmail: typeof sp.actorEmail === "string" ? sp.actorEmail : undefined,
        startDate: typeof sp.startDate === "string" ? sp.startDate : undefined,
        endDate: typeof sp.endDate === "string" ? sp.endDate : undefined,
        page: typeof sp.page === "string" ? Number(sp.page) : 1,
        pageSize: typeof sp.pageSize === "string" ? Number(sp.pageSize) : 25,
      })
    : null;

  const mfaCard = (
    <div className="mx-auto max-w-2xl space-y-6">
      {isEnrolPrompt && !enabled && (
        isRequiredRole ? (
          <Alert variant="destructive">
            <AlertTitle>Set this up to continue</AlertTitle>
            <AlertDescription>
              The page you tried to open needs two-step verification because of your role.
              You can still sign in and reach this page, nothing else until it is set up.
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Two-step verification
          </CardTitle>
          <CardDescription>
            A code from your phone, on top of your password. Required for{" "}
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

  return (
    <div className={`mx-auto space-y-6 ${canViewAudit ? "max-w-5xl" : "max-w-2xl"}`}>
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Security</h1>
        <p className="text-sm text-muted-foreground">Signed in as {actor.email}.</p>
      </div>

      {!canViewAudit ? (
        mfaCard
      ) : (
        <Tabs defaultValue={sp.tab === "audit" ? "audit" : "mfa"} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="mfa">Two-step verification</TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-1.5">
              <History className="size-3.5" />
              <span>Audit Trail</span>
              {auditData && (
                <span className="ml-1 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px]">
                  {auditData.total}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mfa">{mfaCard}</TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">System & Activity Audit Trail</h2>
              <p className="text-sm text-muted-foreground">
                Append-only record of security, policy, shift, and attendance administrative events.
              </p>
            </div>
            {auditData && <AuditLogTable data={auditData} />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

