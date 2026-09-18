import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, FileClock, Trash2 } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { getAttendanceDay, resolvePolicy, canAuthorizeOvertime } from "@/lib/modules/attendance/server";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { formatAccraDate, formatAccraDateTime } from "@/lib/platform/date";
import { recordManualAttendance } from "@/lib/modules/attendance/actions";
import { ManualEntryDialog } from "@/components/admin/attendance-actions";
import { ResolveExceptionDialog } from "@/components/admin/resolve-exception-dialog";
import { AttendanceCorrectionDialog } from "@/components/admin/attendance-correction-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatCard } from "@/components/admin/stat-card";

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
  searchParams,
}: {
  params: Promise<{ employeeId: string; date: string }>;
  searchParams?: Promise<{ branchId?: string }>;
}) {
  const { employeeId, date } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { actor, scope } = await requireAnyBranchPermission("attendance:read");

  const result = await getAttendanceDay(scope, employeeId, date, resolvedSearchParams?.branchId);
  if (!result) notFound();

  const { day, employee, branchName, events, corrections, isRecorded, shiftName } = result;
  const voided = new Set(
    corrections.filter((c) => c.operation !== "INSERT_EVENT").map((c) => c.targetEventId),
  );

  const policy = await resolvePolicy(day.branchId, day.workDate);
  const canAuthOvertime = canAuthorizeOvertime(actor, day.branchId, policy);
  const canWrite = can(actor, "attendance:write", { branchId: day.branchId });
  const isAutoClosed = day.flags.includes("AUTO_CLOSED");

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/attendance?date=${date}&branchId=${day.branchId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to attendance
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">
            {employee ? `${employee.firstName} ${employee.lastName}` : employeeId}
          </h1>
          <span className="text-muted-foreground">{formatAccraDate(day.workDate)}</span>
          <span className="text-muted-foreground">· {branchName}</span>
          </div>
          <Badge variant={isRecorded && day.status === "SETTLED" ? "default" : "outline"}>
            {!isRecorded ? "No punches" : day.status.toLowerCase().replace("_", " ")}
          </Badge>
          {isAutoClosed && (
            <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300">
              Auto-closed shift
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRecorded && day.status === "NEEDS_REVIEW" && canWrite && (
            <ResolveExceptionDialog
              employeeId={employeeId}
              employeeName={employee ? `${employee.firstName} ${employee.lastName}` : employeeId}
              branchId={day.branchId}
              dateKey={date}
              flags={day.flags}
              calculatedOvertimeMinutes={day.overtimeMinutes}
              payableOvertimeMinutes={day.payableOvertimeMinutes}
              canAuthorizeOvertime={canAuthOvertime}
            />
          )}

          {can(actor, "attendance:manual_entry", { branchId: day.branchId }) && (
            <ManualEntryDialog
              action={recordManualAttendance.bind(null, employeeId, day.branchId)}
              defaultDate={date}
              employeeName={employee ? `${employee.firstName} ${employee.lastName}` : employeeId}
            />
          )}

          {canWrite && isRecorded && events.length > 0 && (
            <AttendanceCorrectionDialog
              employeeId={employeeId}
              branchId={day.branchId}
              dateKey={date}
              events={events.map((e) => ({
                id: e.id,
                direction: e.direction,
                occurredAt: e.occurredAt,
                isVoided: voided.has(e.id),
                providerType: e.providerType,
              }))}
            />
          )}
        </div>
      </div>

      {!isRecorded && (
        <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200">
          <Clock className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="font-semibold">No Attendance Recorded</AlertTitle>
          <AlertDescription className="text-xs">
            {shiftName ? (
              <span>
                Scheduled for <strong>{shiftName}</strong>
                {day.scheduledStart && day.scheduledEnd
                  ? ` (${time(day.scheduledStart)} – ${time(day.scheduledEnd)})`
                  : ""}
                , but no punches recorded yet.
              </span>
            ) : (
              <span>No clock-in or clock-out punches recorded for this date.</span>
            )}
            {can(actor, "attendance:manual_entry", { branchId: day.branchId }) && (
              <span> Use button above to add manual entry.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isAutoClosed && (
        <Alert className="border-purple-500/30 bg-purple-500/10 text-purple-950 dark:text-purple-200">
          <AlertTitle className="font-semibold">Shift Automatically Closed</AlertTitle>
          <AlertDescription className="text-xs">
            Automatically closed due to missing clock-out. Zero overtime credited.
          </AlertDescription>
        </Alert>
      )}

      {day.status === "SETTLED" && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground flex flex-wrap gap-4 items-center justify-between">
          <div>
            Settled: <span className="font-medium text-foreground">{day.settledAt ? formatAccraDateTime(day.settledAt) : "Yes"}</span>
          </div>
          <div>
            Payable Overtime Authorized: <span className="font-semibold text-foreground">{day.payableOvertimeMinutes} minutes</span>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Worked" value={hours(day.netWorkedMinutes)} icon={FileClock} />
        <StatCard
          label="Overtime"
          value={day.payableOvertimeMinutes > 0 ? `${hours(day.payableOvertimeMinutes)} (payable)` : hours(day.overtimeMinutes)}
          icon={FileClock}
        />
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
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">What was recorded</CardTitle>
            <CardDescription className="text-xs">
              All raw punch signals and corrections.
            </CardDescription>
          </div>
          {canWrite && isRecorded && events.length > 0 && (
            <AttendanceCorrectionDialog
              employeeId={employeeId}
              branchId={day.branchId}
              dateKey={date}
              events={events.map((e) => ({
                id: e.id,
                direction: e.direction,
                occurredAt: e.occurredAt,
                isVoided: voided.has(e.id),
                providerType: e.providerType,
              }))}
            />
          )}
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
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm ${
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

                  {canWrite && !isVoided && (
                    <div className="ml-auto flex items-center gap-1">
                      <AttendanceCorrectionDialog
                        employeeId={employeeId}
                        branchId={day.branchId}
                        dateKey={date}
                        initialEventId={event.id}
                        initialOperation="ADJUST_TIME"
                        events={events.map((e) => ({
                          id: e.id,
                          direction: e.direction,
                          occurredAt: e.occurredAt,
                          isVoided: voided.has(e.id),
                          providerType: e.providerType,
                        }))}
                        trigger={
                          <Button variant="ghost" size="icon-sm" title="Adjust punch time">
                            <Clock className="size-3.5" />
                            <span className="sr-only">Adjust punch time</span>
                          </Button>
                        }
                      />
                      <AttendanceCorrectionDialog
                        employeeId={employeeId}
                        branchId={day.branchId}
                        dateKey={date}
                        initialEventId={event.id}
                        initialOperation="VOID_EVENT"
                        events={events.map((e) => ({
                          id: e.id,
                          direction: e.direction,
                          occurredAt: e.occurredAt,
                          isVoided: voided.has(e.id),
                          providerType: e.providerType,
                        }))}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:bg-destructive/10"
                            title="Void punch"
                          >
                            <Trash2 className="size-3.5" />
                            <span className="sr-only">Void punch</span>
                          </Button>
                        }
                      />
                    </div>
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
            <CardDescription className="text-xs">
              Audit log of manual edits and adjustments.
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
    </div>
  );
}
