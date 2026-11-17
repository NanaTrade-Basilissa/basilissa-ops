"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileWarning,
  KeyRound,
  Link2,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
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
  OdooReconciliationReport,
} from "@/lib/modules/odoo/server";
import {
  getOdooReconciliationReportAction,
  linkEmployeeOdooIdAction,
  retryOdooAttendanceDayAction,
  syncOdooAttendanceAction,
  syncOdooEmployeesAction,
  testOdooConnectionAction,
  updateLocalEmployeeFromOdooAction,
} from "@/lib/modules/odoo/actions";

type Props = {
  initialConnection: OdooConnectionStatus;
  initialReconciliation?: OdooReconciliationReport | null;
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
  initialReconciliation,
  employeeStats,
  attendanceStats,
  employees,
  recentDays,
  canManage,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [connection, setConnection] = useState<OdooConnectionStatus>(initialConnection);
  const [reconciliation, setReconciliation] = useState<OdooReconciliationReport | null>(
    initialReconciliation ?? null,
  );
  const [activeTab, setActiveTab] = useState<"discrepancies" | "employees" | "attendance">(
    "discrepancies",
  );

  const [discrepancyFilter, setDiscrepancyFilter] = useState<
    "all" | "issues" | "odoo_not_found" | "field_mismatch" | "local_only" | "odoo_duplicate" | "odoo_unmatched" | "matched"
  >("issues");
  const [discrepancySearch, setDiscrepancySearch] = useState<string>("");

  const [empSyncResult, setEmpSyncResult] = useState<OdooEmployeeSyncSummary | null>(null);
  const [attSyncResult, setAttSyncResult] = useState<OdooAttendanceSyncSummary | null>(null);
  const [syncDateKey, setSyncDateKey] = useState<string>("");
  const [empSearch, setEmpSearch] = useState<string>("");
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [editingOdooIdValue, setEditingOdooIdValue] = useState<string>("");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const handleTestConnection = () => {
    startTransition(async () => {
      const status = await testOdooConnectionAction();
      setConnection(status);
    });
  };

  const handleRunAudit = () => {
    setActionMessage(null);
    startTransition(async () => {
      try {
        const report = await getOdooReconciliationReportAction();
        setReconciliation(report);
        setActionMessage({
          type: "success",
          text: `Audit refreshed successfully. Scanned ${report.counts.totalOdoo} Odoo records against ${report.counts.totalLocal} Ops staff.`,
        });
        router.refresh();
      } catch (err) {
        setActionMessage({
          type: "error",
          text: `Failed to refresh audit: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
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

  const handleSaveEmployeeLink = (employeeId: string, odooIdToSave?: string) => {
    setActionMessage(null);
    const targetOdooId = odooIdToSave !== undefined ? odooIdToSave : editingOdooIdValue;
    startTransition(async () => {
      const res = await linkEmployeeOdooIdAction(employeeId, targetOdooId);
      if (!res.ok) {
        setActionMessage({ type: "error", text: res.error ?? "Failed to update Odoo ID" });
        return;
      }
      setEditingEmpId(null);
      setEditingOdooIdValue("");
      // Refresh report
      const updatedReport = await getOdooReconciliationReportAction().catch(() => null);
      if (updatedReport) setReconciliation(updatedReport);
      setActionMessage({ type: "success", text: "Employee Odoo ID successfully linked!" });
      router.refresh();
    });
  };

  const handleAcceptOdooValues = (
    employeeId: string,
    diffs?: { field: string; odooValue: string | null }[],
  ) => {
    if (!diffs || diffs.length === 0) return;
    setActionMessage(null);
    startTransition(async () => {
      const updates: { phone?: string | null; email?: string | null; jobTitle?: string | null } = {};
      for (const d of diffs) {
        if (d.field === "phone") updates.phone = d.odooValue;
        if (d.field === "email") updates.email = d.odooValue;
        if (d.field === "jobTitle") updates.jobTitle = d.odooValue;
      }
      const res = await updateLocalEmployeeFromOdooAction(employeeId, updates);
      if (!res.ok) {
        setActionMessage({ type: "error", text: res.error ?? "Failed to update employee details" });
        return;
      }
      const updatedReport = await getOdooReconciliationReportAction().catch(() => null);
      if (updatedReport) setReconciliation(updatedReport);
      setActionMessage({ type: "success", text: "Local employee profile updated with Odoo values." });
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

  const reconciliationItems = reconciliation?.items ?? [];
  const filteredDiscrepancies = reconciliationItems.filter((item) => {
    // Filter by type
    if (discrepancyFilter === "issues") {
      if (item.kind === "MATCHED" || item.kind === "ODOO_DUPLICATE") return false;
    } else if (discrepancyFilter === "odoo_not_found") {
      if (item.kind !== "ODOO_NOT_FOUND") return false;
    } else if (discrepancyFilter === "field_mismatch") {
      if (item.kind !== "FIELD_MISMATCH") return false;
    } else if (discrepancyFilter === "local_only") {
      if (item.kind !== "LOCAL_ONLY") return false;
    } else if (discrepancyFilter === "odoo_duplicate") {
      if (item.kind !== "ODOO_DUPLICATE") return false;
    } else if (discrepancyFilter === "odoo_unmatched") {
      if (item.kind !== "ODOO_UNMATCHED") return false;
    } else if (discrepancyFilter === "matched") {
      if (item.kind !== "MATCHED") return false;
    }

    // Filter by search text
    if (!discrepancySearch.trim()) return true;
    const q = discrepancySearch.toLowerCase();
    return (
      (item.localName ?? "").toLowerCase().includes(q) ||
      (item.localEmployeeCode ?? "").toLowerCase().includes(q) ||
      (item.odooName ?? "").toLowerCase().includes(q) ||
      (item.odooEmployeeId ?? "").toLowerCase().includes(q) ||
      (item.suggestedOdooId ?? "").toLowerCase().includes(q) ||
      (item.message ?? "").toLowerCase().includes(q)
    );
  });

  const totalIssuesCount =
    (reconciliation?.counts.odooNotFound ?? 0) +
    (reconciliation?.counts.fieldMismatches ?? 0) +
    (reconciliation?.counts.localOnly ?? 0);

  return (
    <div className="space-y-6">
      {/* Connection & Schedule Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Server className="h-5 w-5 text-slate-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Odoo 17 ERP Integration
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
                    ? "Configured (Unreachable)"
                    : "Not Configured"}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {connection.baseUrl ? (
                <>
                  Endpoint: <span className="font-mono">{connection.baseUrl}</span> · Mode:{" "}
                  {AUTH_MODE_LABELS[connection.authMode]}
                </>
              ) : (
                "Set ODOO_API_URL and ODOO_API_KEY to connect."
              )}
            </p>
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
                onClick={handleRunAudit}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
              >
                <Search className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                Scan Odoo Discrepancies
              </button>
            )}
          </div>
        </div>

        {actionMessage && (
          <div
            className={`mt-4 rounded-lg border p-3 text-xs flex items-center justify-between ${
              actionMessage.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-slate-500 hover:text-slate-800 font-semibold px-2"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Local Staff Mapped</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {employeeStats.linked}{" "}
            <span className="text-sm font-normal text-slate-500">/ {employeeStats.total}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {employeeStats.unlinked} unlinked local staff
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Aligned with Odoo</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {reconciliation?.counts.matched ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">1:1 clean match with Odoo</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Action Items Flagged</div>
          <div className={`mt-1 text-2xl font-bold ${totalIssuesCount > 0 ? "text-amber-600" : "text-emerald-700"}`}>
            {totalIssuesCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {reconciliation?.counts.odooNotFound ?? 0} missing in Odoo · {reconciliation?.counts.fieldMismatches ?? 0} mismatches
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Odoo Duplicates (Batch 2)</div>
          <div className="mt-1 text-2xl font-bold text-slate-600">
            {reconciliation?.counts.odooDuplicates ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Redundant copies on Odoo</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("discrepancies")}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === "discrepancies"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Discrepancies & Audit
            {totalIssuesCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                {totalIssuesCount}
              </span>
            )}
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
            Employee ID Directory ({employees.length})
          </button>
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
        </div>
      </div>

      {/* TAB 1: DISCREPANCIES & AUDIT */}
      {activeTab === "discrepancies" && (
        <div className="space-y-4">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setDiscrepancyFilter("issues")}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  discrepancyFilter === "issues"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Needs Review ({totalIssuesCount})
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyFilter("odoo_not_found")}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  discrepancyFilter === "odoo_not_found"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                }`}
              >
                Missing / Deleted in Odoo ({reconciliation?.counts.odooNotFound ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyFilter("field_mismatch")}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  discrepancyFilter === "field_mismatch"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                Field Mismatches ({reconciliation?.counts.fieldMismatches ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyFilter("local_only")}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  discrepancyFilter === "local_only"
                    ? "bg-purple-600 text-white"
                    : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                }`}
              >
                In Ops Only ({reconciliation?.counts.localOnly ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyFilter("odoo_duplicate")}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  discrepancyFilter === "odoo_duplicate"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Odoo Duplicates ({reconciliation?.counts.odooDuplicates ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyFilter("odoo_unmatched")}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  discrepancyFilter === "odoo_unmatched"
                    ? "bg-sky-600 text-white"
                    : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                }`}
              >
                In Odoo Only ({reconciliation?.counts.odooUnmatched ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyFilter("matched")}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  discrepancyFilter === "matched"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                Aligned ({reconciliation?.counts.matched ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyFilter("all")}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  discrepancyFilter === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Show All ({reconciliationItems.length})
              </button>
            </div>

            <div className="relative w-full max-w-xs">
              <input
                type="search"
                value={discrepancySearch}
                onChange={(e) => setDiscrepancySearch(e.target.value)}
                placeholder="Search flagged items..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Discrepancy List */}
          <div className="space-y-2.5">
            {filteredDiscrepancies.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                No discrepancy items found matching this filter.
              </div>
            ) : (
              filteredDiscrepancies.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 transition-shadow bg-white ${
                    item.kind === "ODOO_NOT_FOUND"
                      ? "border-rose-200 bg-rose-50/20"
                      : item.kind === "FIELD_MISMATCH"
                        ? "border-amber-200 bg-amber-50/20"
                        : item.kind === "LOCAL_ONLY"
                          ? "border-purple-200 bg-purple-50/20"
                          : item.kind === "ODOO_DUPLICATE"
                            ? "border-slate-200 bg-slate-50/50"
                            : item.kind === "ODOO_UNMATCHED"
                              ? "border-sky-200 bg-sky-50/20"
                              : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.kind === "ODOO_NOT_FOUND" && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                            <AlertCircle className="h-3 w-3" />
                            Deleted from Odoo
                          </span>
                        )}
                        {item.kind === "FIELD_MISMATCH" && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            <AlertTriangle className="h-3 w-3" />
                            Data Mismatch
                          </span>
                        )}
                        {item.kind === "LOCAL_ONLY" && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-800">
                            <Users className="h-3 w-3" />
                            In Ops Only
                          </span>
                        )}
                        {item.kind === "ODOO_DUPLICATE" && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            <Copy className="h-3 w-3" />
                            Odoo Batch 2 Duplicate
                          </span>
                        )}
                        {item.kind === "ODOO_UNMATCHED" && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                            <FileWarning className="h-3 w-3" />
                            In Odoo Only
                          </span>
                        )}
                        {item.kind === "MATCHED" && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Aligned
                          </span>
                        )}

                        <span className="text-sm font-semibold text-slate-900">
                          {item.localName ?? item.odooName}
                        </span>

                        {item.localEmployeeCode && (
                          <span className="font-mono text-xs text-slate-500">
                            [{item.localEmployeeCode}]
                          </span>
                        )}

                        {item.odooEmployeeId && (
                          <span className="font-mono text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            Odoo #{item.odooEmployeeId}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600">{item.message}</div>

                      {/* Field Differences Table */}
                      {item.diffs && item.diffs.length > 0 && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2 text-xs">
                          <div className="font-medium text-amber-900 mb-1">Differences detected:</div>
                          <div className="grid grid-cols-3 gap-2 text-[11px]">
                            {item.diffs.map((d, idx) => (
                              <div key={idx} className="bg-white p-1.5 rounded border border-amber-200/60">
                                <div className="text-slate-500 font-semibold">{d.fieldLabel}</div>
                                <div className="text-slate-800">
                                  Ops: <span className="font-mono">{d.localValue || "None"}</span>
                                </div>
                                <div className="text-indigo-700">
                                  Odoo: <span className="font-mono">{d.odooValue || "None"}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Deleted in Odoo - Suggestion */}
                      {item.kind === "ODOO_NOT_FOUND" && item.suggestedOdooId && (
                        <div className="mt-2 text-xs text-rose-900 bg-rose-100/60 p-2 rounded-lg border border-rose-200">
                          <strong>Survivor Detected in Odoo:</strong> Record{" "}
                          <span className="font-mono font-bold">#{item.suggestedOdooId}</span> (
                          {item.suggestedOdooName}) exists in Odoo with the same name.
                        </div>
                      )}

                      {/* Odoo Duplicate Note */}
                      {item.kind === "ODOO_DUPLICATE" && (
                        <div className="mt-1 text-xs text-slate-500">
                          This Odoo record is safe to delete or archive directly in Odoo HR. Our system is
                          correctly linked to the primary record #{item.duplicateOfOdooId}{" "}
                          {item.duplicateOfLocalCode ? `(${item.duplicateOfLocalCode})` : ""}.
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    {canManage && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
                        {item.kind === "ODOO_NOT_FOUND" && item.localEmployeeId && item.suggestedOdooId && (
                          <button
                            type="button"
                            onClick={() => handleSaveEmployeeLink(item.localEmployeeId!, item.suggestedOdooId!)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            <Link2 className="h-3 w-3" />
                            Relink to #{item.suggestedOdooId}
                          </button>
                        )}

                        {item.kind === "FIELD_MISMATCH" && item.localEmployeeId && (
                          <button
                            type="button"
                            onClick={() => handleAcceptOdooValues(item.localEmployeeId!, item.diffs)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Update Local from Odoo
                          </button>
                        )}

                        {item.kind === "LOCAL_ONLY" && item.localEmployeeId && (
                          item.suggestedOdooId ? (
                            <button
                              type="button"
                              onClick={() => handleSaveEmployeeLink(item.localEmployeeId!, item.suggestedOdooId!)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                            >
                              <Link2 className="h-3 w-3" />
                              Link to #{item.suggestedOdooId}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("employees");
                                setEmpSearch(item.localEmployeeCode || "");
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Manual Link
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EMPLOYEE ID DIRECTORY */}
      {activeTab === "employees" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              placeholder="Search by name, employee code, email, or Odoo ID..."
              className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
            />
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
                            placeholder="e.g. 3041"
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

      {/* TAB 3: ATTENDANCE SYNC */}
      {activeTab === "attendance" && (
        <div className="space-y-4">
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
      )}
    </div>
  );
}
