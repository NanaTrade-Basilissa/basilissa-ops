import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { getEnv } from "@/lib/platform/env";
import { ProviderType } from "@prisma/client";
import { parseDeviceMetadata, sendPushNotification } from "@/lib/platform/push";
import type { AppPlatformKey, UpdateStatus } from "./version";
import { resolveUpdateStatus } from "./version";
import type { AppReleaseItem } from "./constants";

export const DEFAULT_ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.basilissa.employee";

export function storeUrlFor(platform: AppPlatformKey): string | null {
  const env = getEnv();
  if (platform === "IOS") return env.APP_STORE_URL_IOS ?? null;
  return env.APP_STORE_URL_ANDROID ?? DEFAULT_ANDROID_STORE_URL;
}

export async function getUpdateStatus(
  platform: AppPlatformKey,
  currentVersion: string,
): Promise<UpdateStatus & { storeUrl: string | null }> {
  const releases = await prisma.appRelease.findMany({
    where: { platform },
    select: { version: true, updateMode: true, releaseNotes: true },
  });
  return { ...resolveUpdateStatus(releases, currentVersion), storeUrl: storeUrlFor(platform) };
}

export async function listReleases(): Promise<AppReleaseItem[]> {
  const rows = await prisma.appRelease.findMany({
    orderBy: { releasedAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    version: r.version,
    updateMode: r.updateMode,
    releaseNotes: r.releaseNotes,
    releasedAt: r.releasedAt.toISOString(),
    createdByName: r.createdBy.name || r.createdBy.email,
  }));
}

/**
 * Tells staff on the given platform that an update exists. Only ever called
 * when the admin ticked the box; a release never messages anyone on its own.
 * Best effort: a push failure must not undo a release that is already recorded.
 */
export async function broadcastReleasePush(
  platform: AppPlatformKey,
  version: string,
  mode: "FLEXIBLE" | "REQUIRED",
): Promise<number> {
  const identities = await prisma.employeeDeviceIdentity.findMany({
    where: { providerType: ProviderType.MOBILE_APP, revokedAt: null, employee: { status: "ACTIVE" } },
    select: { label: true },
  });
  const tokens = new Set<string>();
  for (const identity of identities) {
    const meta = parseDeviceMetadata(identity.label);
    if (!meta.pushToken) continue;
    if (meta.platform && meta.platform.toLowerCase() !== platform.toLowerCase()) continue;
    tokens.add(meta.pushToken);
  }
  if (tokens.size === 0) return 0;
  const receipts = await sendPushNotification([...tokens], {
    title: "Update available",
    body:
      mode === "REQUIRED"
        ? `Basilissa Staff ${version} is ready. Please update to keep using the app.`
        : `Basilissa Staff ${version} is now available in the store.`,
    data: { type: "APP_UPDATE", version },
  });
  return receipts.filter((r) => r.ok).length;
}
