import { ProviderType, VerificationOutcome } from "@prisma/client";
import { PROVIDER_BASELINE, type AssuranceProfile } from "./assurance";

/**
 * What the ingest pipeline needs to know about a capture path, declared once
 * per provider instead of asked for with an `if`.
 *
 * The pipeline was already described as provider-agnostic, and was not: it
 * named MANAGER_MANUAL twice, once to bound retro-dating and once to decide
 * that the event was unverified. Two `if`s is where it starts; by the fourth
 * provider it is a pipeline nobody can reason about, and the differences are
 * scattered rather than listed.
 *
 * Pure data, no I/O, no behaviour — a provider that needs to *do* something
 * different at capture belongs in its own adapter, which produces an
 * `IngestCommand` and hands it here. This is the part every provider shares.
 */

export type ProviderCapabilities = {
  /**
   * Whose clock decides `occurredAt`.
   *
   * SERVER  — the moment the request arrived; unforgeable, needs connectivity.
   * DEVICE  — the terminal's clock, which drifts and can be set by hand, so
   *           the event carries `clockSkewMs` and the drift is recorded.
   * ACTOR   — a human typed a time. Not a clock at all.
   */
  timeAuthority: "SERVER" | "DEVICE" | "ACTOR";

  /**
   * Whether capture itself established that the punch happened, or whether a
   * person asserted it afterwards. Drives `verificationOutcome` on the event.
   */
  verification: VerificationOutcome;

  /**
   * Whether retro-dating is bounded by `policy.maxManualEntryDays`.
   *
   * A device reports when it reports — a terminal buffering an offline day
   * must be allowed to deliver it late, and refusing it would lose real
   * punches. A human choosing a date in the past is the shape fabrication
   * takes, so that one is bounded.
   */
  retroLimit: "POLICY_MANUAL_LIMIT" | "NONE";

  /**
   * Whether the subject may record their own attendance this way.
   *
   * Not a uniform rule, and worth stating per provider rather than centrally:
   * self-entry is the whole point of the mobile app and the single easiest
   * fraud in manager manual entry. Enforced at the adapter, where the actor is
   * known; recorded here so the difference is visible in one place.
   */
  selfEntry: "ALLOWED" | "FORBIDDEN";

  /** Whether an event must name a registered device. */
  deviceIdentity: "REQUIRED" | "NONE";
};

export type ProviderDescriptor = {
  type: ProviderType;
  /** For managers reading an attendance day, not for logs. */
  label: string;
  /**
   * PLANNED providers are registered on purpose. The enum, the assurance
   * baseline and the capabilities exist before the adapter does, so the shape
   * is agreed while it is still cheap to change — and so ingest can refuse a
   * command from an unbuilt provider explicitly rather than by accident.
   */
  status: "IMPLEMENTED" | "PLANNED";
  /** Null once implemented. */
  plannedFor: string | null;
  baseline: AssuranceProfile;
  capabilities: ProviderCapabilities;
};

export const PROVIDERS: Record<ProviderType, ProviderDescriptor> = {
  [ProviderType.MANAGER_MANUAL]: {
    type: ProviderType.MANAGER_MANUAL,
    label: "Recorded by a manager",
    status: "IMPLEMENTED",
    plannedFor: null,
    baseline: PROVIDER_BASELINE[ProviderType.MANAGER_MANUAL],
    capabilities: {
      timeAuthority: "ACTOR",
      verification: VerificationOutcome.UNVERIFIED,
      retroLimit: "POLICY_MANUAL_LIMIT",
      selfEntry: "FORBIDDEN",
      deviceIdentity: "NONE",
    },
  },

  [ProviderType.SYSTEM_AUTO_CLOSE]: {
    type: ProviderType.SYSTEM_AUTO_CLOSE,
    label: "Closed automatically",
    status: "IMPLEMENTED",
    plannedFor: null,
    baseline: PROVIDER_BASELINE[ProviderType.SYSTEM_AUTO_CLOSE],
    capabilities: {
      timeAuthority: "SERVER",
      // The system did observe the shift end; it just observed nobody
      // punching out. The day carries AUTO_CLOSED and earns no overtime,
      // which is where that fact is expressed.
      verification: VerificationOutcome.VERIFIED,
      // Auto-close reaches back over a shift that has already ended, and the
      // grace period is what bounds it.
      retroLimit: "NONE",
      selfEntry: "ALLOWED",
      deviceIdentity: "NONE",
    },
  },

  [ProviderType.FINGERPRINT]: {
    type: ProviderType.FINGERPRINT,
    label: "Fingerprint terminal",
    status: "IMPLEMENTED",
    plannedFor: null,
    baseline: PROVIDER_BASELINE[ProviderType.FINGERPRINT],
    capabilities: {
      // The terminal's clock, because it must keep working with the network
      // down — which is most of why it exists. Drift is measured and carried
      // on the event rather than assumed away.
      timeAuthority: "DEVICE",
      verification: VerificationOutcome.VERIFIED,
      // An offline terminal delivers a whole day at once when it reconnects.
      // Bounding that would discard real punches.
      retroLimit: "NONE",
      selfEntry: "ALLOWED",
      deviceIdentity: "REQUIRED",
    },
  },

  [ProviderType.MOBILE_APP]: {
    type: ProviderType.MOBILE_APP,
    label: "Mobile app",
    status: "IMPLEMENTED",
    plannedFor: null,
    baseline: PROVIDER_BASELINE[ProviderType.MOBILE_APP],
    capabilities: {
      // Server time, deliberately: a phone's clock is trivially changed by its
      // owner, and unlike a terminal the app can require connectivity.
      timeAuthority: "SERVER",
      verification: VerificationOutcome.VERIFIED,
      retroLimit: "NONE",
      // The point of the app. Self-entry here is not the fraud it is under
      // manual entry, because the device and the geofence are the evidence.
      selfEntry: "ALLOWED",
      deviceIdentity: "REQUIRED",
    },
  },
};

export function providerFor(type: ProviderType): ProviderDescriptor {
  return PROVIDERS[type];
}

/** Providers that can actually produce events today. */
export function implementedProviders(): ProviderDescriptor[] {
  return Object.values(PROVIDERS).filter((p) => p.status === "IMPLEMENTED");
}

export function isProviderImplemented(type: ProviderType): boolean {
  return PROVIDERS[type].status === "IMPLEMENTED";
}
