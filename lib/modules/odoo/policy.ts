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
  /** Optional attendance day flags (e.g. UNSCHEDULED, MISSING_CLOCK_OUT, AUTO_CLOSED). */
  flags?: readonly string[];
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
      reason:
        | "MISSING_PUNCH"
        | "UNSCHEDULED_UNAPPROVED"
        | "UNRESOLVED_PUNCH_EXCEPTION"
        | "CHECK_OUT_NOT_AFTER_CHECK_IN";
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
const ODOO_BLOCKING_PUNCH_FLAGS = new Set([
  "MISSING_CLOCK_IN",
  "MISSING_CLOCK_OUT",
  "UNPAIRED_BREAK",
  "DUPLICATE_CLOCK_IN",
]);

export function resolveEffectiveOdooAttendanceWindow(
  input: OdooAttendanceDayInput,
): EffectiveOdooAttendanceWindow {
  const {
    actualIn,
    actualOut,
    scheduledStart,
    scheduledEnd,
    overtimeMinutes,
    payableOvertimeMinutes,
    flags = [],
  } = input;

  if (!actualIn || !actualOut) {
    return { ok: false, reason: "MISSING_PUNCH" };
  }

  // Only clean final records go to Odoo: block any unresolved punch exceptions
  // (e.g. missing clock-in/out, unpaired break, duplicate clock-in).
  // Note: AUTO_CLOSED is intentionally allowed because it carries a valid
  // SYSTEM_AUTO_CLOSE clock-out at scheduledEnd.
  if (flags.some((f) => ODOO_BLOCKING_PUNCH_FLAGS.has(f))) {
    return { ok: false, reason: "UNRESOLVED_PUNCH_EXCEPTION" };
  }

  // Unscheduled days are never payable or synced to Odoo unless explicitly
  // approved (either by assigning a schedule override which clears UNSCHEDULED,
  // or by approving payable overtime).
  const isUnscheduled = flags.includes("UNSCHEDULED") || (!scheduledStart && !scheduledEnd);
  if (isUnscheduled && payableOvertimeMinutes <= 0) {
    return { ok: false, reason: "UNSCHEDULED_UNAPPROVED" };
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
  job_id?: [number, string] | false;
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
  const digits = phone.trim().replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

export function normalizeEmailKey(email: string | null | undefined): string | null {
  if (!email) return null;
  const cleaned = email.trim().replace(/\s+/g, "").toLowerCase();
  return cleaned.length > 0 && cleaned.includes("@") ? cleaned : null;
}

/**
 * Strict search-before-create matcher for Ops → Odoo employee pushes.
 * Checks BOTH work_phone and mobile_phone on every Odoo record using trimmed,
 * normalized 9-digit phone keys, then trimmed/lowercased email. Never merges
 * on name alone so two people with similar names can never collide.
 */
export function findOdooEmployeeMatch(
  local: { phone: string | null; email: string | null },
  odooRecords: readonly RawOdooEmployeeRecord[],
): { record: RawOdooEmployeeRecord; matchedBy: "phone" | "email" } | null {
  const localPhone = normalizePhoneKey(local.phone);
  if (localPhone) {
    const phoneMatches = odooRecords.filter((o) => {
      const workPhone = typeof o.work_phone === "string" ? normalizePhoneKey(o.work_phone) : null;
      const mobilePhone = typeof o.mobile_phone === "string" ? normalizePhoneKey(o.mobile_phone) : null;
      return workPhone === localPhone || mobilePhone === localPhone;
    });
    if (phoneMatches.length > 0) {
      // If Odoo already has duplicates for this phone, pick the oldest (lowest ID)
      const sorted = [...phoneMatches].sort((a, b) => a.id - b.id);
      return { record: sorted[0]!, matchedBy: "phone" };
    }
  }

  const localEmail = normalizeEmailKey(local.email);
  if (localEmail) {
    const emailMatches = odooRecords.filter((o) => {
      const odooEmail = typeof o.work_email === "string" ? normalizeEmailKey(o.work_email) : null;
      return odooEmail === localEmail;
    });
    if (emailMatches.length > 0) {
      const sorted = [...emailMatches].sort((a, b) => a.id - b.id);
      return { record: sorted[0]!, matchedBy: "email" };
    }
  }

  return null;
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

  const odooJobName = Array.isArray(raw.job_id) ? cleanOdooString(raw.job_id[1]) : null;
  const jobTitle = odooJobName ?? cleanOdooString(raw.job_title);
  const email = normalizeEmailKey(cleanOdooString(raw.work_email));
  const phone = cleanOdooString(raw.mobile_phone) ?? cleanOdooString(raw.work_phone) ?? null;

  const odooDepartmentName = Array.isArray(raw.department_id)
    ? cleanOdooString(raw.department_id[1]) ?? ""
    : "";
  const odooCompanyName = Array.isArray(raw.company_id) ? raw.company_id[1] : "";
  const branchSpec = resolveBranchSpecForOdooEmployee(odooDepartmentName, odooCompanyName);
  const department = odooDepartmentName || inferDepartmentFromJobTitle(jobTitle);

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
  | {
      kind: "duplicate_in_odoo";
      existingLinkedId: string;
      duplicateOdooId: string;
      matchedBy: "email" | "phone" | "name";
    }
  | { kind: "unmatched" };

/**
 * Matches a normalized Odoo employee against existing local employee records.
 *
 * 1. If a local employee already carries this exact `odooEmployeeId`, returns `already_linked`.
 * 2. If this Odoo employee matches an employee who is ALREADY linked to another Odoo ID,
 *    returns `duplicate_in_odoo` so the duplicate Odoo record is flagged and never auto-created.
 * 3. Otherwise searches unlinked local employees (`odooEmployeeId === null`) by:
 *    - unique case-insensitive email match
 *    - unique 9-digit phone suffix match
 *    - unique normalized full-name match (either `firstName + lastName` or `lastName + firstName`)
 * 4. If no unique match exists, returns `unmatched` (NEVER creates a new local employee automatically).
 */
export function matchOdooEmployeeToLocal(
  odooEmp: NormalizedOdooEmployee,
  localEmployees: readonly LocalEmployeeCandidate[],
): EmployeeMatchOutcome {
  const exactIdMatch = localEmployees.find((e) => e.odooEmployeeId === odooEmp.odooEmployeeId);
  if (exactIdMatch) {
    return { kind: "already_linked", localEmployeeId: exactIdMatch.id };
  }

  // Check if this Odoo employee matches someone ALREADY linked to a different Odoo ID
  const linked = localEmployees.filter((e) => Boolean(e.odooEmployeeId));
  const unlinked = localEmployees.filter((e) => !e.odooEmployeeId);

  const odooForwardKey = `${normalizeNameToken(odooEmp.firstName)}|${normalizeNameToken(odooEmp.lastName)}`;
  const odooReverseKey = `${normalizeNameToken(odooEmp.lastName)}|${normalizeNameToken(odooEmp.firstName)}`;

  const targetEmail = normalizeEmailKey(odooEmp.email);
  if (targetEmail) {
    const linkedEmailMatch = linked.find((e) => normalizeEmailKey(e.email) === targetEmail);
    if (linkedEmailMatch) {
      return {
        kind: "duplicate_in_odoo",
        existingLinkedId: linkedEmailMatch.id,
        duplicateOdooId: odooEmp.odooEmployeeId,
        matchedBy: "email",
      };
    }
  }

  const targetPhone = normalizePhoneKey(odooEmp.phone);
  if (targetPhone) {
    const linkedPhoneMatch = linked.find((e) => normalizePhoneKey(e.phone) === targetPhone);
    if (linkedPhoneMatch) {
      return {
        kind: "duplicate_in_odoo",
        existingLinkedId: linkedPhoneMatch.id,
        duplicateOdooId: odooEmp.odooEmployeeId,
        matchedBy: "phone",
      };
    }
  }

  const linkedNameMatch = linked.find((e) => {
    const localKey = `${normalizeNameToken(e.firstName)}|${normalizeNameToken(e.lastName)}`;
    return localKey === odooForwardKey || localKey === odooReverseKey;
  });
  if (linkedNameMatch) {
    return {
      kind: "duplicate_in_odoo",
      existingLinkedId: linkedNameMatch.id,
      duplicateOdooId: odooEmp.odooEmployeeId,
      matchedBy: "name",
    };
  }

  // Next search unlinked local employees for linking
  if (targetEmail) {
    const emailMatches = unlinked.filter((e) => normalizeEmailKey(e.email) === targetEmail);
    if (emailMatches.length === 1) {
      return { kind: "link_existing", localEmployeeId: emailMatches[0].id, matchedBy: "email" };
    }
  }

  if (targetPhone) {
    const phoneMatches = unlinked.filter((e) => normalizePhoneKey(e.phone) === targetPhone);
    if (phoneMatches.length === 1) {
      return { kind: "link_existing", localEmployeeId: phoneMatches[0].id, matchedBy: "phone" };
    }
  }

  const nameMatches = unlinked.filter((e) => {
    const localKey = `${normalizeNameToken(e.firstName)}|${normalizeNameToken(e.lastName)}`;
    return localKey === odooForwardKey || localKey === odooReverseKey;
  });

  if (nameMatches.length === 1) {
    return { kind: "link_existing", localEmployeeId: nameMatches[0].id, matchedBy: "name" };
  }

  return { kind: "unmatched" };
}
