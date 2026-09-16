import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
const pathJoin = path.join;
import { describe, expect, it } from "vitest";
import { permissionsForRole } from "@/lib/modules/identity/authorization";
import { MFA_RECOMMENDED_ROLES, MFA_REQUIRED_ROLES } from "@/lib/modules/identity/constants";
import { recommendsMfa, requiresMfa } from "@/lib/modules/identity/server";
import { Role } from "@prisma/client";

/**
 * Structural tests, deliberately.
 *
 * The bug these exist for was not in any function: every piece behaved as
 * written. It was in how the pieces were arranged — the MFA check redirected
 * to a page whose LAYOUT ran the same check, so the redirect target redirected
 * to itself and locked every affected user out of the admin area. A unit test
 * of either half would have passed, and did.
 *
 * What can be checked cheaply is the arrangement: that the redirect targets
 * are reachable, and that no page's protection depends on a layout.
 */

const ROOT = path.resolve(__dirname, "..");
const GROUP = path.join(ROOT, "app/admin/(dashboard)");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function pagesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pagesIn(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

/**
 * The gate a file applies, if any.
 *
 * All three permission gates count: `requireBranchPermission` and
 * `requireAnyBranchPermission` apply the same MFA and permission checks as
 * `requirePermission`, just scoped to one branch or to "any at all"
 * respectively.
 */
function gateOf(source: string): "permission" | "shell" | "auth" | null {
  if (/require(AnyBranch|Branch)?Permission\(/.test(source)) return "permission";
  if (/requireAdminShell\(/.test(source)) return "shell";
  if (/requireAuth\(/.test(source)) return "auth";
  return null;
}

describe("the enrolment page stays reachable", () => {
  // The whole design rests on this one file. If the shared layout ever gates
  // on MFA again, everyone in a required role loses the admin area.
  it("is not wrapped in a layout that requires MFA", () => {
    const layout = read("app/admin/(dashboard)/layout.tsx");

    expect(gateOf(layout)).toBe("shell");
    expect(layout).not.toMatch(/requirePermission\(/);
    expect(layout).not.toMatch(/requireAdmin\(/);
  });

  it("gates on authentication alone, not permission", () => {
    expect(gateOf(read("app/admin/(dashboard)/security/page.tsx"))).toBe("auth");
  });

  it("is the page the MFA check actually redirects to", () => {
    const dal = read("lib/modules/identity/dal.ts");
    const target = dal.match(/redirect\("(\/admin\/security[^"]*)"\)/)?.[1];

    expect(target).toBe("/admin/security?enrol=required");
    expect(existsSync(path.join(GROUP, "security/page.tsx"))).toBe(true);
  });

  // requireAdminShell exists only to break the loop. A comment saying so is
  // not enforcement; this is.
  it("uses a shell gate that does not check MFA", () => {
    const dal = read("lib/modules/identity/dal.ts");
    const shell = dal.slice(dal.indexOf("export async function requireAdminShell"));
    const body = shell.slice(0, shell.indexOf("\n}"));

    expect(body).not.toMatch(/requireMfaIfNeeded/);
    expect(body).toMatch(/requireAuth\(\)/);
  });
});

describe("refusing someone does not bounce them into the thing that refused them", () => {
  it("sends admin-shell denials outside the layout that denied them", () => {
    const dal = read("lib/modules/identity/dal.ts");
    const shell = dal.slice(dal.indexOf("export async function requireAdminShell"));
    const target = shell.slice(0, shell.indexOf("\n}")).match(/redirect\("([^"]+)"\)/)?.[1];

    expect(target).toBe("/admin/no-access");
    // Outside the (dashboard) group is the entire point: inside it, the same
    // gate would refuse the destination too.
    expect(existsSync(path.join(ROOT, "app/admin/no-access/page.tsx"))).toBe(true);
    expect(existsSync(path.join(GROUP, "no-access/page.tsx"))).toBe(false);
  });

  it("does not gate the no-access page on the access it says you lack", () => {
    expect(gateOf(read("app/admin/no-access/page.tsx"))).toBe("auth");
  });
});

describe("no page relies on a layout for its protection", () => {
  /**
   * A Next.js layout is not a security boundary — it does not re-run on every
   * client-side navigation, and a route group is a filesystem convention
   * rather than a guarantee. Nine pages here were protected by nothing else,
   * which is also what made the layout gate load-bearing enough to lock
   * everyone out when it changed.
   */
  it("every page under the admin shell applies its own gate", () => {
    const ungated = pagesIn(GROUP)
      .filter((file) => gateOf(readFileSync(file, "utf8")) === null)
      .map((file) => path.relative(GROUP, file));

    expect(ungated).toEqual([]);
  });

  // The enrolment page is the sole intended exception, and it is an exception
  // to the permission check, not to authentication.
  it("only the enrolment page settles for authentication alone", () => {
    const authOnly = pagesIn(GROUP)
      .filter((file) => gateOf(readFileSync(file, "utf8")) === "auth")
      .map((file) => path.relative(GROUP, file));

    expect(authOnly).toEqual(["security/page.tsx"]);
  });
});

describe("everyone required to enrol can actually reach enrolment", () => {
  /**
   * The enrolment page sits inside the admin shell, which requires
   * `admin:access`. That is fine only while every role required to enrol holds
   * that permission. Add a required role without it and the person is told to
   * enrol, then refused the page that would let them — not a redirect loop, but
   * the same dead end by a longer route.
   */
  it("every MFA-required role holds admin:access", () => {
    for (const role of MFA_REQUIRED_ROLES) {
      expect(permissionsForRole(role)).toContain("admin:access");
    }
  });

  it("every MFA-recommended role holds admin:access", () => {
    for (const role of MFA_RECOMMENDED_ROLES) {
      expect(permissionsForRole(role)).toContain("admin:access");
    }
  });
});

describe("MFA classification helper functions", () => {
  it("strictly requires MFA only for super admin", () => {
    expect(requiresMfa([Role.SUPER_ADMIN])).toBe(true);
    expect(requiresMfa([Role.ADMINISTRATOR])).toBe(false);
    expect(requiresMfa([Role.HR])).toBe(false);
    expect(requiresMfa([Role.BRANCH_MANAGER])).toBe(false);
  });

  it("recommends MFA for administrator and HR", () => {
    expect(recommendsMfa([Role.ADMINISTRATOR])).toBe(true);
    expect(recommendsMfa([Role.HR])).toBe(true);
    expect(recommendsMfa([Role.SUPER_ADMIN])).toBe(false);
    expect(recommendsMfa([Role.BRANCH_MANAGER])).toBe(false);
  });
});

describe("pages for people who cannot sign in", () => {
  /**
   * The proxy redirects anything under /admin without a session cookie. A page
   * built for someone who has lost their password is useless if it is only
   * reachable by someone who still has one — and the failure is silent: the
   * page exists, works when tested while signed in, and redirects everybody
   * who actually needs it.
   */
  const PUBLIC = ["/admin/login", "/admin/forgot-password", "/admin/reset-password"];

  it("are all exempt from the proxy's session check", () => {
    const proxy = read("proxy.ts");
    const listed = proxy.match(/const PUBLIC_ADMIN_PATHS = \[([^\]]*)\]/)?.[1] ?? "";

    for (const path of PUBLIC) {
      expect(listed).toContain(`"${path}"`);
    }
  });

  it("exist as pages, so the exemption is not pointing at nothing", () => {
    for (const path of PUBLIC) {
      expect(existsSync(pathJoin(ROOT, "app", `${path}/page.tsx`))).toBe(true);
    }
  });

  // They must not sit inside the admin shell either: that layout requires a
  // session, so the proxy exemption alone would not be enough.
  it("are outside the layout that requires a session", () => {
    for (const path of PUBLIC) {
      expect(existsSync(pathJoin(GROUP, `${path.replace("/admin/", "")}/page.tsx`))).toBe(false);
    }
  });
});

describe("what the worker is allowed to import", () => {
  /**
   * The worker is a plain Node process. Importing a module's `server` entry
   * reaches its Data Access Layer, then `next/navigation`, then React's client
   * context, and the process dies at startup with
   * `React.createContext is not a function`.
   *
   * It is a startup crash rather than a subtle bug, but it only appears when
   * the worker actually runs — every gate passes, because typecheck, lint,
   * tests and `next build` never execute that import graph.
   */
  it("imports only `jobs` entry points from domain modules", () => {
    const offenders: string[] = [];

    for (const file of readdirSync(pathJoin(ROOT, "worker"))) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(pathJoin(ROOT, "worker", file), "utf8");

      for (const [, entry] of source.matchAll(/from "@\/lib\/modules\/\w+\/(\w+)"/g)) {
        if (entry !== "jobs" && entry !== "constants") offenders.push(`worker/${file} -> ${entry}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  // The rule is only worth anything if the entry points it points at exist.
  it("has a jobs entry point for every module the worker uses", () => {
    const used = new Set<string>();

    for (const file of readdirSync(pathJoin(ROOT, "worker"))) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(pathJoin(ROOT, "worker", file), "utf8");
      for (const [, mod] of source.matchAll(/from "@\/lib\/modules\/(\w+)\/jobs"/g)) used.add(mod);
    }

    expect(used.size).toBeGreaterThan(0);
    for (const mod of used) {
      expect(existsSync(pathJoin(ROOT, "lib/modules", mod, "jobs.ts"))).toBe(true);
    }
  });
});
