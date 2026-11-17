import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { fetchAllOdooEmployees } from "./client";
import {
  normalizeOdooEmployee,
  normalizePhoneKey,
  type NormalizedOdooEmployee,
  type RawOdooEmployeeRecord,
} from "./policy";

const log = scoped("odoo:reconcile");

function cleanToken(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type OdooFieldDiff = {
  field: "name" | "phone" | "email" | "jobTitle" | "department";
  fieldLabel: string;
  localValue: string | null;
  odooValue: string | null;
};

export type OdooDiscrepancyItem = {
  id: string; // unique item id for React keys
  kind:
    | "MATCHED" // Linked and all key profile details align
    | "FIELD_MISMATCH" // Linked but phone, email, or job differs
    | "ODOO_NOT_FOUND" // Local employee carries an odooEmployeeId that was deleted from Odoo
    | "LOCAL_ONLY" // Real local employee with no odooEmployeeId
    | "ODOO_UNMATCHED" // Record exists in Odoo but has no local employee
    | "ODOO_DUPLICATE"; // Redundant duplicate record in Odoo (shares name with another Odoo employee)
  severity: "info" | "warning" | "error";
  message: string;

  // Local employee data (if applicable)
  localEmployeeId?: string;
  localEmployeeCode?: string;
  localName?: string;
  localPhone?: string | null;
  localEmail?: string | null;
  localJobTitle?: string | null;
  localDepartment?: string | null;

  // Odoo employee data (if applicable)
  odooEmployeeId?: string;
  odooName?: string;
  odooPhone?: string | null;
  odooEmail?: string | null;
  odooJobTitle?: string | null;
  odooDepartment?: string | null;
  odooActive?: boolean;

  // Discrepancy details
  diffs?: OdooFieldDiff[];

  // Suggestions for quick resolution
  suggestedOdooId?: string;
  suggestedOdooName?: string;
  suggestedLocalId?: string;
  suggestedLocalCode?: string;
  suggestedLocalName?: string;
  duplicateOfOdooId?: string;
  duplicateOfLocalCode?: string;
};

export type OdooReconciliationReport = {
  ok: boolean;
  timestamp: string;
  modelUsed: "hr.employee" | "hr.employee.public" | null;
  counts: {
    totalOdoo: number;
    totalLocal: number;
    matched: number;
    fieldMismatches: number;
    odooNotFound: number;
    localOnly: number;
    odooUnmatched: number;
    odooDuplicates: number;
  };
  items: OdooDiscrepancyItem[];
};

export async function getOdooReconciliationReport(): Promise<OdooReconciliationReport> {
  const [odooResult, localEmployees] = await Promise.all([
    fetchAllOdooEmployees().catch((err) => {
      log.error("Failed to fetch Odoo employees for reconciliation", { error: String(err) });
      return { modelUsed: null as ("hr.employee" | "hr.employee.public" | null), records: [] as RawOdooEmployeeRecord[] };
    }),
    prisma.employee.findMany({
      orderBy: [{ employeeCode: "asc" }],
      select: {
        id: true,
        employeeCode: true,
        odooEmployeeId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        jobTitle: true,
        department: true,
        status: true,
      },
    }),
  ]);

  const rawOdoo = odooResult.records;
  const normalizedOdoo: NormalizedOdooEmployee[] = [];
  for (const raw of rawOdoo) {
    const norm = normalizeOdooEmployee(raw);
    if (norm) normalizedOdoo.push(norm);
  }

  // 1. Detect internal duplicates within Odoo
  // Group Odoo records by normalized full name
  const odooByName = new Map<string, NormalizedOdooEmployee[]>();
  for (const o of normalizedOdoo) {
    const key = `${cleanToken(o.firstName)}|${cleanToken(o.lastName)}`;
    const altKey = `${cleanToken(o.lastName)}|${cleanToken(o.firstName)}`;
    const foundKey = odooByName.has(key) ? key : odooByName.has(altKey) ? altKey : key;
    const list = odooByName.get(foundKey) ?? [];
    list.push(o);
    odooByName.set(foundKey, list);
  }

  const odooDuplicateIds = new Set<string>();
  const duplicateToPrimaryMap = new Map<string, string>();

  for (const list of odooByName.values()) {
    if (list.length > 1) {
      // Sort ascending by ID (lowest numeric ID is the original primary)
      list.sort((a, b) => Number(a.odooEmployeeId) - Number(b.odooEmployeeId));
      const primary = list[0];
      for (let i = 1; i < list.length; i++) {
        odooDuplicateIds.add(list[i].odooEmployeeId);
        duplicateToPrimaryMap.set(list[i].odooEmployeeId, primary.odooEmployeeId);
      }
    }
  }

  const odooMap = new Map<string, NormalizedOdooEmployee>(
    normalizedOdoo.map((o) => [o.odooEmployeeId, o]),
  );

  const matchedOdooIds = new Set<string>();
  const items: OdooDiscrepancyItem[] = [];

  let countMatched = 0;
  let countFieldMismatches = 0;
  let countOdooNotFound = 0;
  let countLocalOnly = 0;

  // 2. Evaluate Local Employees
  for (const local of localEmployees) {
    const localFullName = `${local.firstName} ${local.lastName}`.trim();

    if (!local.odooEmployeeId) {
      // Local employee is not linked to any Odoo ID
      countLocalOnly++;

      // Try finding a candidate in Odoo that is not already matched
      const localPhoneKey = normalizePhoneKey(local.phone);
      const localEmailKey = local.email?.trim().toLowerCase();
      const localNameForward = `${cleanToken(local.firstName)}|${cleanToken(local.lastName)}`;
      const localNameReverse = `${cleanToken(local.lastName)}|${cleanToken(local.firstName)}`;

      const candidate = normalizedOdoo.find((o) => {
        if (localEmailKey && o.email?.trim().toLowerCase() === localEmailKey) return true;
        if (localPhoneKey && normalizePhoneKey(o.phone) === localPhoneKey) return true;
        const oKey = `${cleanToken(o.firstName)}|${cleanToken(o.lastName)}`;
        return oKey === localNameForward || oKey === localNameReverse;
      });

      items.push({
        id: `local-only-${local.id}`,
        kind: "LOCAL_ONLY",
        severity: "warning",
        message: `Employee ${local.employeeCode} (${localFullName}) is active in Ops but not linked to Odoo.`,
        localEmployeeId: local.id,
        localEmployeeCode: local.employeeCode,
        localName: localFullName,
        localPhone: local.phone,
        localEmail: local.email,
        localJobTitle: local.jobTitle,
        localDepartment: local.department,
        suggestedOdooId: candidate?.odooEmployeeId,
        suggestedOdooName: candidate?.rawName,
      });
      continue;
    }

    // Local employee has an odooEmployeeId
    const odoo = odooMap.get(local.odooEmployeeId);

    if (!odoo) {
      // The linked Odoo record does NOT exist in Odoo (likely deleted during developer cleanup)
      countOdooNotFound++;

      // Search if a survivor record exists in Odoo under the same name or phone
      const localPhoneKey = normalizePhoneKey(local.phone);
      const localEmailKey = local.email?.trim().toLowerCase();
      const localNameForward = `${cleanToken(local.firstName)}|${cleanToken(local.lastName)}`;
      const localNameReverse = `${cleanToken(local.lastName)}|${cleanToken(local.firstName)}`;

      const survivor = normalizedOdoo.find((o) => {
        if (localEmailKey && o.email?.trim().toLowerCase() === localEmailKey) return true;
        if (localPhoneKey && normalizePhoneKey(o.phone) === localPhoneKey) return true;
        const oKey = `${cleanToken(o.firstName)}|${cleanToken(o.lastName)}`;
        return oKey === localNameForward || oKey === localNameReverse;
      });

      items.push({
        id: `odoo-not-found-${local.id}`,
        kind: "ODOO_NOT_FOUND",
        severity: "error",
        message: `Linked Odoo ID #${local.odooEmployeeId} no longer exists in Odoo (deleted).`,
        localEmployeeId: local.id,
        localEmployeeCode: local.employeeCode,
        localName: localFullName,
        localPhone: local.phone,
        localEmail: local.email,
        localJobTitle: local.jobTitle,
        localDepartment: local.department,
        odooEmployeeId: local.odooEmployeeId,
        suggestedOdooId: survivor?.odooEmployeeId,
        suggestedOdooName: survivor?.rawName,
      });
      continue;
    }

    // The Odoo record exists!
    matchedOdooIds.add(odoo.odooEmployeeId);

    // Check for field differences
    const diffs: OdooFieldDiff[] = [];

    // Compare phone
    const localPhoneKey = normalizePhoneKey(local.phone);
    const odooPhoneKey = normalizePhoneKey(odoo.phone);
    if (localPhoneKey && odooPhoneKey && localPhoneKey !== odooPhoneKey) {
      diffs.push({
        field: "phone",
        fieldLabel: "Phone Number",
        localValue: local.phone,
        odooValue: odoo.phone,
      });
    }

    // Compare email
    const localEmail = local.email?.trim().toLowerCase() || null;
    const odooEmail = odoo.email?.trim().toLowerCase() || null;
    if (localEmail && odooEmail && localEmail !== odooEmail) {
      diffs.push({
        field: "email",
        fieldLabel: "Email Address",
        localValue: local.email,
        odooValue: odoo.email,
      });
    }

    // Compare job title
    const localJob = local.jobTitle?.trim().toLowerCase() || null;
    const odooJob = odoo.jobTitle?.trim().toLowerCase() || null;
    if (localJob && odooJob && localJob !== odooJob) {
      diffs.push({
        field: "jobTitle",
        fieldLabel: "Job Title",
        localValue: local.jobTitle,
        odooValue: odoo.jobTitle,
      });
    }

    if (diffs.length > 0) {
      countFieldMismatches++;
      items.push({
        id: `mismatch-${local.id}`,
        kind: "FIELD_MISMATCH",
        severity: "warning",
        message: `Profile discrepancy on ${local.employeeCode}: ${diffs.map((d) => d.fieldLabel).join(", ")} differs.`,
        localEmployeeId: local.id,
        localEmployeeCode: local.employeeCode,
        localName: localFullName,
        localPhone: local.phone,
        localEmail: local.email,
        localJobTitle: local.jobTitle,
        localDepartment: local.department,
        odooEmployeeId: odoo.odooEmployeeId,
        odooName: odoo.rawName,
        odooPhone: odoo.phone,
        odooEmail: odoo.email,
        odooJobTitle: odoo.jobTitle,
        odooDepartment: odoo.odooDepartmentName,
        odooActive: odoo.isActive,
        diffs,
      });
    } else {
      countMatched++;
      items.push({
        id: `matched-${local.id}`,
        kind: "MATCHED",
        severity: "info",
        message: `Synced and aligned with Odoo #${odoo.odooEmployeeId}.`,
        localEmployeeId: local.id,
        localEmployeeCode: local.employeeCode,
        localName: localFullName,
        localPhone: local.phone,
        localEmail: local.email,
        localJobTitle: local.jobTitle,
        localDepartment: local.department,
        odooEmployeeId: odoo.odooEmployeeId,
        odooName: odoo.rawName,
        odooPhone: odoo.phone,
        odooEmail: odoo.email,
        odooJobTitle: odoo.jobTitle,
        odooDepartment: odoo.odooDepartmentName,
        odooActive: odoo.isActive,
      });
    }
  }

  // 3. Evaluate Odoo employees that are NOT linked to any local employee
  let countOdooDuplicates = 0;
  let countOdooUnmatched = 0;

  for (const odoo of normalizedOdoo) {
    if (matchedOdooIds.has(odoo.odooEmployeeId)) {
      continue;
    }

    // Is it an internal Odoo duplicate?
    if (odooDuplicateIds.has(odoo.odooEmployeeId)) {
      countOdooDuplicates++;
      const primaryOdooId = duplicateToPrimaryMap.get(odoo.odooEmployeeId);
      const linkedLocal = localEmployees.find((e) => e.odooEmployeeId === primaryOdooId);

      items.push({
        id: `odoo-dupe-${odoo.odooEmployeeId}`,
        kind: "ODOO_DUPLICATE",
        severity: "warning",
        message: `Duplicate record in Odoo (${odoo.rawName} #${odoo.odooEmployeeId}). Matches primary Odoo #${primaryOdooId}.`,
        odooEmployeeId: odoo.odooEmployeeId,
        odooName: odoo.rawName,
        odooPhone: odoo.phone,
        odooEmail: odoo.email,
        odooJobTitle: odoo.jobTitle,
        odooDepartment: odoo.odooDepartmentName,
        odooActive: odoo.isActive,
        duplicateOfOdooId: primaryOdooId,
        duplicateOfLocalCode: linkedLocal?.employeeCode,
      });
    } else {
      countOdooUnmatched++;

      // Check if any local unlinked employee has a similar name
      const odooForwardKey = `${cleanToken(odoo.firstName)}|${cleanToken(odoo.lastName)}`;
      const odooReverseKey = `${cleanToken(odoo.lastName)}|${cleanToken(odoo.firstName)}`;

      const localCandidate = localEmployees.find((e) => {
        const lKey = `${cleanToken(e.firstName)}|${cleanToken(e.lastName)}`;
        return lKey === odooForwardKey || lKey === odooReverseKey;
      });

      items.push({
        id: `odoo-unmatched-${odoo.odooEmployeeId}`,
        kind: "ODOO_UNMATCHED",
        severity: "info",
        message: `Odoo has employee #${odoo.odooEmployeeId} (${odoo.rawName}) but they are not linked in Ops.`,
        odooEmployeeId: odoo.odooEmployeeId,
        odooName: odoo.rawName,
        odooPhone: odoo.phone,
        odooEmail: odoo.email,
        odooJobTitle: odoo.jobTitle,
        odooDepartment: odoo.odooDepartmentName,
        odooActive: odoo.isActive,
        suggestedLocalId: localCandidate?.id,
        suggestedLocalCode: localCandidate?.employeeCode,
        suggestedLocalName: localCandidate ? `${localCandidate.firstName} ${localCandidate.lastName}` : undefined,
      });
    }
  }

  // Sort items: errors first, then warnings, then info, then matched
  const severityRank = { error: 0, warning: 1, info: 2 };
  items.sort((a, b) => {
    const sDiff = severityRank[a.severity] - severityRank[b.severity];
    if (sDiff !== 0) return sDiff;
    return (a.localEmployeeCode || a.odooEmployeeId || "").localeCompare(
      b.localEmployeeCode || b.odooEmployeeId || "",
    );
  });

  return {
    ok: countOdooNotFound === 0 && countFieldMismatches === 0,
    timestamp: new Date().toISOString(),
    modelUsed: odooResult.modelUsed,
    counts: {
      totalOdoo: rawOdoo.length,
      totalLocal: localEmployees.length,
      matched: countMatched,
      fieldMismatches: countFieldMismatches,
      odooNotFound: countOdooNotFound,
      localOnly: countLocalOnly,
      odooUnmatched: countOdooUnmatched,
      odooDuplicates: countOdooDuplicates,
    },
    items,
  };
}
