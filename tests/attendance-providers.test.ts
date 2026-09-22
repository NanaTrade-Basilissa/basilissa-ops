import { describe, expect, it } from "vitest";
import { ProviderType, VerificationOutcome } from "@prisma/client";
import {
  PROVIDERS,
  implementedProviders,
  isProviderImplemented,
  providerFor,
} from "@/lib/modules/attendance/providers";
import { PROVIDER_BASELINE } from "@/lib/modules/attendance/assurance";

/**
 * The registry exists so the ingest pipeline can stop asking "which provider
 * is this?". Its value is entirely in being exhaustive and in matching what
 * ingest actually does — a descriptor nobody reads is worse than an `if`,
 * because it looks like it is in charge.
 */

describe("every provider is described", () => {
  it("covers the whole ProviderType enum", () => {
    for (const type of Object.values(ProviderType)) {
      expect(PROVIDERS[type], `no descriptor for ${type}`).toBeDefined();
      expect(providerFor(type).type).toBe(type);
    }
  });

  // Two sources for the same fact drift. The descriptor points at the existing
  // baseline rather than restating it.
  it("takes its assurance baseline from assurance.ts, not a copy", () => {
    for (const type of Object.values(ProviderType)) {
      expect(providerFor(type).baseline).toBe(PROVIDER_BASELINE[type]);
    }
  });

  it("says what a PLANNED provider is waiting for, and nothing else does", () => {
    for (const p of Object.values(PROVIDERS)) {
      if (p.status === "PLANNED") expect(p.plannedFor).toBeTruthy();
      else expect(p.plannedFor).toBeNull();
    }
  });
});

describe("what is actually buildable today", () => {
  it("includes manual entry, mobile app, fingerprint terminal, and auto-close", () => {
    expect(implementedProviders().map((p) => p.type).sort()).toEqual(
      [
        ProviderType.FINGERPRINT,
        ProviderType.MANAGER_MANUAL,
        ProviderType.MOBILE_APP,
        ProviderType.SYSTEM_AUTO_CLOSE,
      ].sort(),
    );
  });

  it("registers fingerprint and mobile app as implemented", () => {
    expect(isProviderImplemented(ProviderType.FINGERPRINT)).toBe(true);
    expect(isProviderImplemented(ProviderType.MOBILE_APP)).toBe(true);
  });
});

describe("the distinctions the pipeline used to hard-code", () => {
  /*
    A human choosing a past date is the shape fabrication takes. A device
    reporting late is a terminal delivering a buffered offline day. Bounding
    the second would discard real punches, so only the first is bounded.
  */
  it("bounds retro-dating for the human path and no other", () => {
    const bounded = Object.values(PROVIDERS)
      .filter((p) => p.capabilities.retroLimit === "POLICY_MANUAL_LIMIT")
      .map((p) => p.type);

    expect(bounded).toEqual([ProviderType.MANAGER_MANUAL]);
  });

  it("marks only manual entry unverified", () => {
    const unverified = Object.values(PROVIDERS)
      .filter((p) => p.capabilities.verification === VerificationOutcome.UNVERIFIED)
      .map((p) => p.type);

    expect(unverified).toEqual([ProviderType.MANAGER_MANUAL]);
  });

  // Self-entry is the single easiest fraud under manual entry and the entire
  // point of the mobile app. It is not a rule the pipeline can hold centrally.
  it("forbids self-entry only where it is fraud", () => {
    expect(providerFor(ProviderType.MANAGER_MANUAL).capabilities.selfEntry).toBe("FORBIDDEN");
    expect(providerFor(ProviderType.MOBILE_APP).capabilities.selfEntry).toBe("ALLOWED");
  });
});

describe("time authority", () => {
  /*
    The terminal must keep working with the network down, which is most of why
    it exists, so its own clock decides and the drift is carried on the event.
    A phone can be required to have connectivity, and its clock is trivially
    changed by its owner, so the server decides. Same problem, opposite answer,
    and the reason is the offline requirement rather than the hardware.
  */
  it("trusts the terminal's clock and not the phone's", () => {
    expect(providerFor(ProviderType.FINGERPRINT).capabilities.timeAuthority).toBe("DEVICE");
    expect(providerFor(ProviderType.MOBILE_APP).capabilities.timeAuthority).toBe("SERVER");
  });

  it("calls a typed-in time what it is", () => {
    expect(providerFor(ProviderType.MANAGER_MANUAL).capabilities.timeAuthority).toBe("ACTOR");
  });

  // Anything whose clock is not the server's must be able to carry its drift,
  // or the skew is silently absorbed into payable time.
  it("only device-clocked providers need clock skew recorded", () => {
    for (const p of Object.values(PROVIDERS)) {
      if (p.capabilities.timeAuthority === "DEVICE") {
        expect(p.baseline.time).toBe("DEVICE_UNVERIFIED");
      }
    }
  });
});

describe("device identity", () => {
  it("is required by exactly the providers that have a device", () => {
    const needsDevice = Object.values(PROVIDERS)
      .filter((p) => p.capabilities.deviceIdentity === "REQUIRED")
      .map((p) => p.type)
      .sort();

    expect(needsDevice).toEqual([ProviderType.FINGERPRINT, ProviderType.MOBILE_APP].sort());
  });

  it("is required by mobile app and fingerprint terminal among currently implemented providers", () => {
    const implementedNeedingDevice = implementedProviders()
      .filter((p) => p.capabilities.deviceIdentity === "REQUIRED")
      .map((p) => p.type)
      .sort();
    expect(implementedNeedingDevice).toEqual([ProviderType.FINGERPRINT, ProviderType.MOBILE_APP].sort());
  });
});
