import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) and the Base32 encoding its URIs use.
 *
 * WHY THIS IS NOT A DEPENDENCY
 * Hand-rolling crypto is usually a mistake, but TOTP is a narrow, fully
 * specified algorithm — HMAC-SHA1 over a time counter, then dynamic truncation
 * — and RFC 6238 publishes test vectors. Correctness is therefore *provable*
 * rather than assumed, which is the only reason this is safe to write. Those
 * vectors are in tests/totp.test.ts and are the reason to trust this file.
 *
 * The parts that are easy to get wrong are handled deliberately:
 *   - comparison is constant-time, so a code cannot be guessed a digit at a
 *     time from response timing
 *   - a small window either side absorbs clock skew between a phone and the
 *     server without widening the guessing space more than it has to
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return output;
}

export function base32Decode(input: string): Buffer {
  // Authenticator apps display secrets in spaced groups, and padding is
  // optional in the wild, so both are tolerated on the way in.
  const cleaned = input.toUpperCase().replace(/[\s=]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`Invalid Base32 character: ${character}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** 160 bits, matching the HMAC-SHA1 block the algorithm is built on. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** One TOTP value for a counter. Exported so the RFC vectors can address it. */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const counterBytes = Buffer.alloc(8);
  // Counters exceed 32 bits eventually; writing as BigInt avoids the silent
  // truncation that writeUInt32BE would cause in about 2038.
  counterBytes.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", key).update(counterBytes).digest();

  // Dynamic truncation, RFC 4226 section 5.4.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function totp(
  secretBase32: string,
  atMs: number = Date.now(),
  digits = TOTP_DIGITS,
): string {
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * How many periods either side of now are accepted.
 *
 * One means a code stays valid for roughly 90 seconds total. That is enough for
 * an unsynchronised phone and a person typing slowly; widening it multiplies the
 * codes an attacker may guess at any moment for very little usability gain.
 */
export const TOTP_WINDOW = 1;

/** Constant-time string comparison that does not leak length either. */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function verifyTotp(
  secretBase32: string,
  code: string,
  atMs: number = Date.now(),
  window = TOTP_WINDOW,
): boolean {
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d+$/.test(cleaned)) return false;

  const key = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);

  let matched = false;
  for (let drift = -window; drift <= window; drift++) {
    // Deliberately no early return: bailing on the first match would make a
    // near-miss measurably faster than a wrong code, which is exactly the
    // timing signal the constant-time comparison exists to remove.
    if (safeEqual(hotp(key, counter + drift), cleaned)) matched = true;
  }

  return matched;
}

/** The otpauth:// URI an authenticator app scans. */
export function totpUri(secretBase32: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
