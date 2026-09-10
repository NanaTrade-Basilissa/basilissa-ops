import "server-only";
import { getEnv, isSmsConfigured } from "@/lib/platform/env";
import { scoped } from "@/lib/platform/logger";

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
