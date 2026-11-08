"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  KeyRound,
  Link2,
  RefreshCw,
  Server,
  Users,
} from "lucide-react";
import type {
  OdooAttendanceSyncSummary,
  OdooConnectionStatus,
  OdooEmployeeSyncSummary,
} from "@/lib/modules/odoo/constants";
import type {
  OdooAttendanceDayRow,
  OdooEmployeeMappingRow,
} from "@/lib/modules/odoo/server";
import {
  linkEmployeeOdooIdAction,
  retryOdooAttendanceDayAction,
  syncOdooAttendanceAction,
  syncOdooEmployeesAction,
  testOdooConnectionAction,
} from "@/lib/modules/odoo/actions";

type Props = {
  initialConnection: OdooConnectionStatus;
  employeeStats: {
    total: number;
    linked: number;
    unlinked: number;
  };
  attendanceStats: {
    pending: number;
    synced: number;
    failed: number;
    skipped: number;
  };
  employees: OdooEmployeeMappingRow[];
  recentDays: OdooAttendanceDayRow[];
  canManage: boolean;
};

const AUTH_MODE_LABELS: Record<OdooConnectionStatus["authMode"], string> = {
  api_key: "X-API-Key (System-to-System)",
  bearer_token: "Static Bearer Token",
  login_fallback: "Temporary Login Fallback (Dev Testing)",
  unconfigured: "Unconfigured",
};

export function OdooSyncPanel({
  initialConnection,
  employeeStats,
  attendanceStats,
  employees,
  recentDays,
  canManage,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [connection, setConnection] = useState<OdooConnectionStatus>(initialConnection);
  const [activeTab, setActiveTab] = useState<"attendance" | "employees">("attendance");

  const [empSyncResult, setEmpSyncResult] = useState<OdooEmployeeSyncSummary | null>(null);
  const [attSyncResult, setAttSyncResult] = useState<OdooAttendanceSyncSummary | null>(null);
  const [syncDateKey, setSyncDateKey] = useState<string>("");
  const [empSearch, setEmpSearch] = useState<string>("");
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [editingOdooIdValue, setEditingOdooIdValue] = useState<string>("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const handleTestConnection = () => {
    startTransition(async () => {
      const status = await testOdooConnectionAction();
      setConnection(status);
    });
  };

  const handleSyncEmployees = () => {
    setEmpSyncResult(null);
    startTransition(async () => {
      const res = await syncOdooEmployeesAction();
      setEmpSyncResult(res);
      router.refresh();
    });
  };

  const handleSyncAttendance = () => {
    setAttSyncResult(null);
    startTransition(async () => {
      const res = await syncOdooAttendanceAction({
        dateKey: syncDateKey || undefined,
        lookbackDays: 7,
      });
      setAttSyncResult(res);
      router.refresh();
    });
  };

  const handleRetryDay = (attendanceDayId: string) => {
    setAttSyncResult(null);
    startTransition(async () => {
      const res = await retryOdooAttendanceDayAction(attendanceDayId);
      setAttSyncResult(res);
      router.refresh();
    });
  };

  const handleSaveEmployeeLink = (employeeId: string) => {
    setLinkError(null);
    startTransition(async () => {
      const res = await linkEmployeeOdooIdAction(employeeId, editingOdooIdValue);
      if (!res.ok) {
        setLinkError(res.error ?? "Failed to update Odoo ID");
        return;
      }
      setEditingEmpId(null);
      setEditingOdooIdValue("");
      router.refresh();
    });
  };

  const filteredEmployees = employees.filter((emp) => {
    if (!empSearch.trim()) return true;
    const q = empSearch.toLowerCase();
    return (
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q) ||
      emp.employeeCode.toLowerCase().includes(q) ||
      (emp.odooEmployeeId ?? "").toLowerCase().includes(q) ||
      (emp.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Connection & Schedule Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Server className="h-5 w-5 text-slate-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Odoo 17 REST API Connection
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  connection.reachable
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                    : connection.configured
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    connection.reachable
                      ? "bg-emerald-500"
                      : connection.configured
                        ? "bg-amber-500"
                        : "bg-slate-400"
                  }`}
                />
                {connection.reachable
                  ? "Connected"
                  : connection.configured
                    ? "Unreachable"
                    : "Unconfigured"}
              </span>
            </div>
            <p className="text-sm text-slate-600">{connection.message}</p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-500">
              <span>
                <strong>Endpoint:</strong>{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5">
                  {connection.baseUrl ?? "Not set (ODOO_API_URL)"}
                </code>
              </span>
              <span>
                <strong>X-Odoo-Db:</strong>{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5">
                  {connection.database ?? "Not set (ODOO_DB)"}
                </code>
              </span>
              <span className="inline-flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                <strong>Auth:</strong> {AUTH_MODE_LABELS[connection.authMode]}
                {connection.authenticatedAs ? ` (${connection.authenticatedAs})` : ""}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <strong>Daily Cron:</strong> Every 12:00 AM (Midnight)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
              Test Connection
            </button>
            {canManage && (
              <button
                type="button"
                onClick={handleSyncEmployees}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Users className="h-3.5 w-3.5" />
                Pull Employees from Odoo
              </button>
            )}
          </div>
        </div>

        {empSyncResult && (
          <div
            className={`mt-4 rounded-lg border p-3 text-xs ${
              empSyncResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="font-semibold">
              Employee Sync Result ({empSyncResult.modelUsed ?? "no model"}):{" "}
              {empSyncResult.totalFetched} fetched · {empSyncResult.linkedExisting} newly linked ·{" "}
              {empSyncResult.updatedExisting} updated · {empSyncResult.createdNew} created ·{" "}
              {empSyncResult.skipped} skipped
            </div>
            {empSyncResult.errors.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4 text-rose-700">
                {empSyncResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Employees Linked to Odoo</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {employeeStats.linked}{" "}
            <span className="text-sm font-normal text-slate-500">/ {employeeStats.total}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {employeeStats.unlinked} unlinked local records
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Attendance Synced</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {attendanceStats.synced}
          </div>
          <div className="mt-1 text-xs text-slate-500">Confirmed in Odoo hr.attendance</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Pending Midnight Sync</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">
            {attendanceStats.pending}
          </div>
          <div className="mt-1 text-xs text-slate-500">Queued for 12:00 AM sweep</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Rejected / Needs Review</div>
          <div className="mt-1 text-2xl font-bold text-rose-700">
            {attendanceStats.failed}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {attendanceStats.skipped} skipped (unlinked / missing out)
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("attendance")}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === "attendance"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            End-of-Day Attendance Sync ({recentDays.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("employees")}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === "employees"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Employee ID Mapping ({employees.length})
          </button>
        </div>
      </div>

      {activeTab === "attendance" ? (
        <div className="space-y-4">
          {/* Manual Trigger Bar */}
          {canManage && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-slate-900">
                  Manual Attendance Sync (Test / On-Demand)
                </div>
                <div className="text-xs text-slate-600">
                  Unapproved overtime is capped at scheduled shift end. Approved overtime sends the
                  overtime closing timestamp so Odoo calculates overtime automatically.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={syncDateKey}
                  onChange={(e) => setSyncDateKey(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                  placeholder="Optional work date"
                />
                <button
                  type="button"
                  onClick={handleSyncAttendance}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                  {syncDateKey ? `Sync ${syncDateKey}` : "Sync Past 7 Days"}
                </button>
              </div>
            </div>
          )}

          {attSyncResult && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                attSyncResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <strong>Attendance Sync Summary:</strong> {attSyncResult.examined} examined ·{" "}
              {attSyncResult.created} created in Odoo · {attSyncResult.updated} updated in Odoo ·{" "}
              {attSyncResult.alreadySynced} already synced · {attSyncResult.skipped} skipped ·{" "}
              {attSyncResult.failed} failed
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Work Date</th>
                  <th className="px-4 py-3 font-semibold">Raw Punch (UTC)</th>
                  <th className="px-4 py-3 font-semibold">Overtime</th>
                  <th className="px-4 py-3 font-semibold">Effective Payload → Odoo (UTC)</th>
                  <th className="px-4 py-3 font-semibold">Odoo Status</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentDays.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No completed attendance days with both clock-in and clock-out yet.
                    </td>
                  </tr>
                ) : (
                  recentDays.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.employeeName}</div>
                        <div className="text-[11px] text-slate-500">
                          {row.employeeCode} ·{" "}
                          {row.odooEmployeeId ? (
                            <span className="text-emerald-700">Odoo #{row.odooEmployeeId}</span>
                          ) : (
                            <span className="text-amber-600">Unlinked</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{row.workDate}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                        <div>In: {row.actualInIso ? row.actualInIso.slice(11, 19) : "—"}</div>
                        <div>Out: {row.actualOutIso ? row.actualOutIso.slice(11, 19) : "—"}</div>
                        {row.scheduledEndIso && (
                          <div className="text-slate-400">
                            Sched End: {row.scheduledEndIso.slice(11, 19)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>Calc OT: {row.overtimeMinutes}m</div>
                        <div
                          className={
                            row.payableOvertimeMinutes > 0
                              ? "font-semibold text-emerald-700"
                              : "text-slate-500"
                          }
                        >
                          Approved OT: {row.payableOvertimeMinutes}m
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.effectiveCheckInUtc && row.effectiveCheckOutUtc ? (
                          <div className="space-y-1">
                            <div className="font-mono text-[11px] text-slate-800">
                              {row.effectiveCheckInUtc} → {row.effectiveCheckOutUtc}
                            </div>
                            {row.cappedAtScheduledEnd && (
                              <span className="inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                Capped at Sched End (Unapproved OT)
                              </span>
                            )}
                            {row.includesApprovedOvertime && (
                              <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                                Includes Approved OT ({row.payableOvertimeMinutes}m)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {row.odooSyncStatus === "SYNCED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              SYNCED {row.odooAttendanceId ? `#${row.odooAttendanceId}` : ""}
                            </span>
                          ) : row.odooSyncStatus === "FAILED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                              <AlertCircle className="h-3 w-3" />
                              FAILED
                            </span>
                          ) : row.odooSyncStatus === "SKIPPED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              SKIPPED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                              PENDING
                            </span>
                          )}
                        </div>
                        {row.odooSyncError && (
                          <div className="mt-1 max-w-xs text-[11px] text-rose-600">
                            {row.odooSyncError}
                          </div>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRetryDay(row.id)}
                            disabled={isPending || !row.odooEmployeeId}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            {row.odooSyncStatus === "SYNCED" ? "Re-sync" : "Push Now"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              placeholder="Search by name, employee code, email, or Odoo ID..."
              className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
            />
            {linkError && <div className="text-xs font-medium text-rose-600">{linkError}</div>}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Job Title</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Master Source</th>
                  <th className="px-4 py-3 font-semibold">Odoo Employee ID</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Link</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const isEditing = editingEmpId === emp.id;
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {emp.firstName} {emp.lastName}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">{emp.employeeCode}</td>
                      <td className="px-4 py-3 text-slate-600">{emp.jobTitle ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500">
                        <div>{emp.email ?? "—"}</div>
                        <div>{emp.phone ?? ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            emp.masterSource === "ODOO"
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {emp.masterSource}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingOdooIdValue}
                            onChange={(e) => setEditingOdooIdValue(e.target.value)}
                            placeholder="e.g. 2"
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        ) : emp.odooEmployeeId ? (
                          <span className="font-semibold text-emerald-700">
                            #{emp.odooEmployeeId}
                          </span>
                        ) : (
                          <span className="text-amber-600">Not linked</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveEmployeeLink(emp.id)}
                                disabled={isPending}
                                className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmpId(null);
                                  setLinkError(null);
                                }}
                                className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEmpId(emp.id);
                                setEditingOdooIdValue(emp.odooEmployeeId ?? "");
                                setLinkError(null);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Link2 className="h-3 w-3" />
                              {emp.odooEmployeeId ? "Edit ID" : "Link ID"}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
