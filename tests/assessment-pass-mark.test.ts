import { describe, expect, it } from "vitest";
import { assessmentDetailsSchema } from "@/lib/modules/assessments/validation";

/**
 * `passMarkPercent` has to tell three things apart, all arriving as form
 * data (strings, or absent entirely): a real value, "clear the one that was
 * set," and "this form does not offer the field at all." Absent and cleared
 * both have to reach the caller as the same `undefined` — see the comment on
 * the schema for why that is deliberate rather than a gap.
 */

const BASE = { title: "Till Operations", showScoreToTaker: false };

describe("passMarkPercent", () => {
  it("is undefined when the field is omitted entirely, as the create form omits it", () => {
    const parsed = assessmentDetailsSchema.safeParse(BASE);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.passMarkPercent).toBeUndefined();
  });

  it("is undefined for an empty string, as a cleared field submits", () => {
    const parsed = assessmentDetailsSchema.safeParse({ ...BASE, passMarkPercent: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.passMarkPercent).toBeUndefined();
  });

  it("parses a numeric form-data string to a number", () => {
    const parsed = assessmentDetailsSchema.safeParse({ ...BASE, passMarkPercent: "70" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.passMarkPercent).toBe(70);
  });

  it("accepts the boundary values 0 and 100", () => {
    expect(assessmentDetailsSchema.safeParse({ ...BASE, passMarkPercent: "0" }).success).toBe(true);
    expect(assessmentDetailsSchema.safeParse({ ...BASE, passMarkPercent: "100" }).success).toBe(
      true,
    );
  });

  it("refuses a value outside 0 to 100", () => {
    expect(assessmentDetailsSchema.safeParse({ ...BASE, passMarkPercent: "-1" }).success).toBe(
      false,
    );
    expect(assessmentDetailsSchema.safeParse({ ...BASE, passMarkPercent: "101" }).success).toBe(
      false,
    );
  });

  it("refuses a non-integer", () => {
    expect(assessmentDetailsSchema.safeParse({ ...BASE, passMarkPercent: "55.5" }).success).toBe(
      false,
    );
  });

  it("refuses something that is not a number at all", () => {
    expect(
      assessmentDetailsSchema.safeParse({ ...BASE, passMarkPercent: "not-a-number" }).success,
    ).toBe(false);
  });
});
