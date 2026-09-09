import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FEATURES, featureSnapshot, isFeatureEnabled } from "@/lib/platform/features";

const ROOT = path.resolve(__dirname, "..");
const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fn();
}

describe("defaults", () => {
  /*
    The asymmetry is the point. Outside production a flag defaults on, so local
    work and tests need no setup. In production it defaults off, so a flag
    somebody forgets to set fails towards the feature being invisible. One
    mistake costs a deploy; the other costs an explanation.
  */
  it("is on outside production when unset", () => {
    withEnv({ NODE_ENV: "development", FEATURE_ATTENDANCE: undefined }, () => {
      expect(isFeatureEnabled("attendance")).toBe(true);
    });
  });

  it("is off in production when unset", () => {
    withEnv({ NODE_ENV: "production", FEATURE_ATTENDANCE: undefined }, () => {
      expect(isFeatureEnabled("attendance")).toBe(false);
    });
  });
});

describe("explicit values override the default either way", () => {
  it("turns a feature on in production", () => {
    withEnv({ NODE_ENV: "production", FEATURE_ATTENDANCE: "on" }, () => {
      expect(isFeatureEnabled("attendance")).toBe(true);
    });
  });

  it("turns a feature off in development", () => {
    withEnv({ NODE_ENV: "development", FEATURE_ATTENDANCE: "off" }, () => {
      expect(isFeatureEnabled("attendance")).toBe(false);
    });
  });

  it("accepts the spellings people actually type", () => {
    for (const on of ["1", "true", "on", "yes", "enabled", "TRUE", " on "]) {
      withEnv({ NODE_ENV: "production", FEATURE_ATTENDANCE: on }, () => {
        expect(isFeatureEnabled("attendance"), on).toBe(true);
      });
    }
    for (const off of ["0", "false", "off", "no", "disabled", ""]) {
      withEnv({ NODE_ENV: "development", FEATURE_ATTENDANCE: off }, () => {
        expect(isFeatureEnabled("attendance"), off).toBe(false);
      });
    }
  });

  /*
    A typo must not enable anything. `FEATURE_ATTENDANCE=ture` in production
    falling through to "on" would be the flag silently not working, discovered
    by a customer.
  */
  it("treats an unrecognised value as unset rather than as on", () => {
    withEnv({ NODE_ENV: "production", FEATURE_ATTENDANCE: "ture" }, () => {
      expect(isFeatureEnabled("attendance")).toBe(false);
    });
    withEnv({ NODE_ENV: "development", FEATURE_ATTENDANCE: "ture" }, () => {
      expect(isFeatureEnabled("attendance")).toBe(true);
    });
  });
});

describe("the snapshot", () => {
  it("reports every registered flag", () => {
    expect(Object.keys(featureSnapshot()).sort()).toEqual(Object.keys(FEATURES).sort());
  });
});

/**
 * Structural, because the failure is silent: a gated page with an ungated
 * action looks correct in the browser and leaves the mutation reachable by
 * direct POST. Same shape as the `requireAdmin` migration, same reason.
 */
describe("nothing is gated by its page alone", () => {
  const GATED_PAGES = [
    "attendance/page.tsx",
    "attendance/policy/page.tsx",
    "attendance/[employeeId]/[date]/page.tsx",
    "shifts/page.tsx",
  ];

  it("gates every attendance and scheduling page", () => {
    const ungated = GATED_PAGES.filter((rel) => {
      const source = readFileSync(path.join(ROOT, "app/admin/(dashboard)", rel), "utf8");
      return !source.includes('requireFeature("attendance")');
    });

    expect(ungated).toEqual([]);
  });

  it("gates the Server Actions those pages submit to", () => {
    const attendance = readFileSync(ROOT + "/lib/modules/attendance/actions.ts", "utf8");
    const employees = readFileSync(ROOT + "/lib/modules/employees/actions.ts", "utf8");

    // Every exported action in the attendance module is gated.
    const exported = [...attendance.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    expect(exported.length).toBeGreaterThan(0);
    expect(attendance.match(/requireFeature\("attendance"\)/g)).toHaveLength(exported.length);

    // Scheduling lives in the employees module; only the shift actions are
    // gated there, because the employee record itself stays visible.
    expect(employees.match(/requireFeature\("attendance"\)/g)).toHaveLength(3);
  });

  // The guard calls notFound(), which cannot load in the worker's plain Node
  // process. Keeping it out of `features.ts` is what makes the worker safe.
  it("keeps next/navigation out of the flag module the worker reads", () => {
    const features = readFileSync(ROOT + "/lib/platform/features.ts", "utf8");
    expect(features).not.toMatch(/from "next\//);
  });
});

describe("the navigation", () => {
  it("marks every gated destination with its feature", () => {
    const nav = readFileSync(ROOT + "/components/admin/admin-nav.tsx", "utf8");

    for (const href of ["/admin/attendance", "/admin/shifts", "/admin/attendance/policy"]) {
      const line = nav.split("\n").find((l) => l.includes(`href: "${href}"`));
      expect(line, `no nav entry for ${href}`).toBeDefined();
      expect(line, `${href} is not flagged`).toContain('feature: "attendance"');
    }
  });

  // Employees is deliberately not flagged: the record stays available in
  // production, only its scheduling section goes.
  it("leaves employees unflagged", () => {
    const nav = readFileSync(ROOT + "/components/admin/admin-nav.tsx", "utf8");
    const line = nav.split("\n").find((l) => l.includes('href: "/admin/employees"'));
    expect(line).toBeDefined();
    expect(line).not.toContain("feature:");
  });
});
