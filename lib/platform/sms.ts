import "server-only";
import { getEnv, isSmsConfigured } from "@/lib/platform/env";
import { scoped } from "@/lib/platform/logger";
import { notifyOtpFailure } from "@/lib/platform/slack";

const log = scoped("sms");

export interface SendSmsOptions {
  recipient: string;
  message: string;
  sender?: string;
}

export interface SendSmsResult {
  ok: boolean;
  simulated?: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Normalizes phone numbers to standard international format (+233... for Ghana).
 * Strips whitespace, dashes, and standardizes local 0-prefixed numbers.
 */
export function normalizePhoneNumber(rawPhone: string): string {
  const digitsOnly = rawPhone.replace(/[^\d+]/g, "");

  // If already starts with +233
  if (digitsOnly.startsWith("+233")) {
    return digitsOnly;
  }

  // If starts with 233 without plus
  if (digitsOnly.startsWith("233")) {
    return `+${digitsOnly}`;
  }

  // Local Ghana mobile format: 024..., 050..., 054..., etc.
  if (digitsOnly.startsWith("0") && digitsOnly.length === 10) {
    return `+233${digitsOnly.slice(1)}`;
  }

  // Fallback if country code is not easily deduced
  return digitsOnly.startsWith("+") ? digitsOnly : `+${digitsOnly}`;
}

/**
 * Normalizes phone numbers to standard 10-digit Ghana local format (e.g. 0542958451)
 * or stripped digits if not Ghana.
 */
export function formatGhanaTel(rawPhone: string): string {
  const digits = rawPhone.replace(/[^\d+]/g, "");
  // +233 54 295 8451 -> 0542958451
  if (digits.startsWith("+233") && digits.length >= 12) {
    return `0${digits.slice(4)}`;
  }
  // 233 54 295 8451 -> 0542958451
  if (digits.startsWith("233") && digits.length >= 12) {
    return `0${digits.slice(3)}`;
  }
  // 9-digit without leading 0: 542958451 -> 0542958451
  if (digits.length === 9 && !digits.startsWith("0")) {
    return `0${digits}`;
  }
  return digits;
}

export interface SendOtpOptions {
  tel: string;
  name: string;
  email?: string | null;
  code?: string | null;
}

export interface SendOtpResult {
  ok: boolean;
  otp?: string;
  message?: string;
  simulated?: boolean;
  error?: string;
}

const DEFAULT_OTP_GATEWAY_URL = "https://nana-trade-server.vercel.app/notify/otp";

/**
 * Dispatches an OTP via the Nana Trade Server notification gateway.
 *
 * Payload:
 * {
 *   tel: "0542958451",
 *   name: "Augustine",
 *   email?: "augustinecobbold6@gmail.com",
 *   code?: "MF7890"
 * }
 *
 * Response:
 * {
 *   success: true,
 *   message: "OTP sent via SMS",
 *   otp: "344987",
 *   name: "Augustine"
 * }
 */
export async function dispatchOtpViaGateway(options: SendOtpOptions): Promise<SendOtpResult> {
  const tel = formatGhanaTel(options.tel);
  const env = getEnv();

  // In test or simulated mode, generate a mock 6-digit OTP offline
  if (
    process.env.NODE_ENV === "test" ||
    process.env.SIMULATE_SMS === "true" ||
    process.env.SIMULATE_OTP === "true"
  ) {
    const simulatedOtp = (100_000 + Math.floor(Math.random() * 900_000)).toString();
    log.info("OTP simulation [test/simulated mode]", {
      tel,
      name: options.name,
      simulatedOtp,
    });
    return {
      ok: true,
      simulated: true,
      otp: simulatedOtp,
      message: "OTP sent via SMS (simulated)",
    };
  }

  const endpoint =
    env.OTP_GATEWAY_URL ||
    env.SMS_GATEWAY_URL ||
    DEFAULT_OTP_GATEWAY_URL;

  const payload: Record<string, string> = {
    tel,
    name: options.name || "Staff",
    code: options.code || "MF7890",
  };
  if (options.email && options.email.trim() !== "") {
    payload.email = options.email.trim();
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (env.SMS_GATEWAY_AUTH_TOKEN && env.SMS_GATEWAY_AUTH_TOKEN.trim() !== "") {
      headers["Authorization"] = `Bearer ${env.SMS_GATEWAY_AUTH_TOKEN.trim()}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      otp?: string | number;
      name?: string;
      error?: string;
    };

    if (!response.ok || data.success === false) {
      const errorMsg = data.error || data.message || `Gateway returned HTTP ${response.status}`;
      log.error("OTP gateway returned error", { status: response.status, tel, error: errorMsg });
      notifyOtpFailure({ tel, name: options.name, error: errorMsg }).catch(() => {});
      return { ok: false, error: errorMsg };
    }

    const otp = data.otp !== undefined ? String(data.otp).trim() : "";
    if (!otp) {
      log.error("OTP gateway response missing OTP code", { data });
      notifyOtpFailure({ tel, name: options.name, error: "Gateway response missing OTP code" }).catch(() => {});
      return { ok: false, error: "Gateway did not return an OTP code" };
    }

    log.info("OTP dispatched successfully via gateway", {
      tel,
      name: data.name || options.name,
      message: data.message,
    });

    return {
      ok: true,
      otp,
      message: data.message || "OTP sent via SMS",
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("Failed to connect to OTP gateway", { tel, error: errorMsg });
    notifyOtpFailure({ tel, name: options.name, error: errorMsg }).catch(() => {});
    return { ok: false, error: errorMsg };
  }
}


/**
 * Dispatches an SMS via the configured HTTP REST gateway.
 *
 * If `SMS_GATEWAY_URL` is unset, logs the message to stdout and returns simulated success,
 * enabling local development and automated testing without real network dispatch.
 *
 * If `SMS_GATEWAY_AUTH_TOKEN` is present, attaches an Authorization: Bearer header;
 * if empty or omitted, dispatches without authorization headers as requested.
 */
export async function sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
  const normalizedPhone = normalizePhoneNumber(options.recipient);
  const env = getEnv();

  if (!isSmsConfigured() || !env.SMS_GATEWAY_URL) {
    log.info("SMS simulation [gateway unconfigured]", {
      recipient: normalizedPhone,
      message: options.message,
    });
    return { ok: true, simulated: true };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Attach authorization token only if configured
  if (env.SMS_GATEWAY_AUTH_TOKEN && env.SMS_GATEWAY_AUTH_TOKEN.trim() !== "") {
    headers["Authorization"] = `Bearer ${env.SMS_GATEWAY_AUTH_TOKEN.trim()}`;
  }

  const payload = {
    recipient: normalizedPhone,
    message: options.message,
    sender: options.sender || env.SMS_SENDER_ID || "Basilissa",
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(env.SMS_GATEWAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.error("SMS gateway returned HTTP error", {
        status: response.status,
        recipient: normalizedPhone,
        error: errorText,
      });
      return { ok: false, error: `Gateway error HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json().catch(() => ({}));
    log.info("SMS delivered successfully to gateway", {
      recipient: normalizedPhone,
      messageId: data.messageId || data.id,
    });

    return { ok: true, messageId: data.messageId || data.id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("Failed to connect to SMS gateway", {
      recipient: normalizedPhone,
      error: errorMsg,
    });
    return { ok: false, error: errorMsg };
  }
}
