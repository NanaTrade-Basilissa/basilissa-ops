import { describe, expect, it } from "vitest";
import {
  formatOdooUtcDatetime,
  matchOdooEmployeeToLocal,
  normalizeOdooEmployee,
  parseOdooUtcDatetime,
  resolveEffectiveOdooAttendanceWindow,
  type LocalEmployeeCandidate,
} from "@/lib/modules/odoo/policy";

describe("Odoo UTC datetime formatting & parsing", () => {
  it("formats a Date to naive UTC 'YYYY-MM-DD HH:MM:SS' without timezone suffix", () => {
    const d = new Date("2026-11-05T08:15:30.450Z");
    expect(formatOdooUtcDatetime(d)).toBe("2026-11-05 08:15:30");
  });

  it("parses an Odoo naive UTC string back into the exact UTC Date", () => {
    const parsed = parseOdooUtcDatetime("2026-11-05 17:30:00");
    expect(parsed.toISOString()).toBe("2026-11-05T17:30:00.000Z");
  });
});

describe("resolveEffectiveOdooAttendanceWindow — overtime & closing time rules", () => {
  it("rejects days missing clock-in or clock-out", () => {
    expect(
      resolveEffectiveOdooAttendanceWindow({
        actualIn: new Date("2026-11-05T08:00:00Z"),
        actualOut: null,
        scheduledStart: new Date("2026-11-05T08:00:00Z"),
        scheduledEnd: new Date("2026-11-05T17:00:00Z"),
        overtimeMinutes: 0,
        payableOvertimeMinutes: 0,
      }),
    ).toEqual({ ok: false, reason: "MISSING_PUNCH" });
  });

  it("sends actualIn and actualOut for a normal shift with no overtime", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-05T08:02:00Z"),
      actualOut: new Date("2026-11-05T17:00:00Z"),
      scheduledStart: new Date("2026-11-05T08:00:00Z"),
      scheduledEnd: new Date("2026-11-05T17:00:00Z"),
      overtimeMinutes: 0,
      payableOvertimeMinutes: 0,
    });

    expect(res).toEqual({
      ok: true,
      checkIn: new Date("2026-11-05T08:02:00Z"),
      checkOut: new Date("2026-11-05T17:00:00Z"),
      checkInUtc: "2026-11-05 08:02:00",
      checkOutUtc: "2026-11-05 17:00:00",
      cappedAtScheduledEnd: false,
      includesApprovedOvertime: false,
    });
  });

  it("caps check_out at scheduledEnd when employee worked overtime that is NOT approved", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-05T08:00:00Z"),
      actualOut: new Date("2026-11-05T19:15:00Z"),
      scheduledStart: new Date("2026-11-05T08:00:00Z"),
      scheduledEnd: new Date("2026-11-05T17:00:00Z"),
      overtimeMinutes: 135,
      payableOvertimeMinutes: 0,
    });

    expect(res).toEqual({
      ok: true,
      checkIn: new Date("2026-11-05T08:00:00Z"),
      checkOut: new Date("2026-11-05T17:00:00Z"),
      checkInUtc: "2026-11-05 08:00:00",
      checkOutUtc: "2026-11-05 17:00:00",
      cappedAtScheduledEnd: true,
      includesApprovedOvertime: false,
    });
  });

  it("sends the overtime closing time (actualOut) when full overtime is approved", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-05T08:00:00Z"),
      actualOut: new Date("2026-11-05T19:15:00Z"),
      scheduledStart: new Date("2026-11-05T08:00:00Z"),
      scheduledEnd: new Date("2026-11-05T17:00:00Z"),
      overtimeMinutes: 135,
      payableOvertimeMinutes: 135,
    });

    expect(res).toEqual({
      ok: true,
      checkIn: new Date("2026-11-05T08:00:00Z"),
      checkOut: new Date("2026-11-05T19:15:00Z"),
      checkInUtc: "2026-11-05 08:00:00",
      checkOutUtc: "2026-11-05 19:15:00",
      cappedAtScheduledEnd: false,
      includesApprovedOvertime: true,
    });
  });

  it("sends scheduledEnd + payableOvertimeMinutes when a manager overrides or approves partial overtime", () => {
    const res = resolveEffectiveOdooAttendanceWindow({
      actualIn: new Date("2026-11-05T08:00:00Z"),
      actualOut: new Date("2026-11-05T19:30:00Z"),
      scheduledStart: new Date("2026-11-05T08:00:00Z"),
      scheduledEnd: new Date("2026-11-05T17:00:00Z"),
      overtimeMinutes: 150,
      payableOvertimeMinutes: 60, // Manager approved 1 hour of overtime
    });

    expect(res).toEqual({
      ok: true,
      checkIn: new Date("2026-11-05T08:00:00Z"),
      checkOut: new Date("2026-11-05T18:00:00Z"),
      checkInUtc: "2026-11-05 08:00:00",
      checkOutUtc: "2026-11-05 18:00:00",
      cappedAtScheduledEnd: false,
      includesApprovedOvertime: true,
    });
  });
});

describe("normalizeOdooEmployee & matchOdooEmployeeToLocal", () => {
  const localEmployees: LocalEmployeeCandidate[] = [
    {
      id: "emp_linked",
      odooEmployeeId: "10",
      firstName: "Kwame",
      lastName: "Mensah",
      email: "kwame@basilissagh.com",
      phone: "+233244000111",
    },
    {
      id: "emp_unlinked_email",
      odooEmployeeId: null,
      firstName: "Gideon",
      lastName: "Otuboah",
      email: "gideonotuboah@basilissagh.com",
      phone: "0244123456",
    },
    {
      id: "emp_unlinked_phone",
      odooEmployeeId: null,
      firstName: "Ama",
      lastName: "Boateng",
      email: null,
      phone: "+233551234567",
    },
    {
      id: "emp_unlinked_name",
      odooEmployeeId: null,
      firstName: "Kofi",
      lastName: "Asante",
      email: null,
      phone: null,
    },
  ];

  it("matches an already-linked employee by odooEmployeeId", () => {
    const normalized = normalizeOdooEmployee({
      id: 10,
      name: "MENSAH KWAME",
      job_title: "Head Chef",
      work_email: "kwame@basilissagh.com",
      department_id: [3, "Accra Mall Management"],
      active: true,
    })!;

    expect(normalized.branchSpec.slug).toBe("accra-mall");
    expect(normalized.department).toBe("KITCHEN");
    expect(matchOdooEmployeeToLocal(normalized, localEmployees)).toEqual({
      kind: "already_linked",
      localEmployeeId: "emp_linked",
    });
  });

  it("matches an unlinked local employee by email, phone suffix, or name", () => {
    const byEmail = normalizeOdooEmployee({
      id: 25,
      name: "OTUBOAH GIDEON",
      work_email: "GideonOtuboah@basilissagh.com",
      active: true,
    })!;
    expect(matchOdooEmployeeToLocal(byEmail, localEmployees)).toEqual({
      kind: "link_existing",
      localEmployeeId: "emp_unlinked_email",
      matchedBy: "email",
    });

    const byPhone = normalizeOdooEmployee({
      id: 26,
      name: "BOATENG AMA",
      work_phone: "055 123 4567",
      active: true,
    })!;
    expect(matchOdooEmployeeToLocal(byPhone, localEmployees)).toEqual({
      kind: "link_existing",
      localEmployeeId: "emp_unlinked_phone",
      matchedBy: "phone",
    });

    const byName = normalizeOdooEmployee({
      id: 27,
      name: "ASANTE KOFI",
      active: true,
    })!;
    expect(matchOdooEmployeeToLocal(byName, localEmployees)).toEqual({
      kind: "link_existing",
      localEmployeeId: "emp_unlinked_name",
      matchedBy: "name",
    });
  });

  it("returns create_new when no local employee matches", () => {
    const brandNew = normalizeOdooEmployee({
      id: 99,
      name: "OWUSU NANA YAA",
      job_title: "Cashier",
      department_id: [5, "Tema Branch Management"],
      active: true,
    })!;

    expect(brandNew.branchSpec.slug).toBe("tema-community-6");
    expect(brandNew.department).toBe("SERVICE");
    expect(matchOdooEmployeeToLocal(brandNew, localEmployees)).toEqual({
      kind: "create_new",
    });
  });
});
