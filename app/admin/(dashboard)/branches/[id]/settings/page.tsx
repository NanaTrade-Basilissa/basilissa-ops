import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Globe, MapPin, Navigation } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { listConfigurableRecipientsForBranch } from "@/lib/modules/feedback/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BranchTopActions } from "@/components/admin/branch-top-actions";
import { BranchGeofenceCard } from "@/components/admin/branch-geofence-card";
import { BranchFeedbackRecipientsCard } from "@/components/admin/branch-feedback-recipients-card";
import { getEnv } from "@/lib/platform/env";
import { requireBranchPermission, can } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "Branch settings" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function BranchSettingsPage({ params }: { params: Params }) {
  const { id } = await params;
  const actor = await requireBranchPermission("branch:read", id);
  const canWrite = can(actor, "branch:write", { branchId: id });

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) notFound();

  const initialRecipients = await listConfigurableRecipientsForBranch(branch.id);
  const feedbackUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/feedback?branch=${branch.slug}`;
  const hasCoords = branch.latitude != null && branch.longitude != null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/admin/branches/${branch.id}`}
          className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors font-medium"
        >
          <ArrowLeft className="size-4" /> Back to {branch.name}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {branch.name} Settings
            </h1>
            <Badge
              variant={branch.isActive ? "default" : "outline"}
              className={branch.isActive ? "bg-emerald-600 hover:bg-emerald-600" : ""}
            >
              {branch.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure physical geofence boundaries, feedback email notification recipients, and branch profile settings.
          </p>
        </div>

        {/* Action Controls */}
        <BranchTopActions
          branch={branch}
          canWrite={canWrite}
          feedbackUrl={feedbackUrl}
          currentPage="settings"
        />
      </div>

      {/* General Branch Details Overview Card */}
      <Card className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">General Branch Profile</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Core identity and metadata used across customer feedback and attendance platforms
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border/50 bg-slate-50/70 p-3.5 space-y-1">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Building2 className="size-3.5 text-primary" />
                Branch Name
              </div>
              <div className="text-sm font-semibold text-foreground">{branch.name}</div>
              <div className="text-xs font-mono text-muted-foreground truncate">slug: {branch.slug}</div>
            </div>

            <div className="rounded-xl border border-border/50 bg-slate-50/70 p-3.5 space-y-1">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <MapPin className="size-3.5 text-primary" />
                Physical Address
              </div>
              <div className="text-sm font-semibold text-foreground truncate">{branch.location}</div>
              <div className="text-xs text-muted-foreground">Operational physical site</div>
            </div>

            <div className="rounded-xl border border-border/50 bg-slate-50/70 p-3.5 space-y-1">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Globe className="size-3.5 text-primary" />
                Regional Timezone
              </div>
              <div className="text-sm font-semibold font-mono text-foreground">
                {branch.timezone ?? "Africa/Accra"}
              </div>
              <div className="text-xs text-muted-foreground">Local workDate anchor</div>
            </div>

            <div className="rounded-xl border border-border/50 bg-slate-50/70 p-3.5 space-y-1">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Navigation className="size-3.5 text-primary" />
                Geofence State
              </div>
              <div className="text-sm font-semibold text-foreground">
                {branch.geofenceEnabled ? (
                  <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    Enforced ({branch.geofenceRadiusMeters}m)
                  </span>
                ) : hasCoords ? (
                  <span className="text-amber-700 font-medium">Configured (Disabled)</span>
                ) : (
                  <span className="text-muted-foreground">Unconfigured</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {hasCoords ? "GPS coordinates registered" : "GPS coordinates required"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Geofence & Perimeter Configuration */}
      <BranchGeofenceCard branch={branch} canWrite={canWrite} />

      {/* Customer Feedback Email Recipients Routing */}
      <BranchFeedbackRecipientsCard
        branchId={branch.id}
        initialRecipients={initialRecipients}
        canWrite={canWrite}
      />
    </div>
  );
}
