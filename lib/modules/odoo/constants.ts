export type OdooAuthMode = "api_key" | "bearer_token" | "login_fallback" | "unconfigured";

export type OdooConnectionStatus = {
  configured: boolean;
  reachable: boolean;
  authMode: OdooAuthMode;
  baseUrl: string | null;
  database: string | null;
  message: string;
  authenticatedAs?: string | null;
};

export type OdooEmployeeSyncSummary = {
  ok: boolean;
  modelUsed: "hr.employee" | "hr.employee.public" | null;
  totalFetched: number;
  linkedExisting: number;
  updatedExisting: number;
  createdNew: number;
  skipped: number;
  errors: string[];
};

export type OdooAttendanceSyncItemResult = {
  attendanceDayId: string;
  employeeId: string;
  employeeName: string;
  odooEmployeeId: string;
  workDate: string;
  action: "created" | "updated" | "already_synced" | "skipped" | "failed";
  odooAttendanceId?: number | null;
  checkInUtc?: string;
  checkOutUtc?: string;
  cappedAtScheduledEnd?: boolean;
  error?: string;
};

export type OdooAttendanceSyncSummary = {
  ok: boolean;
  examined: number;
  created: number;
  updated: number;
  alreadySynced: number;
  skipped: number;
  failed: number;
  items: OdooAttendanceSyncItemResult[];
};
