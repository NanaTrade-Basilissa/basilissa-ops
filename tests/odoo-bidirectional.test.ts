import { describe, expect, it } from "vitest";
import {
  findOdooEmployeeMatch,
  normalizeEmailKey,
  normalizePhoneKey,
  type RawOdooEmployeeRecord,
} from "@/lib/modules/odoo/policy";

describe("Odoo strict trimming & search-before-create matching", () => {
  it("normalizes phone numbers across spaces, dashes, local 0-prefix, and +233 E.164", () => {
    expect(normalizePhoneKey(" 024 123 4567 ")).toBe("241234567");
    expect(normalizePhoneKey("+233 24-123-4567")).toBe("241234567");
    expect(normalizePhoneKey("233241234567")).toBe("241234567");
    expect(normalizePhoneKey("   ")).toBeNull();
    expect(normalizePhoneKey("12345")).toBeNull();
  });

  it("trims, strips stray spaces, and lowercases email addresses", () => {
    expect(normalizeEmailKey("  Kofi.Mensah@Basilissa.com  ")).toBe("kofi.mensah@basilissa.com");
    expect(normalizeEmailKey(" kofi @basilissa.com ")).toBe("kofi@basilissa.com");
    expect(normalizeEmailKey("   ")).toBeNull();
    expect(normalizeEmailKey("not-an-email")).toBeNull();
  });

  const odooRecords: RawOdooEmployeeRecord[] = [
    {
      id: 42,
      name: "Kofi Mensah",
      work_email: "  KOFI.MENSAH@BASILISSA.COM ",
      work_phone: false,
      mobile_phone: " 024 123 4567 ",
      active: true,
    },
    {
      id: 99,
      name: "Ama Boateng",
      work_email: "ama@basilissa.com",
      work_phone: "+233 55-987-6543",
      mobile_phone: false,
      active: true,
    },
  ];

  it("matches by trimmed/normalized phone across work_phone and mobile_phone", () => {
    const res1 = findOdooEmployeeMatch(
      { phone: "+233241234567", email: null },
      odooRecords,
    );
    expect(res1?.matchedBy).toBe("phone");
    expect(res1?.record.id).toBe(42);

    const res2 = findOdooEmployeeMatch(
      { phone: " 055 987 6543 ", email: null },
      odooRecords,
    );
    expect(res2?.matchedBy).toBe("phone");
    expect(res2?.record.id).toBe(99);
  });

  it("falls back to trimmed/lowercased email when phone does not match", () => {
    const res = findOdooEmployeeMatch(
      { phone: null, email: " kofi.mensah@basilissa.com " },
      odooRecords,
    );
    expect(res?.matchedBy).toBe("email");
    expect(res?.record.id).toBe(42);
  });

  it("returns null when neither phone nor email matches (never merges by name alone)", () => {
    const res = findOdooEmployeeMatch(
      { phone: "+233200000000", email: "someone.else@basilissa.com" },
      odooRecords,
    );
    expect(res).toBeNull();
  });
});
