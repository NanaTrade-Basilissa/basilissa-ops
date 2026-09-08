import ExcelJS from "exceljs";

/**
 * Bulk employee import from an Odoo `hr.employee` export.
 *
 * Deliberately free of Prisma and any I/O except the workbook parse itself:
 * the part worth getting right — name splitting, department-to-branch
 * resolution, duplicate/permission flagging — is a pure function of the
 * parsed rows plus whatever the caller already knows about the database, so
 * it is exhaustively testable the same way `authorization.ts` is. `actions.ts`
 * supplies the DB state and does the actual writes.
 */

export type RawImportRow = {
  rowNumber: number;
  department: string;
  employeeName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
};

export type ImportRowStatus = "ready" | "duplicate" | "manual" | "blocked";

export type ResolvedImportRow = RawImportRow & {
  firstName: string | null;
  lastName: string | null;
  branchSlug: string;
  branchDisplayName: string;
  needsNewBranch: boolean;
  status: ImportRowStatus;
  issues: string[];
};

export type ExistingBranch = { id: string; slug: string; name: string };

/**
 * A branch this import may need to create. Keyed by slug so
 * `DEPARTMENT_BRANCH_MAP` and `resolveImportRows` can both reference it
 * without repeating the name/location.
 */
export const NEW_BRANCHES: Record<string, { slug: string; name: string; location: string }> = {
  afienya: { slug: "afienya", name: "Basilissa Afienya", location: "Afienya" },
  "head-office": { slug: "head-office", name: "Basilissa Head Office", location: "TSC" },
};

/**
 * A "Department" that names a branch (mall/branch management) *is* that
 * branch. Kept as an explicit table rather than stripping a suffix like
 * "Branch Management" from the text, because a real department — "Management"
 * alone, 7 leadership staff — would otherwise be misread as naming a branch.
 * A department not listed here falls back to `DEFAULT_BRANCH_SLUG`.
 */
export const DEPARTMENT_BRANCH_MAP: Record<string, string> = {
  "Accra Mall Management": "accra-mall",
  "Achimota Branch Management": "achimota-mall",
  "Westhills Mall Management": "west-hills-mall",
  "Dawhenya Branch Management": "community-25-dawhenya",
  "Tema Branch Management": "tema-community-6",
  "Afienya Branch Management": "afienya",
};

/** Everything not named in `DEPARTMENT_BRANCH_MAP` belongs to Head Office. */
export const DEFAULT_BRANCH_SLUG = "head-office";

function resolveBranchSlug(department: string): string {
  return DEPARTMENT_BRANCH_MAP[department.trim()] ?? DEFAULT_BRANCH_SLUG;
}

/**
 * "Employee Name" is `SURNAME GIVEN_NAME(S)` — verified against this export by
 * cross-checking work-email local parts (e.g. "OTUBOAH GIDEON" against
 * `gideonotuboah@...`). The first word is the surname; everything after it,
 * however many words, is the given name. Returns null when there is nothing
 * to split on, rather than guessing.
 */
export function splitEmployeeName(raw: string): { firstName: string; lastName: string } | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const [lastName, ...rest] = parts;
  return { firstName: rest.join(" "), lastName };
}

/** Plain text out of a cell, whatever ExcelJS handed back for it. */
function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim() || null;
  }
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((fragment) => fragment.text).join("").trim() || null;
  }
  return null;
}

const EXPECTED_HEADERS = {
  department: "department",
  employeeName: "employee name",
  jobTitle: "job position",
  email: "work email",
  phone: "work phone",
} as const;

/** Reads the uploaded workbook's first sheet into plain rows. The only I/O in this file. */
export async function parseEmployeeWorkbook(buffer: Buffer): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own .d.ts shadows the global `Buffer` with a local interface
  // that (mis-)extends `ArrayBuffer`, which a real Node `Buffer` never
  // structurally satisfies. The cast bridges that type-only mismatch; the
  // value handed over is still a genuine Buffer, which is what it parses at
  // runtime.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const columnFor: Partial<Record<keyof typeof EXPECTED_HEADERS, number>> = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = cellText(cell.value)?.toLowerCase();
    const match = (Object.keys(EXPECTED_HEADERS) as (keyof typeof EXPECTED_HEADERS)[]).find(
      (key) => EXPECTED_HEADERS[key] === header,
    );
    if (match) columnFor[match] = colNumber;
  });

  const rows: RawImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const department = columnFor.department ? cellText(row.getCell(columnFor.department).value) : null;
    const employeeName = columnFor.employeeName
      ? cellText(row.getCell(columnFor.employeeName).value)
      : null;
    if (!department && !employeeName) return; // a blank row

    rows.push({
      rowNumber,
      department: department ?? "",
      employeeName: employeeName ?? "",
      jobTitle: columnFor.jobTitle ? cellText(row.getCell(columnFor.jobTitle).value) : null,
      email: columnFor.email ? (cellText(row.getCell(columnFor.email).value)?.toLowerCase() ?? null) : null,
      phone: columnFor.phone ? cellText(row.getCell(columnFor.phone).value) : null,
    });
  });

  return rows;
}

/**
 * Resolves parsed rows against what the caller already knows about the
 * database: which branches exist, and which (firstName, lastName) pairs are
 * already on record. Pure — no query happens in here.
 */
export function resolveImportRows(
  rows: RawImportRow[],
  existingBranches: ExistingBranch[],
  existingEmployeeNameKeys: ReadonlySet<string>,
  canCreateBranch: boolean,
): ResolvedImportRow[] {
  const branchBySlug = new Map(existingBranches.map((branch) => [branch.slug, branch]));
  const seenInFile = new Set<string>();

  return rows.map((row): ResolvedImportRow => {
    const issues: string[] = [];
    const split = splitEmployeeName(row.employeeName);
    const branchSlug = resolveBranchSlug(row.department);
    const existing = branchBySlug.get(branchSlug);
    const pending = NEW_BRANCHES[branchSlug];
    const needsNewBranch = !existing;
    const branchDisplayName = existing?.name ?? pending?.name ?? branchSlug;

    // Each check appends its own issue text regardless of the others, but
    // only one status is shown — in priority order, since a row already
    // skipped as a duplicate doesn't need a branch, and a row with no
    // splittable name can't be created whether or not its branch exists.
    let isDuplicate = false;
    let isManual = false;
    let isBlocked = false;

    if (!split) {
      isManual = true;
      issues.push('Could not split "' + row.employeeName + '" into a first and last name — add manually.');
    }

    if (needsNewBranch && !pending) {
      isBlocked = true;
      issues.push(`No branch mapping for department "${row.department}".`);
    } else if (needsNewBranch && !canCreateBranch) {
      isBlocked = true;
      issues.push(`Branch "${branchDisplayName}" doesn't exist yet — ask an admin to create it, or have them run this import.`);
    }

    if (split) {
      const key = `${split.firstName.toLowerCase()}|${split.lastName.toLowerCase()}`;
      if (existingEmployeeNameKeys.has(key)) {
        isDuplicate = true;
        issues.push("Already exists in the system — skipped.");
      } else if (seenInFile.has(key)) {
        issues.push("Same name appears more than once in this file.");
      }
      seenInFile.add(key);
    }

    const status: ImportRowStatus = isDuplicate ? "duplicate" : isManual ? "manual" : isBlocked ? "blocked" : "ready";

    return {
      ...row,
      firstName: split?.firstName ?? null,
      lastName: split?.lastName ?? null,
      branchSlug,
      branchDisplayName,
      needsNewBranch,
      status,
      issues,
    };
  });
}
