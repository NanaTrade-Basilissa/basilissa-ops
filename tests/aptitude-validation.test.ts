import { describe, expect, it } from "vitest";
import { parseBulkCandidateLines, publicDeclarationSchema, publicLinkConfigSchema } from "@/lib/modules/aptitude/validation";

describe("publicDeclarationSchema", () => {
  it("requires a REQUIRED field and rejects it blank", () => {
    const schema = publicDeclarationSchema("REQUIRED", "OPTIONAL");
    expect(schema.safeParse({ name: "", email: undefined }).success).toBe(false);
    expect(schema.safeParse({ name: "Ama", email: undefined }).success).toBe(true);
  });

  it("accepts an OPTIONAL field blank, resolving to empty string rather than null", () => {
    const schema = publicDeclarationSchema("REQUIRED", "OPTIONAL");
    const parsed = schema.safeParse({ name: "Ama", email: undefined });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.email).toBe("");
  });

  it("ignores whatever a HIDDEN field's raw input is, always resolving to empty string", () => {
    const schema = publicDeclarationSchema("HIDDEN", "REQUIRED");
    const parsed = schema.safeParse({ name: "anything, even garbage", email: "ama@example.com" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.name).toBe("");
    expect(parsed.success && parsed.data.email).toBe("ama@example.com");
  });

  it("never produces null for either field, regardless of mode", () => {
    for (const nameMode of ["REQUIRED", "OPTIONAL", "HIDDEN"] as const) {
      for (const emailMode of ["REQUIRED", "OPTIONAL", "HIDDEN"] as const) {
        const schema = publicDeclarationSchema(nameMode, emailMode);
        const parsed = schema.safeParse({
          name: nameMode === "HIDDEN" ? undefined : "A Name",
          email: emailMode === "HIDDEN" ? undefined : "a@b.com",
        });
        if (!parsed.success) continue;
        expect(parsed.data.name).not.toBeNull();
        expect(parsed.data.email).not.toBeNull();
      }
    }
  });

  it("lowercases and trims a given email", () => {
    const schema = publicDeclarationSchema("HIDDEN", "OPTIONAL");
    const parsed = schema.safeParse({ name: undefined, email: "  Ama@Example.COM  " });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.email).toBe("ama@example.com");
  });
});

describe("publicLinkConfigSchema", () => {
  it("accepts independent modes per field", () => {
    const parsed = publicLinkConfigSchema.safeParse({ enabled: true, nameMode: "HIDDEN", emailMode: "REQUIRED" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unrecognised mode", () => {
    const parsed = publicLinkConfigSchema.safeParse({ enabled: true, nameMode: "SOMETIMES", emailMode: "REQUIRED" });
    expect(parsed.success).toBe(false);
  });
});

describe("parseBulkCandidateLines", () => {
  it("parses 'Name <email>' form", () => {
    expect(parseBulkCandidateLines("Ama Mensah <ama@example.com>")).toEqual([
      { name: "Ama Mensah", email: "ama@example.com" },
    ]);
  });

  it("parses 'Name, email' form", () => {
    expect(parseBulkCandidateLines("Kwesi Boateng, kwesi@example.com")).toEqual([
      { name: "Kwesi Boateng", email: "kwesi@example.com" },
    ]);
  });

  it("parses 'email, Name' form the other way round too", () => {
    expect(parseBulkCandidateLines("kwesi@example.com, Kwesi Boateng")).toEqual([
      { name: "Kwesi Boateng", email: "kwesi@example.com" },
    ]);
  });

  it("accepts a bare email with no name", () => {
    expect(parseBulkCandidateLines("ama@example.com")).toEqual([{ name: "", email: "ama@example.com" }]);
  });

  it("lowercases and trims every email", () => {
    expect(parseBulkCandidateLines("  Ama <Ama@Example.COM>  ")).toEqual([{ name: "Ama", email: "ama@example.com" }]);
  });

  it("skips blank lines", () => {
    expect(parseBulkCandidateLines("a@b.com\n\n  \nc@d.com")).toHaveLength(2);
  });

  it("skips a line with no valid email", () => {
    expect(parseBulkCandidateLines("Ama Mensah\nnot-an-email\nkwesi@example.com")).toEqual([
      { name: "", email: "kwesi@example.com" },
    ]);
  });

  it("de-duplicates by email, keeping the first occurrence", () => {
    expect(parseBulkCandidateLines("Ama <a@b.com>\nSomeone Else <a@b.com>")).toEqual([{ name: "Ama", email: "a@b.com" }]);
  });

  it("handles several candidates across lines", () => {
    const result = parseBulkCandidateLines("Ama <ama@x.com>\nkwesi@x.com\nYaw, yaw@x.com");
    expect(result).toEqual([
      { name: "Ama", email: "ama@x.com" },
      { name: "", email: "kwesi@x.com" },
      { name: "Yaw", email: "yaw@x.com" },
    ]);
  });
});
