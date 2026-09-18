"use client";

import Link from "next/link";
import {
  CalendarDays,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import type { EmployeeAttendanceHistoryData } from "@/lib/modules/attendance/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime(date: Date | null | string): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  });
}

export function EmployeeAttendanceTab({
  employeeId,
  history,
}: {
  employeeId: string;
  history: EmployeeAttendanceHistoryData | null | undefined;
}) {
  if (!history || history.days.length === 0) {
    return (
      <Empty className="border">
        <CalendarDays className="size-8 text-muted-foreground" />
        <EmptyTitle>No attendance history</EmptyTitle>
        <EmptyDescription>
          No attendance records or shift days have been recorded for this employee yet.
        </EmptyDescription>
      </Empty>
    );
  }

  const { summary, days } = history;

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card>

          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Total Worked</span>
              <Clock className="size-3.5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatMinutes(summary.totalNetMinutes)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              across {summary.daysWorked} worked shifts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Overtime</span>
              <CheckCircle2 className="size-3.5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {formatMinutes(summary.totalPayableOvertimeMinutes)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              authorized ({formatMinutes(summary.totalOvertimeMinutes)} calculated)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Punctuality</span>
              <CalendarDays className="size-3.5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{summary.onTimeRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.lateDaysCount > 0
                ? `${summary.lateDaysCount} late (${formatMinutes(summary.totalLateMinutes)})`
                : "Perfect on-time record"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Exceptions</span>
              {summary.exceptionDaysCount > 0 ? (
                <AlertTriangle className="size-3.5 text-amber-500" />
              ) : (
                <ShieldAlert className="size-3.5 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-xl font-bold ${
                summary.exceptionDaysCount > 0 ? "text-amber-600 dark:text-amber-400" : ""
              }`}
            >
              {summary.exceptionDaysCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              flagged or review required
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Days Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Attendance Days</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Date</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Clock In / Out</TableHead>
                <TableHead>Worked</TableHead>
                <TableHead>Overtime</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((day) => {
                const isAutoClosed = day.flags.includes("AUTO_CLOSED");
                return (
                  <TableRow key={day.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link
                        href={`/admin/attendance/${employeeId}/${day.dateKey}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer text-left font-mono text-sm inline-flex items-center gap-1"
                      >
                        {day.dateKey}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {day.branchName}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <span>{formatTime(day.actualIn)}</span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span>{formatTime(day.actualOut)}</span>
                      {day.lateMinutes > 0 && (
                        <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                          (+{day.lateMinutes}m late)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatMinutes(day.netWorkedMinutes)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {day.payableOvertimeMinutes > 0 ? (
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {formatMinutes(day.payableOvertimeMinutes)}
                        </span>
                      ) : day.overtimeMinutes > 0 ? (
                        <span className="text-muted-foreground">
                          {formatMinutes(day.overtimeMinutes)} (calc)
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {day.status === "SETTLED" ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                          Settled
                        </Badge>
                      ) : day.status === "NEEDS_REVIEW" ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                          Review
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {isAutoClosed && (
                          <Badge
                            variant="secondary"
                            className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[10px]"
                          >
                            Auto-Closed
                          </Badge>
                        )}
                        {day.flags
                          .filter((f) => f !== "AUTO_CLOSED")
                          .slice(0, 2)
                          .map((flag) => (
                            <Badge
                              key={flag}
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              {flag.toLowerCase().replace(/_/g, " ")}
                            </Badge>
                          ))}
                        {day.flags.filter((f) => f !== "AUTO_CLOSED").length > 2 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{day.flags.filter((f) => f !== "AUTO_CLOSED").length - 2}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <TableRowActions
                        actions={[
                          {
                            label: "View details",
                            href: `/admin/attendance/${employeeId}/${day.dateKey}`,
                            icon: ExternalLink,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
