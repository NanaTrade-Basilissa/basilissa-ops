import type { AuditLogItem } from "./constants";

export type AuditCategoryTone =
  | "blue"
  | "emerald"
  | "amber"
  | "purple"
  | "rose"
  | "slate"
  | "cyan";

export type FormattedAuditEntry = {
  title: string;
  summary: string | null;
  categoryLabel: string;
  categoryTone: AuditCategoryTone;
  entityLabel: string;
  roleLabel: string;
};

export type AuditDiffRow = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type AuditDetailRow = {
  field: string;
  label: string;
  value: string;
};

const ACTION_LABELS: Record<string, { title: string; category: string; tone: AuditCategoryTone }> = {
  // Authentication & Security
  "auth.login": { title: "Signed in to dashboard", category: "Security", tone: "slate" },
  "auth.login_failed": { title: "Failed sign-in attempt", category: "Security", tone: "rose" },
  "auth.logout": { title: "Signed out of dashboard", category: "Security", tone: "slate" },
  "auth.password_changed": { title: "Changed account password", category: "Security", tone: "amber" },
  "auth.password_reset_requested": { title: "Requested password reset", category: "Security", tone: "amber" },
  "auth.password_reset_completed": { title: "Completed password reset", category: "Security", tone: "amber" },
  "auth.mfa_enrolled": { title: "Enabled two-factor authentication (MFA)", category: "Security", tone: "emerald" },
  "auth.mfa_disabled": { title: "Disabled two-factor authentication (MFA)", category: "Security", tone: "rose" },
  "auth.mfa_reset": { title: "Reset user MFA settings", category: "Security", tone: "amber" },
  "auth.mobile_login": { title: "Signed in on mobile app", category: "Security", tone: "slate" },
  "auth.mobile_logout": { title: "Signed out of mobile app", category: "Security", tone: "slate" },

  // Users & Roles
  "user.created": { title: "Created dashboard user account", category: "Users", tone: "blue" },
  "user.updated": { title: "Updated user account details", category: "Users", tone: "blue" },
  "user.suspended": { title: "Suspended user account", category: "Users", tone: "rose" },
  "user.activated": { title: "Activated user account", category: "Users", tone: "emerald" },
  "user.role_assigned": { title: "Assigned role to user", category: "Roles", tone: "purple" },
  "user.role_revoked": { title: "Removed role from user", category: "Roles", tone: "amber" },
  "role.created": { title: "Created custom role", category: "Roles", tone: "purple" },
  "role.updated": { title: "Updated role permissions", category: "Roles", tone: "purple" },
  "role.deleted": { title: "Deleted custom role", category: "Roles", tone: "rose" },

  // Employees
  "employee.created": { title: "Added new employee", category: "Staff", tone: "blue" },
  "employee.updated": { title: "Updated employee profile", category: "Staff", tone: "blue" },
  "employee.terminated": { title: "Terminated employee", category: "Staff", tone: "rose" },
  "employee.suspended": { title: "Suspended employee", category: "Staff", tone: "amber" },
  "employee.active": { title: "Reactivated employee", category: "Staff", tone: "emerald" },
  "employee.branch_assigned": { title: "Assigned branch to employee", category: "Staff", tone: "blue" },
  "employee.branch_unassigned": { title: "Ended employee branch assignment", category: "Staff", tone: "amber" },
  "employee.imported": { title: "Imported employees in bulk", category: "Staff", tone: "blue" },
  "employee.pin_linked": { title: "Linked biometric/device PIN", category: "Staff", tone: "cyan" },

  // Attendance & Policies
  "attendance_day.resolved": { title: "Resolved attendance day review", category: "Attendance", tone: "emerald" },
  "attendance.manual_entry": { title: "Recorded manual clock-in/out", category: "Attendance", tone: "amber" },
  "attendance.correction_applied": { title: "Applied attendance correction", category: "Attendance", tone: "amber" },
  "attendance.auto_closed": { title: "Auto-closed open shift", category: "Attendance", tone: "slate" },
  "policy.updated": { title: "Updated attendance policy", category: "Attendance", tone: "amber" },
  "holiday.created": { title: "Added public holiday", category: "Attendance", tone: "blue" },
  "holiday.updated": { title: "Updated public holiday", category: "Attendance", tone: "blue" },
  "holiday.deleted": { title: "Removed public holiday", category: "Attendance", tone: "rose" },

  // Leave
  "leave.approved": { title: "Approved leave request", category: "Leave", tone: "emerald" },
  "leave.rejected": { title: "Declined leave request", category: "Leave", tone: "rose" },
  "leave_cycle.created": { title: "Created annual leave cycle", category: "Leave", tone: "blue" },
  "leave_cycle.updated": { title: "Updated annual leave window / busy weeks", category: "Leave", tone: "blue" },
  "leave_cycle.auto_scheduled": { title: "Ran annual leave auto-scheduler", category: "Leave", tone: "purple" },
  "leave_cycle.auto_schedule_reversed": { title: "Undid auto-scheduled annual leave", category: "Leave", tone: "amber" },
  "leave_quota.updated": { title: "Updated branch leave staffing limit", category: "Leave", tone: "blue" },

  // Shifts & Rota
  "shift.created": { title: "Created shift template", category: "Shifts", tone: "cyan" },
  "shift.updated": { title: "Updated shift template", category: "Shifts", tone: "cyan" },
  "shift.assigned": { title: "Assigned shift to employee", category: "Shifts", tone: "cyan" },
  "schedule.override_set": { title: "Set daily shift override", category: "Shifts", tone: "cyan" },
  "schedule.override_cleared": { title: "Cleared daily shift override", category: "Shifts", tone: "amber" },
  "pattern.created": { title: "Created shift rotation pattern", category: "Shifts", tone: "cyan" },
  "pattern.updated": { title: "Updated shift rotation pattern", category: "Shifts", tone: "cyan" },
  "pattern.assigned": { title: "Assigned shift rotation pattern", category: "Shifts", tone: "cyan" },
  "rota.generated": { title: "Generated weekly branch rota", category: "Shifts", tone: "cyan" },
  "rota.auto_toggled": { title: "Toggled automatic rota mode", category: "Shifts", tone: "cyan" },

  // Training Hub
  "training.course_created": { title: "Created training course", category: "Training", tone: "purple" },
  "training.course_updated": { title: "Updated training course", category: "Training", tone: "purple" },
  "training.course_published": { title: "Published training course to staff", category: "Training", tone: "emerald" },
  "training.course_deleted": { title: "Deleted training course", category: "Training", tone: "rose" },
  "training.status_updated": { title: "Changed training course status", category: "Training", tone: "amber" },
  "training.material_added": { title: "Added material to training course", category: "Training", tone: "purple" },
  "training.material_removed": { title: "Removed material from training course", category: "Training", tone: "rose" },
  "training.course_assigned": { title: "Assigned training course to staff", category: "Training", tone: "purple" },

  // Staff Meals
  "meals.menu_saved": { title: "Saved weekly staff meal menu", category: "Meals", tone: "emerald" },
  "meals.menu_published": { title: "Published weekly staff meal menu", category: "Meals", tone: "emerald" },

  // Hosted Files
  "file.uploaded": { title: "Uploaded hosted file", category: "Files", tone: "blue" },
  "file.privacy_changed": { title: "Changed file public/private access", category: "Files", tone: "amber" },
  "file.slug_updated": { title: "Updated file share link", category: "Files", tone: "blue" },
  "file.display_mode_updated": { title: "Updated file viewer mode", category: "Files", tone: "blue" },
  "file.deleted": { title: "Deleted hosted file", category: "Files", tone: "rose" },

  // Branches & Devices
  "branch.created": { title: "Added new branch", category: "Branches", tone: "blue" },
  "branch.updated": { title: "Updated branch details / geofence", category: "Branches", tone: "blue" },
  "branch.activated": { title: "Activated branch", category: "Branches", tone: "emerald" },
  "branch.deactivated": { title: "Deactivated branch", category: "Branches", tone: "rose" },
  "device.created": { title: "Registered attendance terminal", category: "Devices", tone: "cyan" },
  "device.updated": { title: "Updated attendance terminal", category: "Devices", tone: "cyan" },
  "device.deleted": { title: "Removed attendance terminal", category: "Devices", tone: "rose" },

  // Feedback & Questions
  "question.created": { title: "Created customer feedback question", category: "Feedback", tone: "amber" },
  "question.updated": { title: "Updated customer feedback question", category: "Feedback", tone: "amber" },
  "question.activated": { title: "Activated feedback question", category: "Feedback", tone: "emerald" },
  "question.deactivated": { title: "Deactivated feedback question", category: "Feedback", tone: "amber" },
  "question.reordered": { title: "Reordered feedback questions", category: "Feedback", tone: "slate" },
  "feedback.recipients_updated": { title: "Updated feedback email recipients", category: "Feedback", tone: "amber" },

  // Announcements & App Releases
  "announcement.sent": { title: "Sent staff announcement", category: "Announcements", tone: "blue" },
  "announcement.created": { title: "Sent staff announcement", category: "Announcements", tone: "blue" },
  "release.created": { title: "Published mobile app release", category: "App Releases", tone: "emerald" },
  "release.updated": { title: "Updated mobile app release", category: "App Releases", tone: "blue" },
  "release.deleted": { title: "Deleted mobile app release", category: "App Releases", tone: "rose" },

  // Odoo ERP Sync
  "odoo.employees_synced": { title: "Synced employees from Odoo", category: "Odoo Sync", tone: "purple" },
  "odoo.attendance_synced": { title: "Synced attendance to Odoo", category: "Odoo Sync", tone: "purple" },
  "odoo.employee_linked": { title: "Linked employee to Odoo record", category: "Odoo Sync", tone: "purple" },
  "odoo.employee_updated": { title: "Updated employee from Odoo", category: "Odoo Sync", tone: "purple" },
};

const ENTITY_LABELS: Record<string, string> = {
  AttendanceDay: "Attendance Day",
  AttendancePolicy: "Attendance Policy",
  Branch: "Branch",
  BranchLeaveQuota: "Branch Leave Quota",
  CustomRole: "Custom Role",
  Device: "Terminal Device",
  Employee: "Employee",
  FeedbackSubmission: "Customer Feedback",
  Holiday: "Public Holiday",
  HostedFile: "Hosted File",
  LeaveCycle: "Annual Leave Cycle",
  LeaveRequest: "Leave Request",
  MealPlan: "Staff Meal Plan",
  OdooSync: "Odoo ERP Sync",
  Question: "Feedback Question",
  ScheduleException: "Shift Override",
  Shift: "Shift Template",
  ShiftPattern: "Shift Pattern",
  TrainingCourse: "Training Course",
  User: "User Account",
  Announcement: "Announcement",
  AppRelease: "App Release",
  Assessment: "Staff Assessment",
  AptitudeTest: "Aptitude Test",
  EmailJob: "Email Queue",
  BackgroundJob: "System Job",
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMINISTRATOR: "Administrator",
  HR: "HR",
  AREA_MANAGER: "Area Manager",
  BRANCH_MANAGER: "Branch Manager",
  SHIFT_SUPERVISOR: "Shift Supervisor",
  EMPLOYEE: "Employee",
  SYSTEM: "System",
};

const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  employeeCode: "Employee Code",
  employeeName: "Employee",
  jobTitle: "Job Title",
  department: "Department",
  branchName: "Branch",
  branchId: "Branch ID",
  isPrimary: "Primary Branch",
  isActive: "Active",
  isMandatory: "Mandatory",
  isPublic: "Publicly Accessible",
  isRequired: "Required",
  status: "Status",
  decision: "Decision",
  leaveType: "Leave Type",
  startDate: "Start Date",
  endDate: "End Date",
  windowStart: "Window Opens",
  windowEnd: "Window Closes",
  busyWeeksCount: "Busy Weeks Blocked",
  maxConcurrent: "Max Staff Allowed Off",
  managerNotes: "Manager Notes",
  payableOvertimeMinutes: "Approved Overtime",
  employeesProcessed: "Staff Scheduled",
  deletedRequestsCount: "Auto-Scheduled Leaves Removed",
  deletedExceptionsCount: "Roster Days Cleared",
  assignedCount: "Staff Assigned",
  title: "Title",
  name: "Name",
  category: "Category",
  estimatedMinutes: "Estimated Duration",
  passScorePercent: "Pass Mark",
  originalFilename: "File Name",
  slug: "Share Link Slug",
  displayMode: "Viewer Mode",
  text: "Question Text",
  type: "Type",
  order: "Display Order",
  email: "Email",
  phone: "Phone",
  hireDate: "Hire Date",
  validFrom: "Effective From",
  validTo: "Ended On",
  version: "App Version",
  platform: "Platform",
  mandatory: "Mandatory Update",
};

function toTitleCase(input: string): string {
  return input
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? toTitleCase(key);
}

export function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key.toLowerCase().includes("minutes") && value >= 0) {
      const h = Math.floor(value / 60);
      const m = value % 60;
      if (h === 0) return `${m} min`;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }
    if (key.toLowerCase().includes("percent")) return `${value}%`;
    return String(value);
  }
  if (typeof value === "string") {
    // Format ISO timestamps nicely to date
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.map((v) => String(v)).join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asRecord(val: unknown): Record<string, unknown> | null {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return null;
}

function inferCategoryFromAction(action: string, entityType: string): { category: string; tone: AuditCategoryTone } {
  const prefix = action.split(".")[0]?.toLowerCase() ?? "";
  if (prefix === "auth") return { category: "Security", tone: "slate" };
  if (prefix === "user") return { category: "Users", tone: "blue" };
  if (prefix === "role" || entityType === "CustomRole") return { category: "Roles", tone: "purple" };
  if (prefix === "employee") return { category: "Staff", tone: "blue" };
  if (prefix === "leave" || prefix === "leave_cycle" || prefix === "leave_quota") return { category: "Leave", tone: "emerald" };
  if (prefix === "attendance" || prefix === "attendance_day" || prefix === "policy" || prefix === "holiday") return { category: "Attendance", tone: "amber" };
  if (prefix === "shift" || prefix === "schedule" || prefix === "pattern" || prefix === "rota") return { category: "Shifts", tone: "cyan" };
  if (prefix === "training") return { category: "Training", tone: "purple" };
  if (prefix === "meals" || entityType === "MealPlan") return { category: "Meals", tone: "emerald" };
  if (prefix === "file" || entityType === "HostedFile") return { category: "Files", tone: "blue" };
  if (prefix === "branch") return { category: "Branches", tone: "blue" };
  if (prefix === "device") return { category: "Devices", tone: "cyan" };
  if (prefix === "question" || prefix === "feedback") return { category: "Feedback", tone: "amber" };
  if (prefix === "assessment") return { category: "Assessments", tone: "purple" };
  if (prefix === "aptitude") return { category: "Aptitude", tone: "purple" };
  if (prefix === "announcement") return { category: "Announcements", tone: "blue" };
  if (prefix === "release") return { category: "App Releases", tone: "emerald" };
  if (prefix === "odoo") return { category: "Odoo Sync", tone: "purple" };
  return { category: "System", tone: "slate" };
}

function buildSummary(item: AuditLogItem): string | null {
  const after = asRecord(item.after);
  const before = asRecord(item.before);
  const meta = asRecord(item.metadata);
  const data = after ?? before ?? meta;
  if (!data) return null;

  // Leave request summary
  if (item.entityType === "LeaveRequest" && data.employeeName) {
    const dates = data.startDate && data.endDate ? ` (${data.startDate} to ${data.endDate})` : "";
    return `${data.employeeName} · ${data.leaveType ?? "Leave"}${dates}`;
  }

  // Leave quota summary
  if (item.entityType === "BranchLeaveQuota" && data.jobTitle) {
    return `${data.branchName ?? "Branch"} · ${data.jobTitle}: max ${data.maxConcurrent} off/week`;
  }

  // Leave cycle summary
  if (item.entityType === "LeaveCycle") {
    if (typeof data.deletedRequestsCount === "number") {
      return `Removed ${data.deletedRequestsCount} auto-scheduled leave(s) and re-opened cycle`;
    }
    if (typeof data.employeesProcessed === "number") {
      return `Auto-scheduled ${data.employeesProcessed} employee(s)`;
    }
    if (data.year) {
      return `${data.year} cycle · Status: ${data.status ?? ""}${typeof data.busyWeeksCount === "number" ? ` · ${data.busyWeeksCount} busy weeks` : ""}`;
    }
  }

  // Training course summary
  if (item.entityType === "TrainingCourse" && data.title) {
    if (typeof data.assignedCount === "number") {
      return `"${data.title}" · ${data.assignedCount} staff assigned`;
    }
    if (data.status) {
      return `"${data.title}" · Status: ${data.status}`;
    }
    return `"${data.title}"`;
  }

  // Hosted file summary
  if (item.entityType === "HostedFile" && data.title) {
    if (typeof data.isPublic === "boolean") {
      return `"${data.title}" · ${data.isPublic ? "Public" : "Private"}`;
    }
    if (data.slug) return `"${data.title}" (/view/${data.slug})`;
    return `"${data.title}"`;
  }

  // Generic readable summary from common fields
  const parts: string[] = [];
  if (typeof data.firstName === "string" || typeof data.lastName === "string") {
    parts.push(`${data.firstName ?? ""} ${data.lastName ?? ""}`.trim());
  } else if (typeof data.name === "string" && data.name.trim()) {
    parts.push(data.name.trim());
  } else if (typeof data.title === "string" && data.title.trim()) {
    parts.push(`"${data.title.trim()}"`);
  } else if (typeof data.text === "string" && data.text.trim()) {
    parts.push(`"${data.text.trim().slice(0, 60)}"`);
  }

  if (typeof data.branchName === "string" && data.branchName.trim()) {
    parts.push(data.branchName.trim());
  }
  if (typeof data.status === "string" && data.status.trim()) {
    parts.push(`Status: ${toTitleCase(data.status.toLowerCase())}`);
  }
  if (typeof data.version === "string" && data.version.trim()) {
    parts.push(`v${data.version}${data.platform ? ` (${data.platform})` : ""}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatAuditEntry(item: AuditLogItem): FormattedAuditEntry {
  const known = ACTION_LABELS[item.action];
  const fallbackCat = inferCategoryFromAction(item.action, item.entityType);

  const title = known?.title ?? toTitleCase(item.action);
  const categoryLabel = known?.category ?? fallbackCat.category;
  const categoryTone = known?.tone ?? fallbackCat.tone;
  const entityLabel = ENTITY_LABELS[item.entityType] ?? toTitleCase(item.entityType);
  const roleLabel = item.actorRole ? (ROLE_LABELS[item.actorRole] ?? toTitleCase(item.actorRole.toLowerCase())) : "System";

  return {
    title,
    summary: buildSummary(item),
    categoryLabel,
    categoryTone,
    entityLabel,
    roleLabel,
  };
}

/**
 * Extracts human-readable Before vs. After changes when both objects exist.
 */
export function extractAuditDiffs(item: AuditLogItem): AuditDiffRow[] {
  const before = asRecord(item.before);
  const after = asRecord(item.after);
  if (!before || !after) return [];

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const rows: AuditDiffRow[] = [];

  for (const key of keys) {
    const bVal = formatFieldValue(key, before[key]);
    const aVal = formatFieldValue(key, after[key]);
    if (bVal !== aVal) {
      rows.push({
        field: key,
        label: formatFieldLabel(key),
        before: bVal,
        after: aVal,
      });
    }
  }
  return rows;
}

/**
 * Extracts clean key-value details for actions that don't have a before/after diff.
 */
export function extractAuditDetails(item: AuditLogItem): AuditDetailRow[] {
  const source = asRecord(item.after) ?? asRecord(item.before) ?? asRecord(item.metadata);
  if (!source) return [];

  return Object.entries(source)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      field: key,
      label: formatFieldLabel(key),
      value: formatFieldValue(key, value),
    }));
}
