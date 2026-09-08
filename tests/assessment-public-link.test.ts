import { describe, expect, it } from "vitest";
import { publicLinkConfigSchema, publicDeclarationSchema } from "@/lib/modules/assessments/validation";

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
    // Empty string, not null: null means "not yet declared" and would show
    // the declaration step again on every reload (see loadForTaking).
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
        if (!parsed.success) continue; // REQUIRED-and-omitted cases fail validation, not relevant here
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
    const parsed = publicLinkConfigSchema.safeParse({
      enabled: true,
      nameMode: "HIDDEN",
      emailMode: "REQUIRED",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unrecognised mode", () => {
    const parsed = publicLinkConfigSchema.safeParse({
      enabled: true,
      nameMode: "SOMETIMES",
      emailMode: "REQUIRED",
    });
    expect(parsed.success).toBe(false);
  });
});
