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
      };
    });
  } catch (err: any) {
    log.error("Failed to connect to Firebase Cloud Messaging service", { error: err });
    return tokens.map((token) => ({
      ok: false,
      token,
      error: err?.message || "FCM_NETWORK_ERROR",
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
