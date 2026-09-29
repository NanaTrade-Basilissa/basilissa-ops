import { timingSafeEqual } from "node:crypto";
import { normalizePhoneNumber } from "@/lib/platform/sms";

/**
 * App-store review demo account.
 *
 * Google Play (and Apple) reviewers cannot receive an SMS, may be nowhere near
 * a branch, and cannot contact us. So one dedicated demo employee can sign in
 * with a fixed code, clock in from anywhere, and is exempt from the
 * one-device-per-employee rule.
 *
 * It is entirely opt-in: unless BOTH `REVIEW_DEMO_PHONE` and `REVIEW_DEMO_OTP`
 * are set and valid, nothing in this file has any effect. Read straight from
 * `process.env` rather than `getEnv()` on purpose: a malformed value here must
 * disable this feature, never take down every feature that reads the env.
 *
 * Every relaxation below applies to that one phone number only. The session
 * token is still a sealed, expiring device token, and every other employee
 * follows the normal SMS, geofence and device-binding rules.
 */

const OTP_PATTERN = /^\d{6}$/;

export interface ReviewDemoConfig {
  /** Normalized (+233...) phone number of the demo employee. */
  phone: string;
  /** Fixed 6-digit code that never expires. */
  otp: string;
}

export function getReviewDemoConfig(): ReviewDemoConfig | null {
  const rawPhone = process.env.REVIEW_DEMO_PHONE?.trim();
  const otp = process.env.REVIEW_DEMO_OTP?.trim();
  if (!rawPhone || !otp) return null;
  if (!OTP_PATTERN.test(otp)) return null;

  const phone = normalizePhoneNumber(rawPhone);
  if (phone.length < 9) return null;
  return { phone, otp };
}

/** Whether `rawPhone` is the configured review demo account. */
export function isReviewDemoPhone(rawPhone: string | null | undefined): boolean {
  if (!rawPhone) return false;
  const config = getReviewDemoConfig();
  return config !== null && normalizePhoneNumber(rawPhone) === config.phone;
}

/** Whether this phone and code are the review demo account's fixed login. */
export function isReviewDemoLogin(rawPhone: string, code: string): boolean {
  const config = getReviewDemoConfig();
  if (!config || normalizePhoneNumber(rawPhone) !== config.phone) return false;

  const submitted = Buffer.from(code.trim());
  const expected = Buffer.from(config.otp);
  return submitted.length === expected.length && timingSafeEqual(submitted, expected);
}
