import { scoped } from "@/lib/platform/logger";
import { prisma } from "@/lib/platform/prisma";
import { ProviderType } from "@prisma/client";
import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

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
  /** The provider says this token will never work again (app uninstalled, token rotated). */
  permanent?: boolean;
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
 * The name to SHOW for a device, from its stored label.
 *
 * The label is not just a name: once the app registers for push it is JSON
 * holding the push token. That token must never reach an admin screen, the
 * browser, or the audit log (which can never be edited), so anything that
 * displays or records a device goes through this and never prints the raw label.
 */
export function deviceNameFromLabel(rawLabel: string | null | undefined): string | null {
  const name = parseDeviceMetadata(rawLabel ?? null).deviceName?.trim();
  return name ? name : null;
}

/** FCM error codes meaning the registration token is permanently unusable. */
function isDeadFcmCode(code: string | undefined): boolean {
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
}

/**
 * Removes the given tokens from the device identities that hold them. Only the
 * token goes: the binding and the device name stay (see `deviceNameFromLabel`).
 * The phone registers a fresh token the next time the app starts.
 */
export async function pruneDeadPushTokens(tokens: string[]): Promise<number> {
  let pruned = 0;
  for (const token of new Set(tokens)) {
    const identities = await prisma.employeeDeviceIdentity.findMany({
      where: { providerType: ProviderType.MOBILE_APP, revokedAt: null, label: { contains: token } },
      select: { id: true, label: true },
    });
    for (const identity of identities) {
      const meta = parseDeviceMetadata(identity.label);
      if (meta.pushToken !== token) continue;
      const label = meta.deviceName ?? (meta.platform ? JSON.stringify({ platform: meta.platform }) : null);
      await prisma.employeeDeviceIdentity.update({ where: { id: identity.id }, data: { label } });
      pruned++;
    }
  }
  return pruned;
}

let isFirebaseAdminInitialized = false;

function getFirebaseMessaging(): Messaging | null {
  if (isFirebaseAdminInitialized && getApps().length > 0) {
    return getMessaging();
  }

  // 1. Check for service account JSON in FIREBASE_SERVICE_ACCOUNT_KEY
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountRaw) {
    try {
      const creds = JSON.parse(
        serviceAccountRaw.startsWith("{")
          ? serviceAccountRaw
          : Buffer.from(serviceAccountRaw, "base64").toString("utf-8")
      );
      if (!getApps().length) {
        initializeApp({
          credential: cert(creds),
          projectId: creds.project_id || "basilissa-staff-app",
        });
      }
      isFirebaseAdminInitialized = true;
      return getMessaging();
    } catch (err) {
      log.error("Failed to initialize Firebase Admin with FIREBASE_SERVICE_ACCOUNT_KEY", { error: err });
    }
  }

  // 2. Check for application default credentials
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      if (!getApps().length) {
        initializeApp({
          credential: applicationDefault(),
          projectId: "basilissa-staff-app",
        });
      }
      isFirebaseAdminInitialized = true;
      return getMessaging();
    } catch (err) {
      log.error("Failed to initialize Firebase Admin with application default credentials", { error: err });
    }
  }

  return null;
}

/**
 * Dispatches push notifications via Firebase Cloud Messaging (FCM).
 */
async function sendFCMPushNotification(
  tokens: string[],
  payload: PushNotificationPayload
): Promise<PushReceipt[]> {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    log.info("Firebase Admin not configured, simulating FCM push delivery", {
      tokenCount: tokens.length,
      title: payload.title,
    });
    return tokens.map((token) => ({
      ok: true,
      token,
      id: `sim_fcm_${Math.random().toString(36).slice(2, 10)}`,
      simulated: true,
    }));
  }

  try {
    const stringData = payload.data
      ? Object.fromEntries(
          Object.entries(payload.data).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
        )
      : undefined;

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: stringData,
      android: {
        priority: payload.priority === "default" || payload.priority === "normal" ? "normal" : "high",
        notification: {
          channelId: "default",
          sound: payload.sound === null ? undefined : "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: payload.sound === null ? undefined : "default",
            badge: payload.badge,
          },
        },
      },
    });

    return tokens.map((token, i) => {
      const resp = response.responses[i];
      if (resp?.success) {
        return { ok: true, token, id: resp.messageId };
      }
      return {
        ok: false,
        token,
        error: resp?.error?.message || resp?.error?.code || "FCM_DISPATCH_FAILED",
        permanent: isDeadFcmCode(resp?.error?.code),
      };
    });
  } catch (err) {
    log.error("Failed to connect to Firebase Cloud Messaging service", { error: err });
    return tokens.map((token) => ({
      ok: false,
      token,
      error: (err instanceof Error && err.message) || "FCM_NETWORK_ERROR",
    }));
  }
}

/**
 * Dispatches push notifications via Expo Push API.
 */
async function sendExpoPushNotification(
  tokens: string[],
  payload: PushNotificationPayload
): Promise<PushReceipt[]> {
  const messages = tokens.map((to) => ({
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
      return tokens.map((token) => ({
        ok: false,
        token,
        error: `HTTP_${response.status}`,
      }));
    }

    const data = (await response.json()) as {
      data?: Array<{ status: string; id?: string; message?: string; details?: unknown }>;
    };
    const tickets = data.data ?? [];

    return tokens.map((token, i) => {
      const ticket = tickets[i];
      if (ticket && ticket.status === "ok") {
        return { ok: true, token, id: ticket.id };
      }
      return {
        ok: false,
        token,
        error: ticket?.message || "DISPATCH_FAILED",
        permanent: (ticket?.details as { error?: string } | undefined)?.error === "DeviceNotRegistered",
      };
    });
  } catch (err) {
    log.error("Failed to connect to push notification service", { error: err });
    return tokens.map((token) => ({
      ok: false,
      token,
      error: "NETWORK_ERROR",
    }));
  }
}

/**
 * Sends a push notification to one or multiple device tokens (supports both Firebase FCM and Expo tokens).
 */
export async function sendPushNotification(
  tokens: string[],
  payload: PushNotificationPayload,
): Promise<PushReceipt[]> {
  const validTokens = tokens.filter((t) => typeof t === "string" && t.trim().length > 0);
  if (validTokens.length === 0) {
    return [];
  }

  // Simulation mode during vitest tests or when explicit push disabled
  if (
    process.env.NODE_ENV === "test" ||
    process.env.EXPO_PUSH_DISABLED === "true" ||
    process.env.PUSH_NOTIFICATIONS_DISABLED === "true"
  ) {
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

  const expoTokens: string[] = [];
  const fcmTokens: string[] = [];

  for (const token of validTokens) {
    if (isExpoPushToken(token)) {
      expoTokens.push(token);
    } else {
      fcmTokens.push(token);
    }
  }

  const receipts: PushReceipt[] = [];

  if (expoTokens.length > 0) {
    const expoReceipts = await sendExpoPushNotification(expoTokens, payload);
    receipts.push(...expoReceipts);
  }

  if (fcmTokens.length > 0) {
    const fcmReceipts = await sendFCMPushNotification(fcmTokens, payload);
    receipts.push(...fcmReceipts);
  }

  // A token the provider says is dead is removed now, so the next send reports
  // "no device" instead of failing again, and the person is not counted as
  // reachable. Best effort: it must never fail the send.
  const dead = receipts.filter((receipt) => receipt.permanent).map((receipt) => receipt.token);
  if (dead.length > 0) {
    try {
      await pruneDeadPushTokens(dead);
    } catch (error) {
      log.warn("could not prune dead push tokens", { error });
    }
  }

  return receipts;
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
