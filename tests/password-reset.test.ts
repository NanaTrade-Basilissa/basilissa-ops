import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/modules/identity/validation";

/**
 * The redemption path itself is exercised against a real database in the
 * verification run, because its correctness lives in transactions and a
 * uniqueness constraint rather than in branching. What is pure, and what a
 * mistake here would quietly weaken, is the password rule.
 */

const VALID = {
  token: "abc",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
};

describe("the new password", () => {
  it("accepts a memorable phrase", () => {
    expect(resetPasswordSchema.safeParse(VALID).success).toBe(true);
  });

  /*
    Length, not composition. Requiring a digit and a symbol reliably produces
    `Password1!` — predictable, and weaker than a longer ordinary phrase. The
    rule that earns its place is the minimum length.
  */
  it("does not demand digits, symbols or mixed case", () => {
    expect(
      resetPasswordSchema.safeParse({
        ...VALID,
        password: "allloweralpha",
        confirmPassword: "allloweralpha",
      }).success,
    ).toBe(true);
  });

  it("refuses anything under twelve characters", () => {
    const eleven = "abcdefghijk";
    expect(eleven).toHaveLength(11);
    expect(
      resetPasswordSchema.safeParse({ ...VALID, password: eleven, confirmPassword: eleven }).success,
    ).toBe(false);
  });

  // The shape a length check invites when someone is trying to get past it.
  it("refuses one character repeated to reach the length", () => {
    const padded = "a".repeat(20);
    expect(
      resetPasswordSchema.safeParse({ ...VALID, password: padded, confirmPassword: padded }).success,
    ).toBe(false);
  });

  it("refuses a mismatch, and says which field is wrong", () => {
    const parsed = resetPasswordSchema.safeParse({
      ...VALID,
      confirmPassword: "something else entirely",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("refuses a submission with no token", () => {
    expect(resetPasswordSchema.safeParse({ ...VALID, token: "" }).success).toBe(false);
  });

  // Long passphrases are the encouraged shape, so the ceiling must not be mean.
  it("allows a genuinely long passphrase", () => {
    const long = "a moderately long passphrase that someone might actually choose to use";
    expect(long.length).toBeGreaterThan(50);
    expect(
      resetPasswordSchema.safeParse({ ...VALID, password: long, confirmPassword: long }).success,
    ).toBe(true);
  });

  it("refuses one longer than the column deserves", () => {
    const absurd = "x".repeat(201);
    expect(
      resetPasswordSchema.safeParse({ ...VALID, password: absurd, confirmPassword: absurd }).success,
    ).toBe(false);
  });
});

describe("the address asked for", () => {
  it("must look like an address", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-address" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });

  it("accepts an ordinary one", () => {
    expect(forgotPasswordSchema.safeParse({ email: "hr@basilissa.gh" }).success).toBe(true);
  });
});
