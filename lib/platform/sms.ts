import "server-only";
import { getEnv, isSmsConfigured } from "@/lib/platform/env";
import { scoped } from "@/lib/platform/logger";
import { notifyOtpFailure } from "@/lib/platform/slack";

const log = scoped("sms");

export interface SendSmsOptions {
  recipient: string;
  message: string;
  /** The recipient's first name. */
  name?: string;
  /** Shown by gateways that also email; an announcement's title. */
  subject?: string;
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


const DEFAULT_SMS_CHARGE_URL = "https://nana-trade-server.vercel.app/sms/charge";

/**
 * Sends one SMS through the Nana Trade Server gateway (`/sms/charge`), the same
 * service the OTP goes through. It takes a list of recipients; we send one at a
 * time so each person's outcome is known.
 *
 * Payload:
 * {
 *   recipients: [{
 *     recipient_number: "0542958451",
 *     name: "Augustine",
 *     message: "...",
 *     subject: "Basilissa Test Message",
 *     from: "Basilissa"
 *   }]
 * }
 *
 * Response (confirmed against the live gateway, 1 Oct 2026): HTTP 200 with
 * `{ "success": true, "message": "Messages sent successfully" }`. No message id and
 * no per-recipient detail, and no auth was needed. That means accepted, not
 * delivered: the gateway gives us nothing to track delivery with.
 *
 * SMS costs money per message. It is only sent for something a person chose to
 * send (an announcement with the SMS switch on, which also has a recipient cap).
 * Set `SIMULATE_SMS=true` to log instead of send. The endpoint is
 * `SMS_CHARGE_URL`, defaulting to the production gateway, like the OTP's.
 */
export async function sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
  const recipientNumber = formatGhanaTel(options.recipient);
  const env = getEnv();

  if (process.env.NODE_ENV === "test" || process.env.SIMULATE_SMS === "true") {
    log.info("SMS simulation [test/simulated mode]", { recipient: recipientNumber, message: options.message });
    return { ok: true, simulated: true };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.SMS_GATEWAY_AUTH_TOKEN && env.SMS_GATEWAY_AUTH_TOKEN.trim() !== "") {
    headers["Authorization"] = `Bearer ${env.SMS_GATEWAY_AUTH_TOKEN.trim()}`;
  }

  const payload = {
    recipients: [
      {
        recipient_number: recipientNumber,
        name: options.name || "Staff",
        message: options.message,
        subject: options.subject || "Basilissa",
        from: options.sender || env.SMS_SENDER_ID || "Basilissa",
      },
    ],
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(env.SMS_CHARGE_URL || DEFAULT_SMS_CHARGE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
      messageId?: string;
      id?: string;
    };

    // Not accepted: a bad status, or a body that says so.
    if (!response.ok || data.success === false) {
      const error = data.error || data.message || `Gateway returned HTTP ${response.status}`;
      log.error("SMS gateway rejected the message", { status: response.status, recipient: recipientNumber, error });
      return { ok: false, error };
    }

    log.info("SMS accepted by the gateway", { recipient: recipientNumber, messageId: data.messageId || data.id });
    return { ok: true, messageId: data.messageId || data.id };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    log.error("Failed to reach the SMS gateway", { recipient: recipientNumber, error });
    return { ok: false, error };
  }
}
