import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  isExpoPushToken,
  parseDeviceMetadata,
  sendPushNotification,
  sendEmployeePushNotification,
} from "@/lib/platform/push";
import { POST as registerPushToken } from "@/lib/../app/api/v1/notifications/push-token/route";
import { createDeviceToken } from "@/lib/modules/attendance/server";
import { prisma } from "@/lib/platform/prisma";
import { ProviderType } from "@prisma/client";

describe("Mobile Push Notifications", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validToken = createDeviceToken({
    employeeId: "emp_100",
    deviceId: "device_phone_1",
    phone: "+233241234567",
  });

  describe("Helpers", () => {
    it("identifies valid and invalid Expo push tokens", () => {
      expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
      expect(isExpoPushToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
      expect(isExpoPushToken("12345678-1234-1234-1234-123456789012")).toBe(true);
      expect(isExpoPushToken("invalid-token-format")).toBe(false);
      expect(isExpoPushToken("")).toBe(false);
    });

    it("parses device metadata from stored label JSON", () => {
      const json = JSON.stringify({
        deviceName: "Kofi's iPhone",
        pushToken: "ExponentPushToken[abc]",
        platform: "ios",
      });

      const meta = parseDeviceMetadata(json);
      expect(meta.deviceName).toBe("Kofi's iPhone");
      expect(meta.pushToken).toBe("ExponentPushToken[abc]");
      expect(meta.platform).toBe("ios");

      // Plain string fallback
      const plain = parseDeviceMetadata("Old Device Label");
      expect(plain.deviceName).toBe("Old Device Label");
      expect(plain.pushToken).toBeUndefined();

      // Null fallback
      expect(parseDeviceMetadata(null)).toEqual({});
    });
  });

  describe("sendPushNotification & sendEmployeePushNotification", () => {
    it("simulates push notifications in test environment without network calls", async () => {
      const receipts = await sendPushNotification(
        ["ExponentPushToken[abc]", "ExponentPushToken[def]"],
        {
          title: "Shift Reminder",
          body: "Your shift starts in 30 minutes.",
        },
      );

      expect(receipts.length).toBe(2);
      expect(receipts[0].ok).toBe(true);
      expect(receipts[0].simulated).toBe(true);
      expect(receipts[1].ok).toBe(true);
    });

    it("fetches active employee device push tokens and dispatches", async () => {
      vi.spyOn(prisma.employeeDeviceIdentity, "findMany").mockResolvedValueOnce([
        {
          id: "dev_1",
          deviceId: "device_phone_1",
          label: JSON.stringify({
            deviceName: "Staff iPhone",
            pushToken: "ExponentPushToken[token123]",
            platform: "ios",
          }),
        },
      ] as never);

      const result = await sendEmployeePushNotification("emp_100", {
        title: "Overtime Approved",
        body: "Your 1h overtime for today has been approved.",
      });

      expect(result.dispatched).toBe(1);
      expect(result.receipts[0].token).toBe("ExponentPushToken[token123]");
    });

    it("returns 0 dispatched when employee has no registered push tokens", async () => {
      vi.spyOn(prisma.employeeDeviceIdentity, "findMany").mockResolvedValueOnce([]);

      const result = await sendEmployeePushNotification("emp_empty", {
        title: "Alert",
        body: "Hello",
      });

      expect(result.dispatched).toBe(0);
      expect(result.receipts).toEqual([]);
    });
  });

  describe("POST /api/v1/notifications/push-token", () => {
    it("returns 401 when device token is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/notifications/push-token", {
        method: "POST",
        body: JSON.stringify({ pushToken: "ExponentPushToken[123]" }),
      });

      const res = await registerPushToken(req);
      expect(res.status).toBe(401);
    });

    it("updates existing device identity label with push token metadata", async () => {
      vi.spyOn(prisma.employeeDeviceIdentity, "findFirst").mockResolvedValueOnce({
        id: "identity_existing",
        employeeId: "emp_100",
        providerType: ProviderType.MOBILE_APP,
        externalId: "device_phone_1",
      } as never);

      const updateSpy = vi.spyOn(prisma.employeeDeviceIdentity, "update").mockResolvedValueOnce({} as never);

      const req = new NextRequest("http://localhost:3000/api/v1/notifications/push-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}` },
        body: JSON.stringify({
          pushToken: "ExponentPushToken[test_1234567890]",
          platform: "android",
          deviceName: "Samsung Galaxy A54",
        }),
      });

      const res = await registerPushToken(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "identity_existing" },
          data: expect.objectContaining({
            label: expect.stringContaining("ExponentPushToken[test_1234567890]"),
          }),
        }),
      );
    });
  });
});
