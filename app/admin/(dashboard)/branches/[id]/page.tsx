import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, MessageSquareText, Star } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import {
  getDashboardData,
  getBranchTrendSeries,
  type TrendGranularity,
} from "@/lib/modules/feedback/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { BranchTopActions } from "@/components/admin/branch-top-actions";
import { StatCard } from "@/components/admin/stat-card";
import {
  RatingDistributionChart,
  TrendChart,
  BranchComparisonChart,
  QuestionAveragesChart,
} from "@/components/admin/charts";
import { RecentSubmissionsTable } from "@/components/admin/recent-submissions-table";
import { getEnv } from "@/lib/platform/env";
import { requireBranchPermission, can } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "Branch analytics" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ granularity?: string }>;

const GRANULARITIES: TrendGranularity[] = ["daily", "weekly", "monthly"];

export default async function BranchDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  // Scoped to this branch, matching the actions on the page. A page that
  // renders what its own buttons will refuse is just a slower refusal.
  const actor = await requireBranchPermission("branch:read", id);
  const canWrite = can(actor, "branch:write", { branchId: id });

  const { granularity: rawGranularity } = await searchParams;
  const granularity: TrendGranularity = GRANULARITIES.includes(rawGranularity as TrendGranularity)
    ? (rawGranularity as TrendGranularity)
    : "daily";

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) notFound();

  const [branchData, allBranchesData, trend] = await Promise.all([
    getDashboardData({ branchId: branch.id }),
    getDashboardData({}),
    getBranchTrendSeries(branch.id, granularity),
  ]);

  const feedbackUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/feedback?branch=${branch.slug}`;
  const rank = [...allBranchesData.branchComparison]
    .filter((b) => b.count > 0)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    .findIndex((b) => b.branchId === branch.id);
  const rankedCount = allBranchesData.branchComparison.filter((b) => b.count > 0).length;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/admin/branches"
          className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors font-medium"
        >
          <ArrowLeft className="size-4" /> Branches
        </Link>
      </div>

      {/* Header with Title, Badges, and Top Action Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{branch.name}</h1>
           {!branch.isActive && (
             <Badge
              variant={branch.isActive ? "default" : "outline"}
              className={branch.isActive ? "bg-red-600 hover:bg-red-600" : ""}
            >
              Inactive
            </Badge>
           )}
            {!branch.geofenceEnabled && (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-xs gap-1 font-medium">
                <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                Geofence Inactive
              </Badge>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 text-primary" /> {branch.location}
          </p>
        </div>

        {/* Action Controls */}
        <BranchTopActions
          branch={branch}
          canWrite={canWrite}
          feedbackUrl={feedbackUrl}
          currentPage="details"
        />
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total submissions" value={branchData.totalSubmissions} icon={MessageSquareText} />
        <StatCard
          label="Overall average"
          value={branchData.averageOverallScore != null ? `${branchData.averageOverallScore} / 5` : "-"}
          icon={Star}
          tone="good"
        />
        <StatCard
          label="Rank among branches"
          value={rank >= 0 ? `#${rank + 1} of ${rankedCount}` : "-"}
          icon={Star}
        />
        <StatCard label="Received today" value={branchData.todayCount} icon={MessageSquareText} />
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rating distribution</CardTitle>
            <CardDescription className="text-xs">Overall score distribution.</CardDescription>
          </CardHeader>
          <CardContent>
            <RatingDistributionChart data={branchData.ratingDistribution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Trend</CardTitle>
                <CardDescription className="text-xs">Average score over time.</CardDescription>
              </div>
              <div className="flex gap-1">
                {GRANULARITIES.map((g) => (
                  <Link
                    key={g}
                    href={`/admin/branches/${branch.id}?granularity=${g}`}
                    className={buttonVariants({
                      variant: g === granularity ? "secondary" : "ghost",
                      size: "xs",
                    })}
                  >
                    {g[0].toUpperCase() + g.slice(1)}
                  </Link>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average score per question</CardTitle>
          </CardHeader>
          <CardContent>
            <QuestionAveragesChart data={branchData.questionAverages} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance vs. other branches</CardTitle>
            <CardDescription className="text-xs">{branch.name} vs. network average.</CardDescription>
          </CardHeader>
          <CardContent>
            <BranchComparisonChart data={allBranchesData.branchComparison} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Submissions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent submissions</CardTitle>
          <CardDescription className="text-xs">Latest submissions for this branch.</CardDescription>
          <CardAction>
            <Link
              href={`/admin/feedbacks?branchId=${branch.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View all
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <RecentSubmissionsTable submissions={branchData.recentSubmissions} showBranch={false} />
        </CardContent>
      </Card>
    </div>
  );
}
