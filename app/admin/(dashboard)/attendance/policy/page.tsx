import type { Metadata } from "next";
import { History } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { policyHistory, resolvePolicy } from "@/lib/modules/attendance/server";
import { updateAttendancePolicy } from "@/lib/modules/attendance/actions";
import { AttendancePolicyForm } from "@/components/admin/attendance-policy-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAccraDateTime } from "@/lib/platform/date";
import { requireFeature } from "@/lib/platform/features-guard";

export const metadata: Metadata = { title: "Attendance policy" };
export const dynamic = "force-dynamic";

export default async function AttendancePolicyPage() {
  requireFeature("attendance");

  // Read gates the page; the Server Action re-checks write separately, because
  // actions are reachable by direct POST and a page-level check is not a
  // security boundary.
  const actor = await requirePermission("policy:read");
  const canEdit = can(actor, "policy:write");

  const [current, history] = await Promise.all([resolvePolicy(null), policyHistory(null)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Attendance policy</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The rules attendance is calculated under. Saving creates a new version rather than
          editing this one, so attendance already settled keeps the rules it was calculated
          under: changing a threshold today never rewrites last month.
        </p>
      </div>

      <AttendancePolicyForm
        action={updateAttendancePolicy}
        canEdit={canEdit}
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
          isProvisional: current.isProvisional,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Version history
          </CardTitle>
          <CardDescription>
            Every version ever in effect. Nothing here is editable: a change adds a version
            rather than replacing one, which is what lets an old day be recalculated
            correctly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No policy recorded yet.</p>
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
