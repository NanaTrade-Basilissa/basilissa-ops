import "server-only";
import { createHash, timingSafeEqual, randomInt } from "node:crypto";
import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { seal, open } from "@/lib/platform/secret-box";
import { sendSms, normalizePhoneNumber } from "@/lib/platform/sms";
import { scoped } from "@/lib/platform/logger";

const log = scoped("mobile-auth");

export interface RequestOtpResult {
  ok: boolean;
  message: string;
  challengeToken?: string;
  expiresInSeconds?: number;
  error?: "EMPLOYEE_NOT_FOUND" | "EMPLOYEE_NOT_ACTIVE" | "SMS_FAILED";
  debugOtp?: string;
}

export interface VerifyOtpInput {
  phone: string;
  code: string;
  challengeToken?: string;
  deviceId?: string;
  deviceName?: string;
}

export interface MobileBranchInfo {
  id: string;
  name: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
  geofenceEnabled: boolean;
}

export interface MobileEmployeeProfile {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  jobTitle?: string | null;
  branches: MobileBranchInfo[];
}

export interface VerifyOtpResult {
  ok: boolean;
  message: string;
  employee?: MobileEmployeeProfile;
  assignedBranches?: MobileBranchInfo[];
  branches?: MobileBranchInfo[];
  deviceToken?: string;
  error?: "INVALID_CHALLENGE" | "OTP_EXPIRED" | "INVALID_CODE" | "EMPLOYEE_NOT_FOUND" | "EMPLOYEE_NOT_ACTIVE";
}

interface OtpChallengePayload {
  employeeId: string;
  phone: string;
  codeHash: string;
  expiresAt: number;
}

// In-memory cache of recent challenges keyed by normalized phone (TTL 5 mins)
const recentChallenges = new Map<string, { challengeToken: string; expiresAt: number }>();

export function getRecentChallengeToken(phone: string): string | null {
  const normalized = normalizePhoneNumber(phone);
  const entry = recentChallenges.get(normalized);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    recentChallenges.delete(normalized);
    return null;
  }
  return entry.challengeToken;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/**
 * Requests an SMS verification code for a staff member using their registered mobile phone number.
 */
export async function requestMobileOtp(rawPhone: string): Promise<RequestOtpResult> {
  const normalized = normalizePhoneNumber(rawPhone);
  const rawDigits = rawPhone.replace(/[^\d]/g, "");
  const localGhana = normalized.startsWith("+233") ? `0${normalized.slice(4)}` : normalized;

  // Search across common phone representations in the database
  const employee = await prisma.employee.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { phone: rawPhone.trim() },
        { phone: normalized },
        { phone: localGhana },
        { phone: rawDigits },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      phone: true,
      status: true,
    },
  });

  if (!employee) {
    log.warn("Mobile OTP requested for unrecognised phone number", { phone: normalized });
    return {
      ok: false,
      error: "EMPLOYEE_NOT_FOUND",
      message: "Phone number not recognized. Please verify your number or contact your branch manager.",
    };
  }

  // Generate 6-digit code (e.g. 100000 - 999999) using cryptographically secure randomness
  const code = randomInt(100_000, 1_000_000).toString();
  const codeHash = hashCode(code);
  const expiresInSeconds = 300; // 5 minutes
  const expiresAt = Date.now() + expiresInSeconds * 1000;

  // Send the SMS
  const smsResult = await sendSms({
    recipient: normalized,
    message: `Your Basilissa verification code is: ${code}. Valid for 5 minutes. Do not share this code with anyone.`,
  });

  if (!smsResult.ok) {
    log.error("Failed to dispatch mobile OTP SMS", { phone: normalized, error: smsResult.error });
    return {
      ok: false,
      error: "SMS_FAILED",
      message: "Could not send SMS verification code. Please try again shortly.",
    };
  }

  // Seal the challenge token with AES-256-GCM
  const challengePayload: OtpChallengePayload = {
    employeeId: employee.id,
    phone: normalized,
    codeHash,
    expiresAt,
  };

  const challengeToken = seal(JSON.stringify(challengePayload), "mobile-otp");
  recentChallenges.set(normalized, { challengeToken, expiresAt });

  log.info("Mobile OTP challenge issued", {
    employeeId: employee.id,
    phone: normalized,
    simulated: smsResult.simulated,
  });

  return {
    ok: true,
    message: "Verification code sent to your mobile phone.",
    challengeToken,
    expiresInSeconds,
    ...(smsResult.simulated ? { debugOtp: code } : {}),
  };
}

/**
 * Verifies a 6-digit OTP code against the issued challenge token and binds the device.
 */
export async function verifyMobileOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const { phone, code, deviceName } = input;
  const deviceId = input.deviceId || `device_mobile_${phone.replace(/\D/g, "")}`;
  const effectiveChallengeToken = input.challengeToken || getRecentChallengeToken(phone);

  if (!effectiveChallengeToken) {
    log.warn("No challenge token provided and none cached for phone", { phone });
    return {
      ok: false,
      error: "INVALID_CHALLENGE",
      message: "Session challenge expired or missing. Please request a new code.",
    };
  }

  // 1. Decrypt and validate the challenge token
  let payload: OtpChallengePayload;
  try {
    const json = open(effectiveChallengeToken, "mobile-otp");
    payload = JSON.parse(json) as OtpChallengePayload;
  } catch (err) {
    log.warn("Invalid mobile OTP challenge token submitted", { error: err });
    return {
      ok: false,
      error: "INVALID_CHALLENGE",
      message: "Invalid or expired session challenge. Please request a new code.",
    };
  }

  // 2. Check phone matches challenge session
  const normalizedPhone = normalizePhoneNumber(phone);
  if (payload.phone !== normalizedPhone) {
    log.warn("Phone number mismatch for mobile OTP", {
      employeeId: payload.employeeId,
      expected: payload.phone,
      received: normalizedPhone,
    });
    return {
      ok: false,
      error: "INVALID_CHALLENGE",
      message: "Phone number does not match challenge session. Please request a new code.",
    };
  }

  // 3. Check expiration
  if (Date.now() > payload.expiresAt) {
    log.warn("Expired mobile OTP submitted", { employeeId: payload.employeeId });
    return {
      ok: false,
      error: "OTP_EXPIRED",
      message: "Verification code has expired. Please request a new code.",
    };
  }

  // 4. Timing-safe comparison of code hash
  const submittedHash = Buffer.from(hashCode(code), "hex");
  const expectedHash = Buffer.from(payload.codeHash, "hex");

  if (submittedHash.length !== expectedHash.length || !timingSafeEqual(submittedHash, expectedHash)) {
    log.warn("Incorrect mobile OTP code submitted", { employeeId: payload.employeeId });
    return {
      ok: false,
      error: "INVALID_CODE",
      message: "Incorrect verification code. Please check and try again.",
    };
  }

  // 4. Load full employee and assigned branches
  const employee = await prisma.employee.findUnique({
    where: { id: payload.employeeId },
    include: {
      branchAssignments: {
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              slug: true,
              latitude: true,
              longitude: true,
              geofenceRadiusMeters: true,
              geofenceEnabled: true,
            },
          },
        },
      },
    },
  });

  if (!employee) {
    return {
      ok: false,
      error: "EMPLOYEE_NOT_FOUND",
      message: "Employee profile no longer exists.",
    };
  }

  if (employee.status !== "ACTIVE") {
    return {
      ok: false,
      error: "EMPLOYEE_NOT_ACTIVE",
      message: "Employee account is not active. Please contact management.",
    };
  }

  // 5. Enforce device binding in EmployeeDeviceIdentity
  try {
    const existingActiveBinding = await prisma.employeeDeviceIdentity.findFirst({
      where: {
        providerType: ProviderType.MOBILE_APP,
        externalId: deviceId,
        revokedAt: null,
      },
    });

    if (existingActiveBinding && existingActiveBinding.employeeId !== employee.id) {
      // Reassigned phone/device: Revoke previous employee binding
      await prisma.employeeDeviceIdentity.update({
        where: { id: existingActiveBinding.id },
        data: { revokedAt: new Date() },
      });
    }

    if (!existingActiveBinding || existingActiveBinding.employeeId !== employee.id) {
      await prisma.employeeDeviceIdentity.create({
        data: {
          employeeId: employee.id,
          providerType: ProviderType.MOBILE_APP,
          externalId: deviceId,
          deviceId,
          label: deviceName || "Staff Smartphone",
        },
      });
    }
  } catch (bindErr) {
    log.warn("Could not bind device identity in database", { bindErr });
    // Continue: device token still issued
  }

  // 6. Generate signed device session token (valid for 30 days)
  const deviceToken = createDeviceToken({
    employeeId: employee.id,
    deviceId,
    phone: payload.phone,
  });

  const branches: MobileBranchInfo[] = employee.branchAssignments.map((a) => ({
    id: a.branch.id,
    name: a.branch.name,
    slug: a.branch.slug,
    latitude: a.branch.latitude,
    longitude: a.branch.longitude,
    geofenceRadiusMeters: a.branch.geofenceRadiusMeters,
    geofenceEnabled: a.branch.geofenceEnabled,
  }));

  log.info("Mobile device authenticated and paired", {
    employeeId: employee.id,
    deviceId,
    branchCount: branches.length,
  });

  const fullName = `${employee.firstName} ${employee.lastName}`.trim();

  return {
    ok: true,
    message: "Device registered and authenticated successfully.",
    employee: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      name: fullName,
      phone: employee.phone,
      jobTitle: employee.jobTitle,
      branches,
    },
    assignedBranches: branches,
    branches,
    deviceToken,
  };
}

export interface DeviceSessionPayload {
  employeeId: string;
  deviceId: string;
  phone: string;
  issuedAt: number;
  expiresAt: number;
}

export type VerifyDeviceTokenResult =
  | { ok: true; payload: DeviceSessionPayload }
  | {
      ok: false;
      error: "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED";
      message: string;
    };

/**
 * Generates a signed AES-256-GCM device session token.
 */
export function createDeviceToken(payload: {
  employeeId: string;
  deviceId: string;
  phone: string;
  expiresInMs?: number;
}): string {
  const sessionPayload: DeviceSessionPayload = {
    employeeId: payload.employeeId,
    deviceId: payload.deviceId,
    phone: payload.phone,
    issuedAt: Date.now(),
    expiresAt: Date.now() + (payload.expiresInMs ?? 30 * 24 * 60 * 60 * 1000),
  };
  return seal(JSON.stringify(sessionPayload), "mobile-session");
}

/**
 * Verifies a signed 30-day mobile device token issued by verifyMobileOtp.
 */
export function verifyDeviceToken(token?: string | null): VerifyDeviceTokenResult {
  if (!token || !token.trim()) {
    return {
      ok: false,
      error: "MISSING_TOKEN",
      message: "Mobile device authentication token is required.",
    };
  }

  try {
    const raw = open(token.trim(), "mobile-session");
    const payload = JSON.parse(raw) as DeviceSessionPayload;

    if (!payload.employeeId || !payload.expiresAt) {
      return {
        ok: false,
        error: "INVALID_TOKEN",
        message: "Invalid device token structure.",
      };
    }

    if (Date.now() > payload.expiresAt) {
      return {
        ok: false,
        error: "TOKEN_EXPIRED",
        message: "Device session has expired. Please re-authenticate via SMS.",
      };
    }

    return { ok: true, payload };
  } catch {
    return {
      ok: false,
      error: "INVALID_TOKEN",
      message: "Invalid or tampered device authentication token.",
    };
  }
}
