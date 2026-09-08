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

export type BranchSpec = {
  /** What to name/locate this branch if it has to be created. */
  slug: string;
  name: string;
  location: string;
  /**
   * Normalized (lowercase, non-alphanumeric stripped) fragment recognized
   * inside an existing branch's name or slug. Matching on a keyword rather
   * than requiring `slug` to match exactly means a branch that already
   * exists under a slightly different slug (environments drift — dev and
   * production were never guaranteed to agree) still resolves instead of
   * being reported as missing.
   */
  keyword: string;
};

/**
 * A "Department" that names a branch (mall/branch management) *is* that
 * branch. Kept as an explicit table rather than stripping a suffix like
 * "Branch Management" from the text, because a real department — "Management"
 * alone, 7 leadership staff — would otherwise be misread as naming a branch.
 * A department not listed here belongs to `HEAD_OFFICE`.
 *
 * Every entry here can be *created* as well as matched — a branch this
 * table expects to already exist (e.g. West Hills) is not guaranteed to,
 * since production and dev branch data have never been the same rows. When
 * one doesn't exist and the actor holds `branch:write`, it gets created from
 * this spec rather than the row being permanently unresolvable.
 */
export const DEPARTMENT_BRANCHES: Record<string, BranchSpec> = {
  "Accra Mall Management": {
    slug: "accra-mall",
    name: "Basilissa Accra Mall",
    location: "Accra Mall, Spintex Road, Accra",
    keyword: "accramall",
  },
  "Achimota Branch Management": {
    slug: "achimota-mall",
    name: "Basilissa Achimota Mall",
    location: "Achimota mall, Accra",
    keyword: "achimota",
  },
  "Westhills Mall Management": {
    slug: "west-hills-mall",
    name: "Basilissa West Hills Mall",
    location: "West Hills, Accra",
    keyword: "westhills",
  },
  "Dawhenya Branch Management": {
    slug: "community-25-dawhenya",
    name: "Basilissa Dawhenya",
    location: "Tema Community 25",
    keyword: "dawhenya",
  },
  "Tema Branch Management": {
    slug: "tema-community-6",
    name: "Basilissa Tema Branch",
    location: "Tema Community 6",
    keyword: "tema",
  },
  "Afienya Branch Management": {
    slug: "afienya",
    name: "Basilissa Afienya",
    location: "Afienya",
    keyword: "afienya",
  },
};

/** Everything not named in `DEPARTMENT_BRANCHES` belongs here. */
export const HEAD_OFFICE: BranchSpec = {
  slug: "head-office",
  name: "Basilissa Head Office",
  location: "TSC",
  keyword: "headoffice",
};

function branchSpecFor(department: string): BranchSpec {
  return DEPARTMENT_BRANCHES[department.trim()] ?? HEAD_OFFICE;
}

/** Every spec a resolved row's `branchSlug` might need to be created from. */
const ALL_BRANCH_SPECS = [...Object.values(DEPARTMENT_BRANCHES), HEAD_OFFICE];

/** Looks up the create spec for a `branchSlug` a resolved row came back with. */
export function branchSpecBySlug(slug: string): BranchSpec | undefined {
  return ALL_BRANCH_SPECS.find((spec) => spec.slug === slug);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Exact slug match first (the common case), keyword match as a fallback. */
function findExistingBranch(spec: BranchSpec, existingBranches: ExistingBranch[]): ExistingBranch | undefined {
  const exact = existingBranches.find((branch) => branch.slug === spec.slug);
  if (exact) return exact;

  return existingBranches.find(
    (branch) => normalize(branch.name).includes(spec.keyword) || normalize(branch.slug).includes(spec.keyword),
  );
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
  const seenInFile = new Set<string>();

  return rows.map((row): ResolvedImportRow => {
    const issues: string[] = [];
    const split = splitEmployeeName(row.employeeName);
    const spec = branchSpecFor(row.department);
    const existing = findExistingBranch(spec, existingBranches);
    const needsNewBranch = !existing;
    const branchDisplayName = existing?.name ?? spec.name;

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

    if (needsNewBranch && !canCreateBranch) {
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
      branchSlug: existing?.slug ?? spec.slug,
      branchDisplayName,
      needsNewBranch,
      status,
      issues,
    };
  });
}
