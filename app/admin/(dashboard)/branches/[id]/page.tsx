import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, MapPin, MessageSquareText, Pencil, Star } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { getDashboardData, getBranchTrendSeries, type TrendGranularity } from "@/lib/modules/feedback/server";
import { toggleBranchActive, updateBranch } from "@/lib/modules/branches/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { BranchDialog } from "@/components/admin/branch-dialog";
import { BranchGeofenceCard } from "@/components/admin/branch-geofence-card";
import { StatCard } from "@/components/admin/stat-card";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import {
  RatingDistributionChart,
  TrendChart,
  BranchComparisonChart,
  QuestionAveragesChart,
} from "@/components/admin/charts";
import { RecentSubmissionsTable } from "@/components/admin/recent-submissions-table";
import { getEnv } from "@/lib/platform/env";
import { cn } from "@/lib/utils";
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-foreground">{branch.name}</h1>
            <Badge variant={branch.isActive ? "default" : "outline"}>
              {branch.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5" /> {branch.location}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <BranchDialog
              action={updateBranch.bind(null, branch.id)}
              submitLabel="Save changes"
              title="Edit branch"
              description="Changing the slug also changes this branch's QR code link."
              defaultValues={{
                name: branch.name,
                slug: branch.slug,
                location: branch.location,
                isActive: branch.isActive,
                latitude: branch.latitude,
                longitude: branch.longitude,
                geofenceRadiusMeters: branch.geofenceRadiusMeters,
                geofenceEnabled: branch.geofenceEnabled,
              }}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="size-4" /> Edit
                </Button>
              }
            />
            <form action={toggleBranchActive}>
              <input type="hidden" name="id" value={branch.id} />
              <input type="hidden" name="nextIsActive" value={(!branch.isActive).toString()} />
              <Button size="sm" variant={branch.isActive ? "destructive" : "secondary"} type="submit">
                {branch.isActive ? "Deactivate" : "Activate"}
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback QR code</CardTitle>
            <CardDescription>Print this at the branch or share the link directly.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG, not a static asset next/image can optimize */}
              <img src={`/api/admin/branches/${branch.id}/feedback/qr`} alt={`QR code for ${branch.name}`} width={160} height={160} />
            </div>
            <CopyLinkButton url={feedbackUrl} />
            <a
              href={`/api/admin/branches/${branch.id}/feedback/qr?download=1`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
            >
              <Download className="size-4" /> Download QR PNG
            </a>
          </CardContent>
        </Card>
      </div>

      <BranchGeofenceCard branch={branch} canWrite={canWrite} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rating distribution</CardTitle>
            <CardDescription>Overall score across this branch&apos;s submissions</CardDescription>
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
                <CardDescription>Average score over time</CardDescription>
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
            <CardDescription>{branch.name} highlighted against the network average</CardDescription>
          </CardHeader>
          <CardContent>
            <BranchComparisonChart data={allBranchesData.branchComparison} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent submissions</CardTitle>
          <CardDescription>The 10 most recent submissions for this branch</CardDescription>
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
