import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isValidVersion,
  resolveUpdateStatus,
  type ReleaseLike,
} from "@/lib/modules/releases/constants";
import { releaseInputSchema } from "@/lib/modules/releases/validation";

const rel = (version: string, updateMode: "FLEXIBLE" | "REQUIRED" = "FLEXIBLE", releaseNotes: string | null = null): ReleaseLike => ({
  version,
  updateMode,
  releaseNotes,
});

describe("version comparison", () => {
  it("compares numerically, not lexically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
  });

  it("treats missing parts as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("2", "1.9.9")).toBeGreaterThan(0);
  });

  it("validates the accepted shapes only", () => {
    expect(isValidVersion("1.0.0")).toBe(true);
    expect(isValidVersion("1.2")).toBe(true);
    expect(isValidVersion("v1.0.0")).toBe(false);
    expect(isValidVersion("1.0.0-beta")).toBe(false);
    expect(isValidVersion("1.0.0.1")).toBe(false);
    expect(isValidVersion("")).toBe(false);
  });
});

describe("resolveUpdateStatus", () => {
  it("says nothing is available when no release is recorded", () => {
    const s = resolveUpdateStatus([], "1.0.0");
    expect(s).toMatchObject({ updateAvailable: false, updateMode: "NONE", latestVersion: null, minRequiredVersion: null });
  });

  it("says nothing is available when the build is the latest", () => {
    expect(resolveUpdateStatus([rel("1.2.0")], "1.2.0").updateMode).toBe("NONE");
  });

  it("offers a flexible update to an older build", () => {
    const s = resolveUpdateStatus([rel("1.2.0", "FLEXIBLE", "Fixes")], "1.0.0");
    expect(s).toMatchObject({ updateAvailable: true, updateMode: "FLEXIBLE", latestVersion: "1.2.0", releaseNotes: "Fixes" });
  });

  it("blocks every build below a required release, however far behind", () => {
    const releases = [rel("1.1.0"), rel("1.3.0", "REQUIRED")];
    expect(resolveUpdateStatus(releases, "1.2.0").updateMode).toBe("REQUIRED");
    expect(resolveUpdateStatus(releases, "1.0.0").updateMode).toBe("REQUIRED");
    expect(resolveUpdateStatus(releases, "1.10.0").updateMode).toBe("NONE");
    expect(resolveUpdateStatus(releases, "1.3.0").updateMode).toBe("NONE");
  });

  it("keeps an older required floor when a newer release is only flexible", () => {
    const releases = [rel("1.3.0", "REQUIRED"), rel("1.4.0", "FLEXIBLE")];
    expect(resolveUpdateStatus(releases, "1.2.0")).toMatchObject({ updateMode: "REQUIRED", minRequiredVersion: "1.3.0" });
    // At the required version the newer flexible release is merely offered.
    expect(resolveUpdateStatus(releases, "1.3.0").updateMode).toBe("FLEXIBLE");
  });

  it("lets a newer required release supersede an older one", () => {
    const releases = [rel("1.3.0", "REQUIRED"), rel("1.5.0", "REQUIRED")];
    const s = resolveUpdateStatus(releases, "1.4.0");
    expect(s).toMatchObject({ updateMode: "REQUIRED", minRequiredVersion: "1.5.0" });
  });

  it("reports the newest release's notes, whatever order rows arrive in", () => {
    const s = resolveUpdateStatus([rel("1.4.0", "FLEXIBLE", "new"), rel("1.2.0", "FLEXIBLE", "old")], "1.0.0");
    expect(s.releaseNotes).toBe("new");
  });

  it("never blocks on an unreadable current version", () => {
    expect(resolveUpdateStatus([rel("2.0.0", "REQUIRED")], "garbage").updateMode).toBe("NONE");
  });
});

describe("releaseInputSchema", () => {
  it("defaults push to off and empty notes to null", () => {
    const parsed = releaseInputSchema.parse({ platform: "IOS", version: " 1.2.0 ", updateMode: "FLEXIBLE", releaseNotes: "  " });
    expect(parsed).toMatchObject({ version: "1.2.0", sendPush: false, releaseNotes: null });
  });

  it("rejects a malformed version", () => {
    expect(releaseInputSchema.safeParse({ platform: "IOS", version: "one", updateMode: "REQUIRED" }).success).toBe(false);
  });
});
