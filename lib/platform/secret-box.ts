import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/platform/env";

/**
 * Authenticated encryption for secrets that must be readable by the app but
 * useless in a database dump — MFA seeds today, biometric templates in Phase 6.
 *
 * AES-256-GCM, so ciphertext is tamper-evident as well as unreadable: a
 * modified row fails to decrypt rather than decrypting to something else.
 *
 * KEY MANAGEMENT, AND ITS LIMIT
 * The key is derived from SESSION_SECRET via HKDF with a purpose label, so
 * different uses get different keys and none of them is SESSION_SECRET itself.
 * That is meaningfully better than storing plaintext — a leaked database dump
 * yields nothing without the application's environment — but it is not a KMS,
 * and it has one consequence worth stating plainly:
 *
 *   ROTATING SESSION_SECRET MAKES EVERYTHING ENCRYPTED HERE UNREADABLE.
 *
 * For MFA that means every enrolled user must re-enrol, which is recoverable
 * via recovery codes or an administrator reset, but is not a quiet event.
 * Phase 6 introduces biometric templates, which are not recoverable that way,
 * and should move to a managed key with real rotation before then.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFor(purpose: string): Buffer {
  // HKDF with the purpose as info: one compromised use cannot decrypt another.
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(getEnv().SESSION_SECRET), Buffer.alloc(0), `secret-box:${purpose}`, KEY_BYTES),
  );
}

/** Encrypts to `iv.ciphertext.tag`, base64url, self-describing enough to decrypt. */
export function seal(plaintext: string, purpose: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFor(purpose), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, ciphertext, tag].map((part) => part.toString("base64url")).join(".");
}

/**
 * Reverses `seal`. Throws on tampering, a wrong purpose, or a key that has
 * changed — all of which are indistinguishable by design.
 */
export function open(sealed: string, purpose: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 3) throw new Error("Malformed sealed value");

  const [iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, "base64url"));
  if (iv!.length !== IV_BYTES || tag!.length !== TAG_BYTES) {
    throw new Error("Malformed sealed value");
  }

  const decipher = createDecipheriv("aes-256-gcm", keyFor(purpose), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString("utf8");
}

/** Whether a value can still be read, without throwing at the call site. */
export function canOpen(sealed: string, purpose: string): boolean {
  try {
    open(sealed, purpose);
    return true;
  } catch {
    return false;
  }
}
