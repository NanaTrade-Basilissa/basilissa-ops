import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { MessageSquareText, Star, CalendarDays, CalendarRange, Trophy, TrendingDown } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { getDashboardData } from "@/lib/modules/feedback/server";
import { dashboardFilterSchema } from "@/lib/modules/feedback/validation";
import { getAccraDayEnd } from "@/lib/platform/date";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { DashboardFilters } from "@/components/admin/dashboard-filters";
import { buttonVariants } from "@/components/ui/button";
import {
  RatingDistributionChart,
  TrendChart,
  BranchComparisonChart,
  QuestionAveragesChart,
} from "@/components/admin/charts";
import { RecentSubmissionsTable } from "@/components/admin/recent-submissions-table";
import { GeneralQrButton } from "@/components/admin/general-qr-button";
import { getEnv } from "@/lib/platform/env";
import { requirePermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("admin:access");

  const raw = await searchParams;
  const parsed = dashboardFilterSchema.safeParse({
    branchId: first(raw.branchId),
    from: first(raw.from),
    to: first(raw.to),
    rating: first(raw.rating),
    questionId: first(raw.questionId),
  });
  const filters = parsed.success ? parsed.data : {};

  const fromDate = filters.from ? new Date(`${filters.from}T00:00:00Z`) : undefined;
  const toDate = filters.to ? getAccraDayEnd(new Date(`${filters.to}T00:00:00Z`)) : undefined;

  const [data, branches, questions] = await Promise.all([
    getDashboardData({
      branchId: filters.branchId,
      rating: filters.rating,
      questionId: filters.questionId,
      from: fromDate,
      to: toDate,
    }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.question.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, text: true, order: true, ratingLabels: true },
    }),
  ]);

  const selectedQuestionLabels = filters.questionId
    ? questions.find((q) => q.id === filters.questionId)?.ratingLabels
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Customer feedback across every branch, live.
          </p>
        </div>
        <GeneralQrButton feedbackUrl={`${getEnv().NEXT_PUBLIC_APP_URL}/feedback`} />
      </div>

      <Suspense fallback={<div className="h-[74px]" />}>
        <DashboardFilters
          branches={branches.map((b) => ({ id: b.id, label: b.name }))}
          questions={questions.map((q) => ({ id: q.id, label: `Q${q.order} - ${q.text}` }))}
        />
      </Suspense>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total submissions" value={data.totalSubmissions} icon={MessageSquareText} />
        <StatCard
          label="Average rating"
          value={data.averageOverallScore != null ? `${data.averageOverallScore} / 5` : "-"}
          icon={Star}
          tone="good"
        />
        <StatCard label="Received today" value={data.todayCount} icon={CalendarDays} />
        <StatCard label="Received this week" value={data.weekCount} icon={CalendarRange} />
        <StatCard
          label="Highest-rated branch"
          value={data.bestBranch?.branchName ?? "-"}
          tooltip={data.bestBranch?.branchName}
          subtext={data.bestBranch ? `${data.bestBranch.avgScore} / 5 avg` : undefined}
          icon={Trophy}
          tone="good"
        />
        <StatCard
          label="Lowest-rated branch"
          value={data.worstBranch?.branchName ?? "-"}
          tooltip={data.worstBranch?.branchName}
          subtext={data.worstBranch ? `${data.worstBranch.avgScore} / 5 avg` : undefined}
          icon={TrendingDown}
          tone="critical"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rating distribution</CardTitle>
            <CardDescription>
              {filters.questionId ? "For the selected question" : "Overall score across all submissions"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RatingDistributionChart data={data.ratingDistribution} labels={selectedQuestionLabels} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feedback trend</CardTitle>
            <CardDescription>Average score per day over the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={data.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branch comparison</CardTitle>
            <CardDescription>Average overall score by branch, highest first</CardDescription>
          </CardHeader>
          <CardContent>
            <BranchComparisonChart data={data.branchComparison} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average score per question</CardTitle>
            <CardDescription>Where customers are happiest and where they&apos;re not</CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionAveragesChart data={data.questionAverages} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent submissions</CardTitle>
          <CardDescription>The 10 most recent submissions matching the current filters</CardDescription>
          <CardAction>
            <Link href="/admin/feedbacks" className={buttonVariants({ variant: "outline", size: "sm" })}>
              View all
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <RecentSubmissionsTable submissions={data.recentSubmissions} />
        </CardContent>
      </Card>
    </div>
  );
}
