"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import type { LiveFloorData } from "@/lib/modules/attendance/queries";

function formatTime(date: Date | null): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function LiveFloorBoard({
  data,
  branches,
}: {
  data: LiveFloorData;
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const { branchId, branchName, asOf, todayKey, counts, staff } = data;

  const asOfTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(asOf));

  function switchBranch(newBranchId: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (newBranchId) next.set("branchId", newBranchId);
    else next.delete("branchId");
    router.replace(`?${next.toString()}`);
  }

  function refresh() {
    router.refresh();
  }

  const filteredStaff = staff.filter((s) => {
    if (filterStatus === "ALL") return true;
    return s.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Branch & Live Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {branches.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Branch:</span>
              <NativeSelect
                value={branchId}
                onChange={(e) => switchBranch(e.target.value)}
                className="w-48"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className="text-sm font-semibold text-foreground">
              {branchName}
            </div>
          )}
          <span className="text-xs text-muted-foreground">· Today: {todayKey}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
            </span>
            Live as of <span className="font-mono font-medium text-foreground">{asOfTime}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            className="h-8 gap-1.5 text-xs"
          >
            <RotateCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Headcount Stat Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <button
          type="button"
          onClick={() => setFilterStatus("ON_DUTY")}
          className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
            filterStatus === "ON_DUTY"
              ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span>On Duty Now</span>
            <span className="size-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{counts.onDuty}</div>
          <span className="text-[11px] text-muted-foreground">Working on floor</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("SCHEDULED_LATE")}
          className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
            filterStatus === "SCHEDULED_LATE"
              ? "border-amber-500 bg-amber-500/10 shadow-sm"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-medium text-amber-600 dark:text-amber-400">
            <span>Late</span>
            <AlertTriangle className="size-3.5" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{counts.late}</div>
          <span className="text-[11px] text-muted-foreground">Past scheduled start</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("SCHEDULED_AWAITING")}
          className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
            filterStatus === "SCHEDULED_AWAITING"
              ? "border-sky-500 bg-sky-500/10 shadow-sm"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-medium text-sky-600 dark:text-sky-400">
            <span>Awaiting Shift</span>
            <Clock className="size-3.5" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{counts.awaiting}</div>
          <span className="text-[11px] text-muted-foreground">Scheduled today</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("COMPLETED")}
          className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
            filterStatus === "COMPLETED"
              ? "border-slate-500 bg-slate-500/10 shadow-sm"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
            <span>Completed</span>
            <CheckCircle2 className="size-3.5" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{counts.completed}</div>
          <span className="text-[11px] text-muted-foreground">Clocked out today</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("ABSENT")}
          className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
            filterStatus === "ABSENT"
              ? "border-rose-500 bg-rose-500/10 shadow-sm"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-medium text-rose-600 dark:text-rose-400">
            <span>Absent</span>
            <XCircle className="size-3.5" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{counts.absent}</div>
          <span className="text-[11px] text-muted-foreground">Missed full shift</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("ALL")}
          className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
            filterStatus === "ALL"
              ? "border-primary bg-primary/10 shadow-sm"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Total Staff</span>
            <Users className="size-3.5" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{counts.totalStaff}</div>
          <span className="text-[11px] text-muted-foreground">Branch roster</span>
        </button>
      </div>

      {/* Staff Cards Grid */}
      {filteredStaff.length === 0 ? (
        <Empty className="border">
          <EmptyDescription>No staff found matching this filter.</EmptyDescription>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredStaff.map((staffMember) => {
            const isWorking = staffMember.status === "ON_DUTY";
            const isLate = staffMember.status === "SCHEDULED_LATE";
            const isCompleted = staffMember.status === "COMPLETED";
            const isAbsent = staffMember.status === "ABSENT";
            const isAwaiting = staffMember.status === "SCHEDULED_AWAITING";

            return (
              <div
                key={staffMember.employeeId}
                className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all ${
                  isWorking
                    ? "border-emerald-500/40 bg-emerald-500/[0.03]"
                    : isLate
                    ? "border-amber-500/40 bg-amber-500/[0.03]"
                    : isAbsent
                    ? "border-rose-500/30 bg-rose-500/[0.02]"
                    : "border-border bg-card"
                }`}
              >
                <div>
                  {/* Top Bar: Name & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/admin/employees/${staffMember.employeeId}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {staffMember.name}
                      </Link>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {staffMember.employeeCode && (
                          <span className="font-mono">{staffMember.employeeCode}</span>
                        )}
                        {staffMember.jobTitle && <span>· {staffMember.jobTitle}</span>}
                      </div>
                    </div>

                    {isWorking && (
                      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        ● On Duty
                      </Badge>
                    )}
                    {isLate && (
                      <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300">
                        Late Arrival
                      </Badge>
                    )}
                    {isAwaiting && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Awaiting Shift
                      </Badge>
                    )}
                    {isCompleted && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Completed
                      </Badge>
                    )}
                    {isAbsent && (
                      <Badge variant="destructive" className="text-xs">
                        Absent
                      </Badge>
                    )}
                    {staffMember.status === "OFF_DUTY" && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Off Duty
                      </Badge>
                    )}
                  </div>

                  {/* Shift & Time Details */}
                  <div className="mt-3 space-y-1 text-xs">
                    {staffMember.shiftName && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Scheduled:</span>
                        <span className="font-medium text-foreground">
                          {staffMember.shiftName} (
                          {formatTime(staffMember.scheduledStart)} -{" "}
                          {formatTime(staffMember.scheduledEnd)})
                        </span>
                      </div>
                    )}

                    {staffMember.actualIn && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Clock In:</span>
                        <span className="font-mono font-medium text-foreground">
                          {formatTime(staffMember.actualIn)}
                        </span>
                      </div>
                    )}

                    {staffMember.actualOut && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Clock Out:</span>
                        <span className="font-mono font-medium text-foreground">
                          {formatTime(staffMember.actualOut)}
                        </span>
                      </div>
                    )}

                    {isWorking && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Elapsed Time:</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatDuration(staffMember.onDutyMinutes)}
                        </span>
                      </div>
                    )}

                    {isCompleted && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Net Worked:</span>
                        <span className="font-mono font-medium text-foreground">
                          {formatDuration(staffMember.netWorkedMinutes)}
                        </span>
                      </div>
                    )}

                    {staffMember.lateMinutes > 0 && (
                      <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                        <span>Tardiness:</span>
                        <span className="font-medium">+{staffMember.lateMinutes}m late</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer link to day details */}
                <div className="mt-4 border-t border-border/60 pt-3 text-right">
                  <Link
                    href={`/admin/attendance/${staffMember.employeeId}/${todayKey}?branchId=${data.branchId}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Inspect Day Record &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
