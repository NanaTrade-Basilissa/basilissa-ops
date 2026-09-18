import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Globe, History } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { policyHistory, resolvePolicy } from "@/lib/modules/attendance/server";
import { updateAttendancePolicy } from "@/lib/modules/attendance/actions";
import { AttendancePolicyForm } from "@/components/admin/attendance-policy-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatAccraDateTime } from "@/lib/platform/date";

export const metadata: Metadata = { title: "Attendance policy" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ branchId?: string | string[] }>;

export default async function AttendancePolicyPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  // Read gates the page; the Server Action re-checks write separately, because
  // actions are reachable by direct POST and a page-level check is not a
  // security boundary.
  const actor = await requirePermission("policy:read");
  const canEdit = can(actor, "policy:write");

  const params = searchParams ? await searchParams : {};
  const rawBranchId = Array.isArray(params.branchId) ? params.branchId[0] : params.branchId;
  const selectedBranchId = rawBranchId && rawBranchId.trim() ? rawBranchId.trim() : null;

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const selectedBranch = selectedBranchId
    ? branches.find((b) => b.id === selectedBranchId)
    : null;

  const [current, history] = await Promise.all([
    resolvePolicy(selectedBranchId),
    policyHistory(selectedBranchId),
  ]);

  const hasBranchSpecificOverride = selectedBranchId
    ? history.some((v) => v.validTo === null)
    : false;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Attendance policy</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedBranch
                ? `Rules and thresholds for ${selectedBranch.name}.`
                : "Global attendance rules and thresholds."}
            </p>
          </div>
          {selectedBranch ? (
            hasBranchSpecificOverride ? (
              <Badge className="bg-amber-600 hover:bg-amber-600 text-white">
                Branch Override Active
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border text-muted-foreground">
                Using Global Default
              </Badge>
            )
          ) : (
            <Badge variant="outline" className="border-primary/30 text-primary">
              Global Default
            </Badge>
          )}
        </div>

        {/* Branch Switcher */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-b border-border pb-4">
          <Link
            href="/admin/attendance/policy"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              !selectedBranchId
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="size-3.5" />
            Global (All branches)
          </Link>
          {branches.map((branch) => (
            <Link
              key={branch.id}
              href={`/admin/attendance/policy?branchId=${branch.id}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedBranchId === branch.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="size-3.5" />
              {branch.name}
            </Link>
          ))}
        </div>
      </div>

      {selectedBranch && !hasBranchSpecificOverride && (
        <Alert>
          <Building2 className="size-4" />
          <AlertTitle>Using Global Default</AlertTitle>
          <AlertDescription>
            {selectedBranch.name} currently inherits global attendance rules. Saving changes below will
            create a dedicated policy override for this branch only.
          </AlertDescription>
        </Alert>
      )}

      <AttendancePolicyForm
        action={updateAttendancePolicy}
        canEdit={canEdit}
        branchId={selectedBranchId}
        branchName={selectedBranch?.name}
        values={{
          graceInMinutes: current.graceInMinutes,
          graceOutMinutes: current.graceOutMinutes,
          overtimeThresholdMinutes: current.overtimeThresholdMinutes,
          breakPolicy: current.breakPolicy,
          autoDeductMinutes: current.autoDeductMinutes,
          autoDeductAfterMinutes: current.autoDeductAfterMinutes,
          roundingMinutes: current.roundingMinutes,
          autoCloseGraceMinutes: current.autoCloseGraceMinutes,
          dedupWindowMinutes: current.dedupWindowMinutes,
          maxManualEntryDays: current.maxManualEntryDays,
          branchManagerCanAuthorizeOvertime: current.branchManagerCanAuthorizeOvertime,
          isProvisional: current.isProvisional,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Version history
          </CardTitle>
          <CardDescription>Every version ever in effect. Not editable.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {selectedBranch
                ? `No branch-specific policy recorded for ${selectedBranch.name} yet. It is currently governed by the global default policy.`
                : "No policy recorded yet."}
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {history.map((version) => (
                <li key={version.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-medium">
                      {formatAccraDateTime(version.validFrom)}
                      {version.validTo ? ` – ${formatAccraDateTime(version.validTo)}` : ""}
                    </span>
                    {version.validTo === null && <Badge>In effect</Badge>}
                    {version.isProvisional && <Badge variant="outline">Not confirmed</Badge>}
                    <span className="text-muted-foreground">
                      late grace {version.graceInMinutes}m · OT threshold{" "}
                      {version.overtimeThresholdMinutes}m · rounding{" "}
                      {version.roundingMinutes === 0 ? "off" : `${version.roundingMinutes}m`}
                    </span>
                  </div>
                  {/*
                    Versions predating this column say so rather than showing a
                    blank, which would read as though nobody bothered.
                  */}
                  <p className="text-muted-foreground">
                    {version.changeReason ? (
                      <span className="text-foreground">{version.changeReason}</span>
                    ) : (
                      <span className="italic">No reason recorded. This version predates it.</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
