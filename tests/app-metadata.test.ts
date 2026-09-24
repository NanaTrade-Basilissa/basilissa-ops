import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

describe("Application Metadata & OpenGraph", () => {
  it("root layout metadata provides defaults for public customer feedback", async () => {
    const { metadata } = await import("@/app/layout");

    expect(metadata.metadataBase).toBeDefined();
    expect(metadata.title).toEqual({
      default: "Basilissa Feedback",
      template: "%s | Basilissa Feedback",
    });
    expect(metadata.description).toContain("Share feedback about your visit");
    expect(metadata.openGraph?.title).toBe("Basilissa Feedback");
    expect(metadata.openGraph?.siteName).toBe("Basilissa Feedback");
  });

  it("admin layout overrides title template, description, and OpenGraph for Basilissa Ops", async () => {
    const { metadata } = await import("@/app/admin/layout");

    expect(metadata.title).toEqual({
      default: "Basilissa Ops",
      template: "%s | Basilissa Ops",
    });
    expect(metadata.description).toContain("Operations management portal for Basilissa Ghana");
    expect(metadata.description).toContain("attendance");
    expect(metadata.description).toContain("scheduling");
    expect(metadata.openGraph?.title).toBe("Basilissa Ops");
    expect(metadata.openGraph?.siteName).toBe("Basilissa Ops");
    expect(metadata.openGraph?.description).toContain("Operations management portal");
    expect(metadata.twitter?.title).toBe("Basilissa Ops");
  });

  it("admin login page specifies Admin sign in metadata matching Basilissa Ops", async () => {
    const { metadata } = await import("@/app/admin/login/page");

    expect(metadata.title).toBe("Admin sign in");
    expect(metadata.description).toContain("Sign in to Basilissa Operations");
    expect(metadata.openGraph?.title).toBe("Admin sign in | Basilissa Ops");
  });

  it("candidate assessment layout isolates candidates from feedback branding", async () => {
    const { metadata } = await import("@/app/assessment/layout");

    expect(metadata.title).toEqual({
      default: "Assessment | Basilissa",
      template: "%s | Basilissa",
    });
    expect(metadata.description).toContain("Candidate assessment portal");
  });

  it("candidate aptitude layout isolates candidates from feedback branding", async () => {
    const { metadata } = await import("@/app/aptitude/layout");

    expect(metadata.title).toEqual({
      default: "Aptitude Test | Basilissa",
      template: "%s | Basilissa",
    });
    expect(metadata.description).toContain("Candidate aptitude testing portal");
  });
});
