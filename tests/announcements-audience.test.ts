import { describe, expect, it } from "vitest";
import {
  checkAudienceAllowed,
  resolveRecipients,
  type AudienceSpec,
  type DirectoryEntry,
} from "@/lib/modules/announcements/audience";
import { announcementSchema, audienceSchema } from "@/lib/modules/announcements/validation";
import type { BranchScope } from "@/lib/modules/identity/authorization";

/**
 * The rule that keeps a branch manager out of other branches, tested the way
 * payroll rules are: exhaustively, with no database.
 */

const DIRECTORY: DirectoryEntry[] = [
  { id: "ama", active: true, branchIds: ["accra"] },
  { id: "kofi", active: true, branchIds: ["accra", "tema"] },
  { id: "esi", active: true, branchIds: ["tema"] },
  { id: "yaw", active: false, branchIds: ["accra"] },
  { id: "nobody", active: true, branchIds: [] },
];

const ALL: BranchScope = { kind: "all" };
const ACCRA_ONLY: BranchScope = { kind: "branches", branchIds: ["accra"] };
const NONE: BranchScope = { kind: "none" };

describe("resolveRecipients", () => {
  it("Everyone is every active employee, once, in a stable order", () => {
    expect(resolveRecipients({ kind: "ALL" }, DIRECTORY)).toEqual(["ama", "esi", "kofi", "nobody"]);
  });

  it("Branches is the active staff assigned to any chosen branch", () => {
    expect(resolveRecipients({ kind: "BRANCHES", branchIds: ["accra"] }, DIRECTORY)).toEqual(["ama", "kofi"]);
  });

  it("an employee at two chosen branches is counted once", () => {
    expect(resolveRecipients({ kind: "BRANCHES", branchIds: ["accra", "tema"] }, DIRECTORY)).toEqual([
      "ama",
      "esi",
      "kofi",
    ]);
  });

  it("People is just the chosen, and never someone inactive", () => {
    expect(resolveRecipients({ kind: "PEOPLE", employeeIds: ["ama", "yaw", "esi"] }, DIRECTORY)).toEqual([
      "ama",
      "esi",
    ]);
  });

  it("a duplicated id in People does not duplicate a recipient", () => {
    expect(resolveRecipients({ kind: "PEOPLE", employeeIds: ["ama", "ama"] }, DIRECTORY)).toEqual(["ama"]);
  });

  it("an audience nobody matches resolves to no one", () => {
    expect(resolveRecipients({ kind: "BRANCHES", branchIds: ["osu"] }, DIRECTORY)).toEqual([]);
  });
});

describe("checkAudienceAllowed", () => {
  it("a company-wide sender may address anyone", () => {
    expect(checkAudienceAllowed({ kind: "ALL" }, ALL, DIRECTORY)).toEqual({ ok: true });
    expect(checkAudienceAllowed({ kind: "BRANCHES", branchIds: ["tema"] }, ALL, DIRECTORY)).toEqual({ ok: true });
    expect(checkAudienceAllowed({ kind: "PEOPLE", employeeIds: ["esi"] }, ALL, DIRECTORY)).toEqual({ ok: true });
  });

  it("a branch-scoped sender can never send to Everyone", () => {
    expect(checkAudienceAllowed({ kind: "ALL" }, ACCRA_ONLY, DIRECTORY)).toEqual({
      ok: false,
      reason: "ALL_NEEDS_GLOBAL",
    });
  });

  it("a branch-scoped sender may address their own branch", () => {
    expect(checkAudienceAllowed({ kind: "BRANCHES", branchIds: ["accra"] }, ACCRA_ONLY, DIRECTORY)).toEqual({ ok: true });
  });

  it("naming one foreign branch among their own refuses the whole send", () => {
    expect(checkAudienceAllowed({ kind: "BRANCHES", branchIds: ["accra", "tema"] }, ACCRA_ONLY, DIRECTORY)).toEqual({
      ok: false,
      reason: "BRANCH_OUT_OF_SCOPE",
    });
  });

  it("a branch-scoped sender may address people at their branch, including someone who also works elsewhere", () => {
    expect(checkAudienceAllowed({ kind: "PEOPLE", employeeIds: ["ama", "kofi"] }, ACCRA_ONLY, DIRECTORY)).toEqual({
      ok: true,
    });
  });

  it("a branch-scoped sender cannot reach a person at another branch by id", () => {
    expect(checkAudienceAllowed({ kind: "PEOPLE", employeeIds: ["ama", "esi"] }, ACCRA_ONLY, DIRECTORY)).toEqual({
      ok: false,
      reason: "PERSON_OUT_OF_SCOPE",
    });
  });

  it("a person with no branch at all is out of scope, not allowed by default", () => {
    expect(checkAudienceAllowed({ kind: "PEOPLE", employeeIds: ["nobody"] }, ACCRA_ONLY, DIRECTORY)).toEqual({
      ok: false,
      reason: "PERSON_OUT_OF_SCOPE",
    });
  });

  it("an id that is not in the directory is refused, even for a company-wide sender", () => {
    expect(checkAudienceAllowed({ kind: "PEOPLE", employeeIds: ["ghost"] }, ALL, DIRECTORY)).toEqual({
      ok: false,
      reason: "UNKNOWN_PERSON",
    });
    expect(checkAudienceAllowed({ kind: "PEOPLE", employeeIds: ["ghost"] }, ACCRA_ONLY, DIRECTORY)).toEqual({
      ok: false,
      reason: "UNKNOWN_PERSON",
    });
  });

  it("no scope means no access, whatever is asked", () => {
    const specs: AudienceSpec[] = [
      { kind: "ALL" },
      { kind: "BRANCHES", branchIds: ["accra"] },
      { kind: "PEOPLE", employeeIds: ["ama"] },
    ];
    for (const spec of specs) {
      expect(checkAudienceAllowed(spec, NONE, DIRECTORY)).toEqual({ ok: false, reason: "NO_ACCESS" });
    }
  });
});

describe("announcementSchema", () => {
  const valid = {
    title: "  Branch closed Friday ",
    body: "Please see your manager.",
    audienceKind: "BRANCHES" as const,
    branchIds: ["accra"],
    employeeIds: [],
    sendPush: true,
    isUrgent: false,
    bannerHours: 24,
    requiresAck: false,
  };

  it("trims and accepts a complete announcement", () => {
    const parsed = announcementSchema.parse(valid);
    expect(parsed.title).toBe("Branch closed Friday");
  });

  it("requires a title and a message", () => {
    expect(announcementSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...valid, body: "" }).success).toBe(false);
  });

  it("requires at least one branch for Branches and one person for People", () => {
    expect(announcementSchema.safeParse({ ...valid, branchIds: [] }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...valid, audienceKind: "PEOPLE", employeeIds: [] }).success).toBe(false);
  });

  it("does not require a list for Everyone", () => {
    expect(announcementSchema.safeParse({ ...valid, audienceKind: "ALL", branchIds: [] }).success).toBe(true);
  });

  it("refuses an unknown audience kind", () => {
    expect(announcementSchema.safeParse({ ...valid, audienceKind: "EVERYBODY" }).success).toBe(false);
    expect(audienceSchema.safeParse({ audienceKind: "EVERYBODY", branchIds: [], employeeIds: [] }).success).toBe(false);
  });

  it("caps hand-picked people so a request cannot be made enormous", () => {
    const ids = Array.from({ length: 501 }, (_, i) => `e${i}`);
    expect(announcementSchema.safeParse({ ...valid, audienceKind: "PEOPLE", employeeIds: ids }).success).toBe(false);
  });
});
