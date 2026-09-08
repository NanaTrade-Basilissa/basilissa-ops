import { describe, expect, it } from "vitest";
import { employeeInputSchema } from "@/lib/modules/employees/validation";

const BASE = { employeeCode: "E001", firstName: "Ama", lastName: "Mensah", status: "ACTIVE" as const };

describe("an employee's email", () => {
  it("is null when omitted, since most staff have no account or address on file", () => {
    const parsed = employeeInputSchema.safeParse(BASE);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.email).toBeNull();
  });

  it("accepts a real address, lowercased and trimmed", () => {
    const parsed = employeeInputSchema.safeParse({ ...BASE, email: "  Ama@X.GH " });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.email).toBe("ama@x.gh");
  });

  it("refuses something that is not an address", () => {
    const parsed = employeeInputSchema.safeParse({ ...BASE, email: "not-an-address" });
    expect(parsed.success).toBe(false);
  });
});
