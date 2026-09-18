import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, Pencil, Timer, Trophy, Users } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { assessmentSummary, getAssessmentForEditing, listInvitationsPaginated } from "@/lib/modules/assessments/server";
import { STATUS_LABEL } from "@/lib/modules/assessments/constants";
import {
  closeAssessmentAction,
  deleteAssessmentAction,
  inviteManyToAssessmentAction,
  inviteToAssessmentAction,
  publishAssessmentAction,
  resendInvitationAction,
  revokeInvitationAction,
  updatePublicLinkAction,
} from "@/lib/modules/assessments/actions";
import { AssessmentLifecycle } from "@/components/admin/assessment-lifecycle";
import { AssessmentInviteDialog } from "@/components/admin/assessment-invite-dialog";
import { AssessmentPublicLinkDialog } from "@/components/admin/assessment-public-link-dialog";
import { AssessmentResponsesTable } from "@/components/admin/assessment-responses-table";
import { CopyPublicLinkButton } from "@/components/admin/copy-public-link-button";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/platform/prisma";
import { getEnv } from "@/lib/platform/env";

export const metadata: Metadata = { title: "Assessment Dashboard" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AssessmentPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const actor = await requirePermission("assessment:read");
  const { id } = await params;
  const canWrite = can(actor, "assessment:write");

  const rawParams = await searchParams;
  const page = Number(first(rawParams.page)) || 1;

  const [assessment, paginatedResult, summary, employees, allInvitations] = await Promise.all([
    getAssessmentForEditing(id),
    listInvitationsPaginated(id, { page, pageSize: 10 }),
    assessmentSummary(id),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    }),
    prisma.assessmentInvitation.findMany({
      where: { assessmentId: id },
      select: {
        employeeId: true,
        revokedAt: true,
        response: { select: { submittedAt: true } },
      },
    }),
  ]);

  if (!assessment) notFound();

  const questionCount = assessment.sections.reduce((n, s) => n + s.questions.length, 0);
  const publicLinkUrl = assessment.publicLinkToken
    ? `${getEnv().NEXT_PUBLIC_APP_URL}/assessment/public/${assessment.publicLinkToken}`
    : null;

  const completionRate =
    summary.invited > 0 ? `${Math.round((summary.submitted / summary.invited) * 100)}%` : "-";

  function pageHref(targetPage: number) {
    return targetPage === 1
      ? `/admin/assessments/${id}`
      : `/admin/assessments/${id}?page=${targetPage}`;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/assessments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to assessments
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-foreground">{assessment.title}</h1>
            <Badge variant={assessment.status === "PUBLISHED" ? "default" : "outline"}>
              {STATUS_LABEL[assessment.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
            <span>{assessment.sections.length} sections · {questionCount} questions</span>
            {assessment.passMarkPercent !== null && <span>· {assessment.passMarkPercent}% pass mark</span>}
            {!assessment.showScoreToTaker && <span>· score hidden from taker</span>}
          </p>
        </div>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/assessments/${assessment.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil className="size-3.5" />
              Edit assessment
            </Link>

            {assessment.publicLinkEnabled && publicLinkUrl && (
              <CopyPublicLinkButton url={publicLinkUrl} />
            )}

            <AssessmentPublicLinkDialog
              action={updatePublicLinkAction.bind(null, assessment.id)}
              linkUrl={publicLinkUrl}
              values={{
                enabled: assessment.publicLinkEnabled,
                nameMode: assessment.publicLinkNameMode,
                emailMode: assessment.publicLinkEmailMode,
              }}
            />

            <AssessmentInviteDialog
              employees={employees.map((e) => ({
                id: e.id,
                label: `${e.firstName} ${e.lastName} (${e.employeeCode})`,
              }))}
              invitations={allInvitations}
              inviteAction={inviteToAssessmentAction.bind(null, assessment.id)}
              inviteManyAction={inviteManyToAssessmentAction.bind(null, assessment.id)}
            />

            <AssessmentLifecycle
              status={assessment.status}
              publishAction={publishAssessmentAction.bind(null, assessment.id)}
              closeAction={closeAssessmentAction.bind(null, assessment.id)}
              deleteAction={deleteAssessmentAction.bind(null, assessment.id)}
            />
          </div>
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
              Participant responses
            </CardTitle>
            <CardDescription className="text-xs">
              Invitations, employee participation, and assessment scores.
            </CardDescription>
          </div>
          {assessment.publicLinkEnabled && (
            <Badge variant="outline" className="text-xs gap-1.5 py-1">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Public link active
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <AssessmentResponsesTable
            assessmentId={assessment.id}
            canWrite={canWrite}
            invitations={paginatedResult.invitations}
            resendAction={resendInvitationAction.bind(null, assessment.id)}
            revokeAction={revokeInvitationAction.bind(null, assessment.id)}
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
