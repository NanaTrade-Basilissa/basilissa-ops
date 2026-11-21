import { describe, expect, it } from "vitest";
import {
  findOdooEmployeeMatch,
  normalizeEmailKey,
  normalizePhoneKey,
  resolveEffectiveOdooAttendanceWindow,
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

describe("Odoo attendance export gating — clean final records only", () => {
  it("blocks unscheduled shifts that have not been approved", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-21T08:00:00Z"),
      actualOut: new Date("2026-11-21T17:00:00Z"),
      scheduledStart: null,
      scheduledEnd: null,
      overtimeMinutes: 0,
      payableOvertimeMinutes: 0,
      flags: ["UNSCHEDULED"],
    });
    expect(res).toEqual({ ok: false, reason: "UNSCHEDULED_UNAPPROVED" });
  });

  it("allows unscheduled shifts once explicitly approved via payable overtime", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-21T08:00:00Z"),
      actualOut: new Date("2026-11-21T12:00:00Z"),
      scheduledStart: null,
      scheduledEnd: null,
      overtimeMinutes: 240,
      payableOvertimeMinutes: 240,
      flags: ["UNSCHEDULED"],
    });
    expect(res.ok).toBe(true);
  });

  it("blocks incomplete shifts with no clock-out at all", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-21T08:00:00Z"),
      actualOut: null,
      scheduledStart: new Date("2026-11-21T08:00:00Z"),
      scheduledEnd: new Date("2026-11-21T17:00:00Z"),
      overtimeMinutes: 0,
      payableOvertimeMinutes: 0,
      flags: ["MISSING_CLOCK_OUT"],
    });
    expect(res).toEqual({ ok: false, reason: "MISSING_PUNCH" });
  });

  it("blocks shifts with unresolved punch exception flags (e.g. UNPAIRED_BREAK)", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-21T08:00:00Z"),
      actualOut: new Date("2026-11-21T17:00:00Z"),
      scheduledStart: new Date("2026-11-21T08:00:00Z"),
      scheduledEnd: new Date("2026-11-21T17:00:00Z"),
      overtimeMinutes: 0,
      payableOvertimeMinutes: 0,
      flags: ["UNPAIRED_BREAK"],
    });
    expect(res).toEqual({ ok: false, reason: "UNRESOLVED_PUNCH_EXCEPTION" });
  });

  it("allows auto-closed scheduled shifts because SYSTEM_AUTO_CLOSE provides scheduledEnd as clock-out", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-21T08:05:00Z"),
      actualOut: new Date("2026-11-21T17:00:00Z"),
      scheduledStart: new Date("2026-11-21T08:00:00Z"),
      scheduledEnd: new Date("2026-11-21T17:00:00Z"),
      overtimeMinutes: 0,
      payableOvertimeMinutes: 0,
      flags: ["AUTO_CLOSED"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.checkOutUtc).toBe("2026-11-21 17:00:00");
    }
  });
});
