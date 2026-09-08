import { describe, expect, it } from "vitest";
import { canOpen, open, seal } from "@/lib/platform/secret-box";

/**
 * Authenticated encryption for secrets the app must read but a database dump
 * must not yield — MFA seeds now, biometric templates in Phase 6.
 */

describe("round trip", () => {
  it("recovers what was sealed", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    expect(open(seal(plaintext, "mfa-totp"), "mfa-totp")).toBe(plaintext);
  });

  it("handles unicode and long values", () => {
    const plaintext = `${"x".repeat(5000)} — Ama Mensah ✓`;
    expect(open(seal(plaintext, "test"), "test")).toBe(plaintext);
  });

  it("handles an empty value", () => {
    expect(open(seal("", "test"), "test")).toBe("");
  });

  // A fresh IV each time, so identical secrets do not produce identical
  // ciphertext — otherwise the table would leak which users share a value.
  it("produces different ciphertext for the same input", () => {
    const a = seal("same", "test");
    const b = seal("same", "test");
    expect(a).not.toBe(b);
    expect(open(a, "test")).toBe(open(b, "test"));
  });
});

describe("integrity", () => {
  // GCM makes ciphertext tamper-evident: a modified row fails to decrypt
  // rather than decrypting to something else.
  it("refuses a tampered ciphertext", () => {
    const sealed = seal("JBSWY3DPEHPK3PXP", "mfa-totp");
    const [iv, ciphertext, tag] = sealed.split(".");
    const flipped = Buffer.from(ciphertext!, "base64url");
    flipped[0] ^= 0xff;

    expect(() => open(`${iv}.${flipped.toString("base64url")}.${tag}`, "mfa-totp")).toThrow();
  });

  it("refuses a tampered authentication tag", () => {
    const sealed = seal("secret", "test");
    const [iv, ciphertext] = sealed.split(".");
    expect(() => open(`${iv}.${ciphertext}.${Buffer.alloc(16).toString("base64url")}`, "test")).toThrow();
  });

  it("refuses a malformed value", () => {
    expect(() => open("not-sealed", "test")).toThrow(/Malformed/);
    expect(() => open("a.b", "test")).toThrow(/Malformed/);
  });
});

/**
 * Different purposes derive different keys, so a leak of one use cannot
 * decrypt another — a stolen MFA seed must not also open biometric templates.
 */
describe("purpose separation", () => {
  it("cannot open a value sealed for another purpose", () => {
    const sealed = seal("JBSWY3DPEHPK3PXP", "mfa-totp");
    expect(canOpen(sealed, "mfa-totp")).toBe(true);
    expect(canOpen(sealed, "biometric-template")).toBe(false);
  });

  it("reports readability without throwing at the call site", () => {
    expect(canOpen("garbage", "test")).toBe(false);
  });
});

describe("what is stored", () => {
  it("does not contain the plaintext anywhere", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const sealed = seal(plaintext, "mfa-totp");

    expect(sealed).not.toContain(plaintext);
    // Nor as raw bytes once decoded, which a naive encoding might leave.
    const joined = sealed
      .split(".")
      .map((part) => Buffer.from(part, "base64url").toString("latin1"))
      .join("");
    expect(joined).not.toContain(plaintext);
  });
});
