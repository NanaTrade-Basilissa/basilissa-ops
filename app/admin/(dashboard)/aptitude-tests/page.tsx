import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileEdit, ListChecks, Plus, Send, Timer } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { aptitudeOverview } from "@/lib/modules/aptitude/server";
import { createAptitudeTestAction } from "@/lib/modules/aptitude/actions";
import { STATUS_LABEL } from "@/lib/modules/aptitude/constants";
import { StatCard } from "@/components/admin/stat-card";
import { AptitudeTestCreateDialog } from "@/components/admin/aptitude-test-create-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAccraDateTime } from "@/lib/platform/date";

export const metadata: Metadata = { title: "Aptitude Tests" };
export const dynamic = "force-dynamic";

/**
 * The landing page for Aptitude Tests, mirrors the Assessments overview
 * page's shape (`app/admin/(dashboard)/assessments/page.tsx`), for the same
 * reason: a high-level picture before authoring or invitations, which stay
 * on `/all`, `/new`, `/[id]`.
 */
export default async function AptitudeTestsOverviewPage() {
  const actor = await requirePermission("aptitude:read");
  const canWrite = can(actor, "aptitude:write");
  const overview = await aptitudeOverview();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Aptitude Tests</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Timed screening tests for job candidates, separate from Assessments, which is for
            staff already on payroll.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/aptitude-tests/all" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ListChecks className="size-4" /> View all
          </Link>
          {canWrite && (
            <AptitudeTestCreateDialog
              action={createAptitudeTestAction}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> New test
                </Button>
              }
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total tests" value={overview.total} icon={Timer} />
        <StatCard label="Active" value={overview.published} subtext="Published" icon={Send} tone="good" />
        <StatCard label="Draft" value={overview.draft} icon={FileEdit} />
        <StatCard
          label="Completed submissions"
          value={overview.totalSubmitted}
          subtext={`${overview.totalInvitations} invited in total`}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent tests</CardTitle>
            <CardDescription>The last ones created, whatever their status.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentTests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet.{" "}
                {canWrite && (
                  <AptitudeTestCreateDialog
                    action={createAptitudeTestAction}
                    trigger={
                      <button type="button" className="underline underline-offset-4">
                        Create the first one
                      </button>
                    }
                  />
                )}
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {overview.recentTests.map((test) => (
                  <li key={test.id} className="flex items-center gap-3 py-2.5">
                    <Link
                      href={`/admin/aptitude-tests/${test.id}`}
                      className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                    >
                      {test.title}
                    </Link>
                    <Badge variant={test.status === "PUBLISHED" ? "default" : "outline"} className="shrink-0 text-xs">
                      {STATUS_LABEL[test.status]}
                    </Badge>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatAccraDateTime(test.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>The last completed submissions, across every test.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody has completed one yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {overview.recentActivity.map((attempt) => (
                  <li key={attempt.id} className="py-2.5">
                    <Link
                      href={`/admin/aptitude-tests/${attempt.invitation.test.id}/attempts/${attempt.id}`}
                      className="block"
                    >
                      <span className="font-medium">{attempt.invitation.candidateName}</span>{" "}
                      <span className="text-muted-foreground">
                        {attempt.autoSubmitted ? "timed out on" : "completed"}
                      </span>{" "}
                      <span className="underline-offset-4 hover:underline">{attempt.invitation.test.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatAccraDateTime(attempt.submittedAt!)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
