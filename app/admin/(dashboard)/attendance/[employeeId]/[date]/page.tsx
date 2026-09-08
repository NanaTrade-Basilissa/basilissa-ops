import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileClock } from "lucide-react";
import { can, currentBranchScope, requirePermission } from "@/lib/modules/identity/server";
import { getAttendanceDay } from "@/lib/modules/attendance/server";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { formatAccraDate } from "@/lib/platform/date";
import { recordManualAttendance, correctAttendance } from "@/lib/modules/attendance/actions";
import { ManualEntryForm, CorrectionForm } from "@/components/admin/attendance-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/stat-card";
import { requireFeature } from "@/lib/platform/features-guard";

export const metadata: Metadata = { title: "Attendance day" };
export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  FINGERPRINT: "Fingerprint terminal",
  MOBILE_APP: "Mobile app",
  MANAGER_MANUAL: "Manual entry",
  SYSTEM_AUTO_CLOSE: "Closed automatically",
};

function time(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function hours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default async function AttendanceDayPage({
  params,
}: {
  params: Promise<{ employeeId: string; date: string }>;
}) {
  requireFeature("attendance");

  const { employeeId, date } = await params;
  const actor = await requirePermission("attendance:read");
  const scope = await currentBranchScope("attendance:read");

  const result = await getAttendanceDay(scope, employeeId, date);
  if (!result) notFound();

  const { day, employee, branchName, events, corrections } = result;
  const voided = new Set(
    corrections.filter((c) => c.operation !== "INSERT_EVENT").map((c) => c.targetEventId),
  );

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/attendance?date=${date}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to attendance
      </Link>

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          {employee ? `${employee.firstName} ${employee.lastName}` : employeeId}
        </h1>
        <span className="text-muted-foreground">{formatAccraDate(day.workDate)}</span>
        <span className="text-muted-foreground">· {branchName}</span>
        <Badge variant={day.status === "SETTLED" ? "default" : "outline"}>
          {day.status.toLowerCase().replace("_", " ")}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Worked" value={hours(day.netWorkedMinutes)} icon={FileClock} />
        <StatCard label="Overtime" value={hours(day.overtimeMinutes)} icon={FileClock} />
        <StatCard label="Late" value={`${day.lateMinutes}m`} icon={FileClock} />
        <StatCard label="Left early" value={`${day.earlyDepartureMinutes}m`} icon={FileClock} />
      </div>

      {day.flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {day.flags.map((flag) => (
            <Badge key={flag} variant="outline">
              {flag.toLowerCase().replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What was recorded</CardTitle>
          <CardDescription>
            Every signal received, including ones that did not count. A punch superseded by
            a stronger record, or set aside by a correction, stays here. The point is that
            the person disputing a time can see everything the system saw, not only what it
            chose.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {events.map((event) => {
              const superseded =
                event.supersededByEventId !== null ||
                events.some((other) => other.supersedesEventId === event.id);
              const isVoided = voided.has(event.id);
              const counts = !superseded && !isVoided;

              return (
                <li
                  key={event.id}
                  className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm ${
                    counts ? "" : "opacity-60"
                  }`}
                >
                  <span className="w-14 font-mono">{time(event.occurredAt)}</span>
                  <span className="w-24 font-medium">
                    {event.direction.toLowerCase().replace("_", " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {PROVIDER_LABEL[event.providerType] ?? event.providerType}
                  </span>

                  {/* Assurance is shown per event because a day is only as
                      defensible as its least-verified punch. */}
                  <Badge
                    variant={event.identityAssurance === "BIOMETRIC" ? "default" : "outline"}
                    className="text-xs"
                  >
                    {event.identityAssurance.toLowerCase().replace("_", " ")}
                  </Badge>

                  {event.hintMismatch && (
                    <Badge variant="outline" className="text-xs" title="The device reported the opposite direction; the sequence decided">
                      device disagreed
                    </Badge>
                  )}
                  {superseded && <Badge variant="outline" className="text-xs">superseded</Badge>}
                  {isVoided && <Badge variant="outline" className="text-xs">set aside</Badge>}
                  {event.clockSkewMs != null && Math.abs(event.clockSkewMs) > 60_000 && (
                    <Badge variant="outline" className="text-xs">
                      device clock off by {Math.round(event.clockSkewMs / 60_000)}m
                    </Badge>
                  )}

                  {event.evidence?.manualReasonCode && (
                    <span className="w-full text-xs text-muted-foreground">
                      {event.evidence.manualReasonCode.toLowerCase().replace(/_/g, " ")}
                      {event.evidence.manualReasonText ? ` · ${event.evidence.manualReasonText}` : ""}
                    </span>
                  )}
                </li>
              );
            })}
            {events.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">Nothing was recorded.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      {corrections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corrections</CardTitle>
            <CardDescription>
              What was changed, by whom and why. Corrections are added, never edited, so
              this list only ever grows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {corrections.map((correction) => (
                <li key={correction.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">
                      {correction.operation.toLowerCase().replace(/_/g, " ")}
                    </span>
                    <span className="text-muted-foreground">
                      {correction.reasonCode.toLowerCase().replace(/_/g, " ")}
                    </span>
                    {correction.requiresApproval && (
                      <Badge variant={correction.approvedBy ? "default" : "outline"}>
                        {correction.approvedBy ? "approved" : "awaiting approval"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground">{correction.reasonText}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {can(actor, "attendance:manual_entry", { branchId: day.branchId }) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record a punch by hand</CardTitle>
            <CardDescription>
              For when the terminal was down or somebody forgot. This is the only path
              with no verification at all, so every entry is attributed, reason-coded and
              counted towards your branch&rsquo;s manual-entry rate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManualEntryForm
              action={recordManualAttendance.bind(null, employeeId, day.branchId)}
              defaultDate={date}
            />
          </CardContent>
        </Card>
      )}

      {can(actor, "attendance:write", { branchId: day.branchId }) && events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Correct a punch</CardTitle>
            <CardDescription>
              Changes what the attendance means without changing what was recorded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CorrectionForm
              action={correctAttendance.bind(null, employeeId, day.branchId, date)}
              events={events
                .filter((event) => !voided.has(event.id))
                .map((event) => ({
                  id: event.id,
                  label: `${time(event.occurredAt)} ${event.direction.toLowerCase().replace("_", " ")} · ${
                    PROVIDER_LABEL[event.providerType] ?? event.providerType
                  }`,
                }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
