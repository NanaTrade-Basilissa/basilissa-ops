import { scoped } from "@/lib/platform/logger";
import { prisma } from "@/lib/platform/prisma";
import { ProviderType } from "@prisma/client";

const log = scoped("push");

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
}

export interface PushReceipt {
  ok: boolean;
  token: string;
  id?: string;
  error?: string;
  simulated?: boolean;
}

export interface StoredDeviceMetadata {
  deviceName?: string;
  pushToken?: string;
  platform?: "ios" | "android" | "web";
  registeredAt?: string;
}

/**
 * Checks if a string is a standard Expo Push Token.
 */
export function isExpoPushToken(token: string): boolean {
  return (
    typeof token === "string" &&
    (((token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) && token.endsWith("]")) ||
      /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(token))
  );
}

/**
 * Parses the structured device label stored in EmployeeDeviceIdentity.
 */
export function parseDeviceMetadata(rawLabel: string | null): StoredDeviceMetadata {
  if (!rawLabel) return {};
  try {
    const parsed = JSON.parse(rawLabel);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as StoredDeviceMetadata;
    }
  } catch {
    // If rawLabel is just plain text like "Kofi's iPhone", treat as deviceName
    return { deviceName: rawLabel };
  }
  return {};
}

/**
 * Sends a push notification to one or multiple device tokens via Expo Push API.
 */
export async function sendPushNotification(
  tokens: string[],
  payload: PushNotificationPayload,
): Promise<PushReceipt[]> {
  const validTokens = tokens.filter((t) => typeof t === "string" && t.trim().length > 0);
  if (validTokens.length === 0) {
    return [];
  }

  // Simulation mode during vitest tests or when EXPO_PUSH_DISABLED=true
  if (process.env.NODE_ENV === "test" || process.env.EXPO_PUSH_DISABLED === "true") {
    log.info("Push notification simulated", {
      tokenCount: validTokens.length,
      title: payload.title,
      body: payload.body,
    });
    return validTokens.map((token) => ({
      ok: true,
      token,
      id: `sim_${Math.random().toString(36).slice(2, 10)}`,
      simulated: true,
    }));
  }

  const messages = validTokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: payload.sound ?? "default",
    priority: payload.priority ?? "high",
    badge: payload.badge,
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Expo push notification service error", { status: response.status, errorText });
      return validTokens.map((token) => ({
        ok: false,
        token,
        error: `HTTP_${response.status}`,
      }));
    }

    const data = await response.json() as { data?: Array<{ status: string; id?: string; message?: string; details?: unknown }> };
    const tickets = data.data ?? [];

    return validTokens.map((token, i) => {
      const ticket = tickets[i];
      if (ticket && ticket.status === "ok") {
        return { ok: true, token, id: ticket.id };
      }
      return {
        ok: false,
        token,
        error: ticket?.message || "DISPATCH_FAILED",
      };
    });
  } catch (err) {
    log.error("Failed to connect to push notification service", { error: err });
    return validTokens.map((token) => ({
      ok: false,
      token,
      error: "NETWORK_ERROR",
    }));
  }
}

/**
 * Looks up registered active device tokens for an employee and dispatches a push notification.
 */
export async function sendEmployeePushNotification(
  employeeId: string,
  payload: PushNotificationPayload,
): Promise<{ dispatched: number; receipts: PushReceipt[] }> {
  const activeDevices = await prisma.employeeDeviceIdentity.findMany({
    where: {
      employeeId,
      providerType: ProviderType.MOBILE_APP,
      revokedAt: null,
    },
    select: { id: true, label: true, deviceId: true },
  });

  const tokens: string[] = [];
  for (const device of activeDevices) {
    const meta = parseDeviceMetadata(device.label);
    if (meta.pushToken) {
      tokens.push(meta.pushToken);
    }
  }

  if (tokens.length === 0) {
    log.info("No active push tokens found for employee", { employeeId });
    return { dispatched: 0, receipts: [] };
  }

  const receipts = await sendPushNotification(tokens, payload);
  const successCount = receipts.filter((r) => r.ok).length;

  log.info("Employee push notification dispatched", {
    employeeId,
    deviceCount: activeDevices.length,
    successCount,
    title: payload.title,
  });

  return { dispatched: successCount, receipts };
}
