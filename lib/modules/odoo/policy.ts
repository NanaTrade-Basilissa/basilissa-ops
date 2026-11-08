import { DEPARTMENT_BRANCHES, HEAD_OFFICE, splitEmployeeName, type BranchSpec } from "@/lib/modules/employees/import";
import { inferDepartmentFromJobTitle } from "@/lib/modules/employees/constants";

/**
 * Pure business rules for Odoo 17 integration.
 *
 * Deliberately free of Prisma, network I/O, and `server-only` so that:
 * 1. UTC datetime formatting (`"YYYY-MM-DD HH:MM:SS"`)
 * 2. Effective clock-in / clock-out calculation with approved-overtime gating
 * 3. Employee matching & normalization from Odoo's `hr.employee`
 * can all be unit-tested exhaustively in isolation.
 */

export type OdooAttendanceDayInput = {
  actualIn: Date | null;
  actualOut: Date | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  overtimeMinutes: number;
  payableOvertimeMinutes: number;
};

export type EffectiveOdooAttendanceWindow =
  | {
      ok: true;
      checkIn: Date;
      checkOut: Date;
      checkInUtc: string;
      checkOutUtc: string;
      /** True when unapproved overtime caused checkOut to be capped at scheduledEnd. */
      cappedAtScheduledEnd: boolean;
      /** True when approved/overridden overtime determined the closing timestamp. */
      includesApprovedOvertime: boolean;
    }
  | {
      ok: false;
      reason: "MISSING_PUNCH" | "CHECK_OUT_NOT_AFTER_CHECK_IN";
    };

/**
 * Formats a JavaScript Date as Odoo's required naive UTC datetime string:
 * `"YYYY-MM-DD HH:MM:SS"`.
 */
export function formatOdooUtcDatetime(date: Date): string {
  const iso = date.toISOString(); // e.g. "2026-11-05T17:00:00.000Z"
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/**
 * Parses an Odoo naive UTC datetime string (`"YYYY-MM-DD HH:MM:SS"`) into a Date.
 */
export function parseOdooUtcDatetime(value: string): Date {
  const normalized = value.trim().replace(" ", "T");
  return new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
}

/**
 * Computes the effective `check_in` and `check_out` timestamps to send to Odoo.
 *
 * Rules:
 * - Odoo computes `worked_hours` and `overtime_hours` automatically from the difference
 *   between `check_in` and `check_out`.
 * - "If it's not approved, it's not overtime":
 *   When an employee clocks out past `scheduledEnd` and earns `overtimeMinutes > 0`,
 *   if `payableOvertimeMinutes <= 0` (not approved), `check_out` is capped at
 *   `scheduledEnd` so Odoo does not award unauthorized overtime.
 * - When overtime IS approved (`payableOvertimeMinutes > 0`) or overridden by a manager:
 *   - If full actual overtime was approved (`overtimeMinutes > 0 && payableOvertimeMinutes === overtimeMinutes`),
 *     we send `actualOut` (the time the employee clocked out into that overtime).
 *   - If a specific `payableOvertimeMinutes` amount was approved/overridden on a scheduled shift,
 *     we send `scheduledEnd + payableOvertimeMinutes` (or `actualOut` when there is no `scheduledEnd`,
 *     such as an unscheduled/extra shift).
 */
export function resolveEffectiveOdooAttendanceWindow(
  input: OdooAttendanceDayInput,
): EffectiveOdooAttendanceWindow {
  const { actualIn, actualOut, scheduledEnd, overtimeMinutes, payableOvertimeMinutes } = input;

  if (!actualIn || !actualOut) {
    return { ok: false, reason: "MISSING_PUNCH" };
  }

  const checkIn = actualIn;
  let checkOut = actualOut;
  let cappedAtScheduledEnd = false;
  let includesApprovedOvertime = false;

  if (payableOvertimeMinutes > 0) {
    includesApprovedOvertime = true;
    if (scheduledEnd) {
      if (overtimeMinutes > 0 && payableOvertimeMinutes === overtimeMinutes) {
        checkOut = actualOut;
      } else {
        checkOut = new Date(scheduledEnd.getTime() + payableOvertimeMinutes * 60_000);
      }
    } else {
      checkOut = actualOut;
    }
  } else if (scheduledEnd && actualOut.getTime() > scheduledEnd.getTime() && overtimeMinutes > 0) {
    // Overtime was worked but NOT approved: cap closing time at scheduledEnd
    checkOut = scheduledEnd;
    cappedAtScheduledEnd = true;
  }

  if (checkOut.getTime() <= checkIn.getTime()) {
    return { ok: false, reason: "CHECK_OUT_NOT_AFTER_CHECK_IN" };
  }

  return {
    ok: true,
    checkIn,
    checkOut,
    checkInUtc: formatOdooUtcDatetime(checkIn),
    checkOutUtc: formatOdooUtcDatetime(checkOut),
    cappedAtScheduledEnd,
    includesApprovedOvertime,
  };
}

export type RawOdooEmployeeRecord = {
  id: number;
  name: string | false;
  job_title?: string | false;
  work_email?: string | false;
  work_phone?: string | false;
  mobile_phone?: string | false;
  department_id?: [number, string] | false;
  company_id?: [number, string] | false;
  active?: boolean;
};

export type NormalizedOdooEmployee = {
  odooEmployeeId: string;
  rawName: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  odooDepartmentName: string;
  branchSpec: BranchSpec;
  email: string | null;
  phone: string | null;
  isActive: boolean;
};

function cleanOdooString(val: string | false | null | undefined): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePhoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

function normalizeNameToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveBranchSpecForOdooEmployee(departmentName: string, companyName: string): BranchSpec {
  const deptTrimmed = departmentName.trim();
  if (DEPARTMENT_BRANCHES[deptTrimmed]) {
    return DEPARTMENT_BRANCHES[deptTrimmed];
  }

  const combined = `${deptTrimmed} ${companyName.trim()}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const spec of Object.values(DEPARTMENT_BRANCHES)) {
    if (combined.includes(spec.keyword)) {
      return spec;
    }
  }

  return HEAD_OFFICE;
}

/**
 * Normalizes a raw `hr.employee` or `hr.employee.public` record from Odoo.
 */
export function normalizeOdooEmployee(raw: RawOdooEmployeeRecord): NormalizedOdooEmployee | null {
  const rawName = cleanOdooString(raw.name);
  if (!rawName) return null;

  const split = splitEmployeeName(rawName);
  const firstName = split ? split.firstName : rawName;
  const lastName = split ? split.lastName : "Staff";

  const jobTitle = cleanOdooString(raw.job_title);
  const email = cleanOdooString(raw.work_email)?.toLowerCase() ?? null;
  const phone = cleanOdooString(raw.work_phone) ?? cleanOdooString(raw.mobile_phone) ?? null;

  const odooDepartmentName = Array.isArray(raw.department_id) ? raw.department_id[1] : "";
  const odooCompanyName = Array.isArray(raw.company_id) ? raw.company_id[1] : "";
  const branchSpec = resolveBranchSpecForOdooEmployee(odooDepartmentName, odooCompanyName);
  const department = inferDepartmentFromJobTitle(jobTitle);

  return {
    odooEmployeeId: String(raw.id),
    rawName,
    firstName,
    lastName,
    jobTitle,
    department,
    odooDepartmentName,
    branchSpec,
    email,
    phone,
    isActive: raw.active !== false,
  };
}

export type LocalEmployeeCandidate = {
  id: string;
  odooEmployeeId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
};

export type EmployeeMatchOutcome =
  | { kind: "already_linked"; localEmployeeId: string }
  | { kind: "link_existing"; localEmployeeId: string; matchedBy: "email" | "phone" | "name" }
  | { kind: "create_new" };

/**
 * Matches a normalized Odoo employee against existing local employee records.
 *
 * 1. If a local employee already carries `odooEmployeeId`, returns `already_linked`.
 * 2. Otherwise searches unlinked local employees (`odooEmployeeId === null`) by:
 *    - unique case-insensitive email match
 *    - unique 9-digit phone suffix match
 *    - unique normalized full-name match (either `firstName + lastName` or `lastName + firstName`)
 * 3. If no unique match exists, returns `create_new`.
 */
export function matchOdooEmployeeToLocal(
  odooEmp: NormalizedOdooEmployee,
  localEmployees: readonly LocalEmployeeCandidate[],
): EmployeeMatchOutcome {
  const exactIdMatch = localEmployees.find((e) => e.odooEmployeeId === odooEmp.odooEmployeeId);
  if (exactIdMatch) {
    return { kind: "already_linked", localEmployeeId: exactIdMatch.id };
  }

  const unlinked = localEmployees.filter((e) => !e.odooEmployeeId);

  if (odooEmp.email) {
    const targetEmail = odooEmp.email.toLowerCase();
    const emailMatches = unlinked.filter((e) => e.email?.trim().toLowerCase() === targetEmail);
    if (emailMatches.length === 1) {
      return { kind: "link_existing", localEmployeeId: emailMatches[0].id, matchedBy: "email" };
    }
  }

  const targetPhone = normalizePhoneKey(odooEmp.phone);
  if (targetPhone) {
    const phoneMatches = unlinked.filter((e) => normalizePhoneKey(e.phone) === targetPhone);
    if (phoneMatches.length === 1) {
      return { kind: "link_existing", localEmployeeId: phoneMatches[0].id, matchedBy: "phone" };
    }
  }

  const odooForwardKey = `${normalizeNameToken(odooEmp.firstName)}|${normalizeNameToken(odooEmp.lastName)}`;
  const odooReverseKey = `${normalizeNameToken(odooEmp.lastName)}|${normalizeNameToken(odooEmp.firstName)}`;

  const nameMatches = unlinked.filter((e) => {
    const localKey = `${normalizeNameToken(e.firstName)}|${normalizeNameToken(e.lastName)}`;
    return localKey === odooForwardKey || localKey === odooReverseKey;
  });

  if (nameMatches.length === 1) {
    return { kind: "link_existing", localEmployeeId: nameMatches[0].id, matchedBy: "name" };
  }

  return { kind: "create_new" };
}
