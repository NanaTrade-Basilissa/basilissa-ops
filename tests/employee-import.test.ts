import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRANCH_SLUG,
  DEPARTMENT_BRANCH_MAP,
  NEW_BRANCHES,
  parseEmployeeWorkbook,
  resolveImportRows,
  splitEmployeeName,
  type RawImportRow,
} from "@/lib/modules/employees/import";

describe("splitEmployeeName", () => {
  it("takes the first word as surname and the rest as given name", () => {
    // Verified against this export's own work-email local parts, e.g.
    // "gideonotuboah@..." for "OTUBOAH GIDEON".
    expect(splitEmployeeName("OTUBOAH GIDEON")).toEqual({ firstName: "GIDEON", lastName: "OTUBOAH" });
  });

  it("keeps every word after the surname as one given name", () => {
    expect(splitEmployeeName("ANSAH PRINCESS DROMI MAUNYE")).toEqual({
      firstName: "PRINCESS DROMI MAUNYE",
      lastName: "ANSAH",
    });
  });

  it("returns null for a single word rather than guessing", () => {
    expect(splitEmployeeName("Administrator")).toBeNull();
  });

  it("collapses extra whitespace", () => {
    expect(splitEmployeeName("  TAMATEY   THELMA  ")).toEqual({ firstName: "THELMA", lastName: "TAMATEY" });
  });
});

function row(overrides: Partial<RawImportRow>): RawImportRow {
  return {
    rowNumber: 2,
    department: "Accounts",
    employeeName: "MENSAH AMA",
    jobTitle: null,
    email: null,
    phone: null,
    ...overrides,
  };
}

describe("resolveImportRows — department to branch", () => {
  it("resolves a branch-shaped department to the existing branch", () => {
    const [resolved] = resolveImportRows(
      [row({ department: "Achimota Branch Management" })],
      [{ id: "b1", slug: "achimota-mall", name: "Basilissa Achimota Mall" }],
      new Set(),
      false,
    );
    expect(resolved.branchSlug).toBe("achimota-mall");
    expect(resolved.branchDisplayName).toBe("Basilissa Achimota Mall");
    expect(resolved.needsNewBranch).toBe(false);
    expect(resolved.status).toBe("ready");
  });

  it("falls back to Head Office for a department that doesn't name a branch", () => {
    const [resolved] = resolveImportRows([row({ department: "Maintenance" })], [], new Set(), false);
    expect(resolved.branchSlug).toBe(DEFAULT_BRANCH_SLUG);
    expect(resolved.branchDisplayName).toBe(NEW_BRANCHES["head-office"].name);
  });

  it("does not mistake plain 'Management' for a branch-management department", () => {
    // A real department here (company leadership), not a branch.
    expect(DEPARTMENT_BRANCH_MAP["Management"]).toBeUndefined();
    const [resolved] = resolveImportRows([row({ department: "Management" })], [], new Set(), false);
    expect(resolved.branchSlug).toBe(DEFAULT_BRANCH_SLUG);
  });

  it("blocks a row needing a not-yet-existing branch when the actor cannot create branches", () => {
    const [resolved] = resolveImportRows(
      [row({ department: "Afienya Branch Management" })],
      [],
      new Set(),
      false,
    );
    expect(resolved.status).toBe("blocked");
    expect(resolved.issues[0]).toMatch(/doesn't exist yet/);
  });

  it("marks the row ready, needing branch creation, when the actor can create branches", () => {
    const [resolved] = resolveImportRows(
      [row({ department: "Afienya Branch Management" })],
      [],
      new Set(),
      true,
    );
    expect(resolved.status).toBe("ready");
    expect(resolved.needsNewBranch).toBe(true);
    expect(resolved.branchDisplayName).toBe(NEW_BRANCHES.afienya.name);
  });
});

describe("resolveImportRows — names and duplicates", () => {
  it("flags a name that cannot be split for manual entry", () => {
    const [resolved] = resolveImportRows([row({ employeeName: "Administrator" })], [], new Set(), false);
    expect(resolved.status).toBe("manual");
    expect(resolved.firstName).toBeNull();
  });

  it("still reports manual, not blocked, when the row's branch is also unresolved", () => {
    // Both problems are real and both land in `issues`, but a human needs to
    // supply the name either way — that's the actionable one to show.
    const [resolved] = resolveImportRows(
      [row({ employeeName: "Administrator", department: "Afienya Branch Management" })],
      [],
      new Set(),
      false,
    );
    expect(resolved.status).toBe("manual");
    expect(resolved.issues).toHaveLength(2);
  });

  it("skips a row whose name already exists in the system", () => {
    const [resolved] = resolveImportRows(
      [row({ employeeName: "MENSAH AMA" })],
      [],
      new Set(["ama|mensah"]),
      false,
    );
    expect(resolved.status).toBe("duplicate");
  });

  it("flags, but does not skip, the same name appearing twice within one file", () => {
    const [first, second] = resolveImportRows(
      [row({ rowNumber: 2, employeeName: "MENSAH AMA" }), row({ rowNumber: 3, employeeName: "MENSAH AMA" })],
      [{ id: "b1", slug: "head-office", name: "Basilissa Head Office" }],
      new Set(),
      false,
    );
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(second.issues.some((issue) => issue.includes("more than once"))).toBe(true);
  });
});

describe("parseEmployeeWorkbook", () => {
  async function bufferFor(headers: string[], rows: (string | null)[][]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(headers);
    for (const values of rows) sheet.addRow(values);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  it("matches columns by header name, case-insensitively", async () => {
    const buffer = await bufferFor(
      ["department", "Employee Name", "Job Position", "Work Email", "Work Phone"],
      [["Accounts", "OTUBOAH GIDEON", "Finance Officer", "gideon@example.com", "0263665113"]],
    );

    const rows = await parseEmployeeWorkbook(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      department: "Accounts",
      employeeName: "OTUBOAH GIDEON",
      jobTitle: "Finance Officer",
      email: "gideon@example.com",
      phone: "0263665113",
    });
  });

  it("skips a fully blank row", async () => {
    const buffer = await bufferFor(
      ["Department", "Employee Name", "Job Position", "Work Email", "Work Phone"],
      [
        ["Accounts", "OTUBOAH GIDEON", null, null, null],
        [null, null, null, null, null],
      ],
    );

    const rows = await parseEmployeeWorkbook(buffer);
    expect(rows).toHaveLength(1);
  });
});
