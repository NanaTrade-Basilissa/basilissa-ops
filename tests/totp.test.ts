import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  totp,
  totpUri,
  verifyTotp,
} from "@/lib/platform/totp";

/**
 * These vectors are the reason this is hand-written rather than a dependency.
 * TOTP is a narrow, fully specified algorithm with published test data, so
 * correctness here is demonstrated rather than assumed.
 */

/** RFC 6238 Appendix B: the SHA-1 seed is ASCII "12345678901234567890". */
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_BASE32 = base32Encode(RFC_SECRET);

describe("RFC 6238 test vectors", () => {
  // Appendix B, the SHA-1 rows, at 8 digits as the RFC tabulates them.
  const vectors: [seconds: number, expected: string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  for (const [seconds, expected] of vectors) {
    it(`matches at T=${seconds}`, () => {
      expect(totp(RFC_SECRET_BASE32, seconds * 1000, 8)).toBe(expected);
    });
  }

  // The last vector is past 2^32 seconds. Writing the counter as a 32-bit
  // value would silently truncate it and quietly break every code around 2038.
  it("handles counters beyond 32 bits", () => {
    expect(totp(RFC_SECRET_BASE32, 20000000000 * 1000, 8)).toBe("65353130");
  });
});

describe("RFC 4226 HOTP vectors", () => {
  // Appendix D, the same seed with counters 0-9.
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];

  it("matches every published counter", () => {
    expected.forEach((value, counter) => {
      expect(hotp(RFC_SECRET, counter)).toBe(value);
    });
  });
});

describe("Base32", () => {
  // RFC 4648 section 10.
  const vectors: [input: string, encoded: string][] = [
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ];

  for (const [input, encoded] of vectors) {
    it(`encodes ${JSON.stringify(input)}`, () => {
      expect(base32Encode(Buffer.from(input))).toBe(encoded);
    });
  }

  it("round-trips arbitrary bytes", () => {
    const original = Buffer.from([0, 1, 127, 128, 255, 42, 17]);
    expect(base32Decode(base32Encode(original))).toEqual(original);
  });

  // Apps display secrets in spaced groups, and padding is optional in practice.
  it("tolerates spacing, padding and lower case as apps produce them", () => {
    expect(base32Decode("mzxw 6ytb oi==")).toEqual(Buffer.from("foobar"));
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base32Decode("MZXW6YTB1")).toThrow(/Invalid Base32/);
  });
});

describe("verification", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;

  it("accepts the current code", () => {
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
  });

  it("rejects a wrong code", () => {
    expect(verifyTotp(secret, "000000", now)).toBe(false);
  });

  it("rejects anything that is not digits", () => {
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
    expect(verifyTotp(secret, "", now)).toBe(false);
  });

  it("tolerates spacing, since apps display codes in two groups", () => {
    const code = totp(secret, now);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
  });

  // A phone whose clock is a little out must still work; a phone that is
  // minutes out must not, or the window becomes a guessing surface.
  it("accepts one period of drift either side", () => {
    const code = totp(secret, now);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, now - 30_000)).toBe(true);
  });

  it("rejects drift beyond the window", () => {
    const code = totp(secret, now);
    expect(verifyTotp(secret, code, now + 90_000)).toBe(false);
    expect(verifyTotp(secret, code, now - 90_000)).toBe(false);
  });

  it("rejects a code from a different secret", () => {
    const other = generateTotpSecret();
    expect(verifyTotp(secret, totp(other, now), now)).toBe(false);
  });
});

describe("secrets", () => {
  it("generates 160 bits, matching the HMAC-SHA1 block", () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it("does not repeat", () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(50);
  });
});

describe("otpauth URI", () => {
  it("carries everything an authenticator needs", () => {
    const uri = totpUri("JBSWY3DPEHPK3PXP", "hr@basilissa.gh", "Basilissa");
    const parsed = new URL(uri);

    expect(parsed.protocol).toBe("otpauth:");
    expect(decodeURIComponent(parsed.pathname)).toBe("/Basilissa:hr@basilissa.gh");
    expect(parsed.searchParams.get("secret")).toBe("JBSWY3DPEHPK3PXP");
    expect(parsed.searchParams.get("issuer")).toBe("Basilissa");
    expect(parsed.searchParams.get("digits")).toBe("6");
    expect(parsed.searchParams.get("period")).toBe("30");
  });
});
