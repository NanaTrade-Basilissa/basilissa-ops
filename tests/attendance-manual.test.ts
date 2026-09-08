import { describe, expect, it } from "vitest";
import { ManualEntryReason, Role } from "@prisma/client";
import {
  SECOND_APPROVAL_AFTER_DAYS,
  checkManualEntry,
  type ManualEntryContext,
} from "@/lib/modules/attendance/manual";
import { permissionsForRole } from "@/lib/modules/identity/authorization";

/**
 * Manual entry is the only capture path with no verification of any kind, and
 * it is the one available first — used precisely when something else has
 * failed. These are the rules that sit in front of it.
 */

const NOW = new Date("2026-03-10T12:00:00Z");

function context(overrides: Partial<ManualEntryContext> = {}): ManualEntryContext {
  return {
    actorUserId: "user_manager",
    actorEmployeeId: "emp_manager",
    targetEmployeeId: "emp_other",
    occurredAt: new Date("2026-03-10T08:00:00Z"),
    now: NOW,
    maxRetroDays: 7,
    reasonCode: ManualEntryReason.DEVICE_OFFLINE,
    reasonText: "Terminal was down all morning",
    ...overrides,
  };
}

describe("self-entry", () => {
  /**
   * The single easiest fraud in the system: a manager creating their own hours
   * with no verification. Costs nothing to forbid, so it is forbidden outright
   * rather than merely audited.
   */
  it("refuses a manager recording their own attendance", () => {
    const result = checkManualEntry(context({ targetEmployeeId: "emp_manager" }));

    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe("SELF_ENTRY_FORBIDDEN");
  });

  it("allows recording for someone else", () => {
    expect(checkManualEntry(context()).allowed).toBe(true);
  });

  // An administrator with no employee record cannot be recording "their own"
  // attendance, so the check must not trip on a null.
  it("does not trip when the actor has no employee record", () => {
    expect(checkManualEntry(context({ actorEmployeeId: null })).allowed).toBe(true);
  });
});

describe("time bounds", () => {
  it("refuses a time that has not happened yet", () => {
    const result = checkManualEntry(
      context({ occurredAt: new Date("2026-03-10T18:00:00Z") }),
    );
    expect(result.allowed === false && result.reason).toBe("FUTURE_TIMESTAMP");
  });

  it("allows an entry inside the retro window", () => {
    expect(
      checkManualEntry(context({ occurredAt: new Date("2026-03-05T08:00:00Z"), maxRetroDays: 7 }))
        .allowed,
    ).toBe(true);
  });

  // Reaching far back to add hours is the shape fabrication takes, so the
  // window is a hard limit rather than a warning.
  it("refuses an entry older than the configured window", () => {
    const result = checkManualEntry(
      context({ occurredAt: new Date("2026-02-20T08:00:00Z"), maxRetroDays: 7 }),
    );
    expect(result.allowed === false && result.reason).toBe("RETRO_LIMIT_EXCEEDED");
  });

  it("takes the window from policy rather than a constant", () => {
    const old = { occurredAt: new Date("2026-03-05T08:00:00Z") };
    expect(checkManualEntry(context({ ...old, maxRetroDays: 3 })).allowed).toBe(false);
    expect(checkManualEntry(context({ ...old, maxRetroDays: 30 })).allowed).toBe(true);
  });
});

describe("second approval", () => {
  it("does not require one for same-day housekeeping", () => {
    const result = checkManualEntry(context());
    expect(result.allowed && result.requiresSecondApproval).toBe(false);
  });

  it("requires one once the entry reaches back far enough", () => {
    const result = checkManualEntry(
      context({
        occurredAt: new Date(NOW.getTime() - (SECOND_APPROVAL_AFTER_DAYS + 1) * 86_400_000),
      }),
    );
    expect(result.allowed && result.requiresSecondApproval).toBe(true);
  });
});

describe("reason", () => {
  // A code alone is unanalysable in the specific case; free text alone cannot
  // be counted across branches. OTHER with no explanation is just a blank.
  it("requires an explanation alongside OTHER", () => {
    const result = checkManualEntry(
      context({ reasonCode: ManualEntryReason.OTHER, reasonText: "" }),
    );
    expect(result.allowed === false && result.reason).toBe("REASON_TEXT_REQUIRED");
  });

  it("accepts OTHER with a real explanation", () => {
    expect(
      checkManualEntry(
        context({ reasonCode: ManualEntryReason.OTHER, reasonText: "Power cut, no terminal" }),
      ).allowed,
    ).toBe(true);
  });

  it("does not demand extra text for a self-explanatory code", () => {
    expect(
      checkManualEntry(
        context({ reasonCode: ManualEntryReason.DEVICE_OFFLINE, reasonText: "" }),
      ).allowed,
    ).toBe(true);
  });
});

describe("who may record manual attendance", () => {
  // A separate permission from attendance:write, because recording someone
  // else's hours with no verification is a different kind of act from viewing
  // or settling attendance.
  it("is granted only to roles that run a branch or own people", () => {
    const holders = Object.values(Role).filter((role) =>
      permissionsForRole(role).includes("attendance:manual_entry"),
    );

    expect(holders.sort()).toEqual(
      [Role.BRANCH_MANAGER, Role.AREA_MANAGER, Role.HR, Role.SUPER_ADMIN].sort(),
    );
  });

  it("is withheld from supervisors, administrators and employees", () => {
    for (const role of [Role.SHIFT_SUPERVISOR, Role.ADMINISTRATOR, Role.EMPLOYEE]) {
      expect(permissionsForRole(role)).not.toContain("attendance:manual_entry");
    }
  });

  it("still lets a supervisor see attendance without changing it", () => {
    expect(permissionsForRole(Role.SHIFT_SUPERVISOR)).toContain("attendance:read");
    expect(permissionsForRole(Role.SHIFT_SUPERVISOR)).not.toContain("attendance:write");
  });
});
