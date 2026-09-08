import {
  IdentityAssurance,
  LocationAssurance,
  ProviderType,
  TimeAssurance,
} from "@prisma/client";

/**
 * How much an attendance event can be trusted, on three independent axes.
 *
 * A single trusted/untrusted flag would collapse exactly the distinctions
 * payroll disputes turn on. A fingerprint punch and a GPS clock-in are not
 * more or less trustworthy than each other — they are trustworthy in different
 * places, and the difference decides what a manager should do about a flagged
 * day.
 *
 * Pure, and deliberately so: rules that decide what people are paid should be
 * testable exhaustively without a database.
 */

export type AssuranceProfile = {
  identity: IdentityAssurance;
  location: LocationAssurance;
  time: TimeAssurance;
};

const IDENTITY_RANK: Record<IdentityAssurance, number> = {
  NONE: 0,
  ASSERTED: 1,
  DEVICE_BOUND: 2,
  BIOMETRIC: 3,
};

const LOCATION_RANK: Record<LocationAssurance, number> = {
  NONE: 0,
  ASSERTED: 1,
  GPS_VERIFIED: 2,
  // Above GPS on purpose. A terminal bolted to a wall cannot be somewhere
  // else; a phone reporting coordinates can be, and mock-location apps are
  // free. Presence proven by hardware beats presence asserted by software.
  PHYSICALLY_PRESENT: 3,
};

const TIME_RANK: Record<TimeAssurance, number> = {
  HUMAN_ASSERTED: 0,
  DEVICE_UNVERIFIED: 1,
  DEVICE_SYNCED: 2,
  SERVER: 3,
};

export function identityRank(value: IdentityAssurance): number {
  return IDENTITY_RANK[value];
}
export function locationRank(value: LocationAssurance): number {
  return LOCATION_RANK[value];
}
export function timeRank(value: TimeAssurance): number {
  return TIME_RANK[value];
}

/**
 * Baseline profile for each provider, before per-event evidence adjusts it.
 *
 * Reading this table is the clearest statement of something easy to get
 * backwards: the fingerprint terminal scores *higher* than the mobile app on
 * identity and location, and lower only on time. Calling it a "fallback"
 * invites under-investing in the path that is both more secure and already
 * installed.
 */
export const PROVIDER_BASELINE: Record<ProviderType, AssuranceProfile> = {
  FINGERPRINT: {
    identity: IdentityAssurance.BIOMETRIC,
    location: LocationAssurance.PHYSICALLY_PRESENT,
    // Terminals keep their own clock, and it drifts. Upgraded to DEVICE_SYNCED
    // once drift has been measured and is within tolerance.
    time: TimeAssurance.DEVICE_UNVERIFIED,
  },
  MOBILE_APP: {
    // BIOMETRIC only once face verification is enabled and passes; without it
    // the app proves the device, not the person.
    identity: IdentityAssurance.DEVICE_BOUND,
    location: LocationAssurance.GPS_VERIFIED,
    time: TimeAssurance.SERVER,
  },
  MANAGER_MANUAL: {
    // Nothing about a manual entry is verified. It is the least-verified path
    // in the system and the one available first, which is why it carries the
    // heaviest process controls instead.
    identity: IdentityAssurance.NONE,
    location: LocationAssurance.NONE,
    time: TimeAssurance.HUMAN_ASSERTED,
  },
  SYSTEM_AUTO_CLOSE: {
    identity: IdentityAssurance.NONE,
    location: LocationAssurance.NONE,
    time: TimeAssurance.SERVER,
  },
};

/**
 * Orders two events when they describe the same real-world action.
 *
 * Identity first: being sure *who* it was matters more than where or when,
 * because a wrong person is unrecoverable while a wrong minute is correctable.
 * Then location, then time.
 *
 * Returns > 0 when `a` is the stronger record.
 */
export function compareAssurance(a: AssuranceProfile, b: AssuranceProfile): number {
  return (
    identityRank(a.identity) - identityRank(b.identity) ||
    locationRank(a.location) - locationRank(b.location) ||
    timeRank(a.time) - timeRank(b.time)
  );
}

/**
 * The weakest axis, which is what should drive review queues.
 *
 * A day is only as defensible as its least-verified event, so surfacing the
 * minimum is more useful than an average that hides one unverified punch among
 * five good ones.
 */
export function weakestAxis(profile: AssuranceProfile): "identity" | "location" | "time" {
  const ranks = [
    ["identity", identityRank(profile.identity)],
    ["location", locationRank(profile.location)],
    ["time", timeRank(profile.time)],
  ] as const;

  return ranks.reduce((weakest, current) => (current[1] < weakest[1] ? current : weakest))[0];
}

/**
 * Whether an event clears a bar expressed in assurance terms.
 *
 * Policy should be written against these levels, never against provider names:
 * "payroll-eligible without review needs identity >= DEVICE_BOUND" survives
 * adding RFID, whereas "provider != MANAGER_MANUAL" does not.
 */
export function meetsAssurance(
  profile: AssuranceProfile,
  minimum: Partial<AssuranceProfile>,
): boolean {
  if (minimum.identity && identityRank(profile.identity) < identityRank(minimum.identity)) {
    return false;
  }
  if (minimum.location && locationRank(profile.location) < locationRank(minimum.location)) {
    return false;
  }
  if (minimum.time && timeRank(profile.time) < timeRank(minimum.time)) return false;
  return true;
}
