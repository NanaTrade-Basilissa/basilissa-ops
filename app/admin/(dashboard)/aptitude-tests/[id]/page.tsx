import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, Timer, Trophy, Users } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { aptitudeTestSummary, getAptitudeTestForEditing, listInvitationsPaginated } from "@/lib/modules/aptitude/server";
import { STATUS_LABEL } from "@/lib/modules/aptitude/constants";
import {
  resendInvitationAction,
  revokeInvitationAction,
} from "@/lib/modules/aptitude/actions";
import { AptitudeTestActions } from "@/components/admin/aptitude-test-actions";
import { AptitudeResponsesTable } from "@/components/admin/aptitude-responses-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/lib/platform/env";

export const metadata: Metadata = { title: "Aptitude Test Dashboard" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AptitudeTestPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const actor = await requirePermission("aptitude:read");
  const { id } = await params;
  const canWrite = can(actor, "aptitude:write");

  const rawParams = await searchParams;
  const page = Number(first(rawParams.page)) || 1;

  const [test, paginatedResult, summary] = await Promise.all([
    getAptitudeTestForEditing(id),
    listInvitationsPaginated(id, { page, pageSize: 10 }),
    aptitudeTestSummary(id),
  ]);

  if (!test) notFound();

  const questionCount = test.sections.reduce((n, s) => n + s.questions.length, 0);
  const publicLinkUrl = test.publicLinkToken
    ? `${getEnv().NEXT_PUBLIC_APP_URL}/aptitude/public/${test.publicLinkToken}`
    : null;

  const completionRate =
    summary.invited > 0 ? `${Math.round((summary.submitted / summary.invited) * 100)}%` : "-";

  function pageHref(targetPage: number) {
    return targetPage === 1
      ? `/admin/aptitude-tests/${id}`
      : `/admin/aptitude-tests/${id}?page=${targetPage}`;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/aptitude-tests"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to aptitude tests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-foreground">{test.title}</h1>
            <Badge variant={test.status === "PUBLISHED" ? "default" : "outline"}>
              {STATUS_LABEL[test.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
            <span>{test.sections.length} sections · {questionCount} questions</span>
            <span>
              ·{" "}
              {test.sections.some((s) => (s.timeLimitMinutes ?? 0) > 0)
                ? `${test.sections.reduce((sum, s) => sum + (s.timeLimitMinutes ?? 0), 0)} min total (section-timed)`
                : test.timeLimitMinutes
                  ? `${test.timeLimitMinutes} min timer`
                  : "untimed"}
            </span>
            {test.passMarkPercent !== null && <span>· {test.passMarkPercent}% pass mark</span>}
            {!test.showScoreToCandidate && <span>· score hidden from candidate</span>}
          </p>
        </div>

        {canWrite && (
          <AptitudeTestActions
            test={test}
            attemptCount={summary.attempts}
            publicLinkUrl={publicLinkUrl}
          />
        )}
      </div>

      {/* Analysis / Dashboard at the top */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Invited" value={summary.invited} icon={Users} />
        <StatCard label="Completed" value={summary.submitted} icon={CheckCircle2} tone="good" />
        <StatCard label="Completion rate" value={completionRate} icon={Timer} />
        <StatCard
          label="Average score"
          value={summary.averagePercent !== null ? `${summary.averagePercent}%` : "-"}
          icon={Trophy}
          tone="good"
        />
      </div>

      {/* Responses on a paginated table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Candidate responses
            </CardTitle>
            <CardDescription className="text-xs">
              Invitations, candidate progress, and test scores.
            </CardDescription>
          </div>
          {test.publicLinkEnabled && (
            <Badge variant="outline" className="text-xs gap-1.5 py-1">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Public link active
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <AptitudeResponsesTable
            testId={test.id}
            canWrite={canWrite}
            invitations={paginatedResult.invitations}
            resendAction={resendInvitationAction.bind(null, test.id)}
            revokeAction={revokeInvitationAction.bind(null, test.id)}
          />

          <DataTablePagination
            page={paginatedResult.page}
            totalPages={paginatedResult.totalPages}
            total={paginatedResult.total}
            pageSize={paginatedResult.pageSize}
            buildHref={pageHref}
          />
        </CardContent>
      </Card>
    </div>
  );
}
