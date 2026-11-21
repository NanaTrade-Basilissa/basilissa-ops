"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission, auditActorFrom } from "@/lib/modules/identity/server";
import { recordAudit } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import {
  multiReleaseInputSchema,
  releaseInputSchema,
  type MultiReleaseInput,
  type ReleaseInput,
} from "./validation";
import { PLATFORM_LABELS, compareVersions } from "./version";
import { broadcastReleasePush } from "./server";

const log = scoped("releases");

export type ReleaseActionResult =
  | {
      success: true;
      pushed: number;
      simulated?: number;
      failed?: number;
      totalTokens?: number;
      pushError?: string;
    }
  | { success: false; error: string };

/**
 * Records a store release. The action is the permission boundary, not the page:
 * a Server Action is reachable by direct POST.
 */
export async function createReleaseAction(input: ReleaseInput): Promise<ReleaseActionResult> {
  const actor = await requirePermission("releases:manage");

  const parsed = releaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid release." };
  }
  const { platform, version, updateMode, releaseNotes, sendPush } = parsed.data;

  // A typo here can lock every staff member out, so refuse anything that is not
  // strictly newer than what is already out on this platform.
  const existing = await prisma.appRelease.findMany({ where: { platform }, select: { version: true } });
  const newest = existing.map((r) => r.version).sort((a, b) => compareVersions(b, a))[0];
  if (newest && compareVersions(version, newest) <= 0) {
    return {
      success: false,
      error: `Version must be newer than the current ${platform === "IOS" ? "iOS" : "Android"} release (${newest}).`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const release = await tx.appRelease.create({
        data: { platform, version, updateMode, releaseNotes, createdById: actor.userId },
      });
      await recordAudit(
        {
          actor: auditActorFrom(actor),
          action: "app_release.created",
          entityType: "AppRelease",
          entityId: release.id,
          after: { platform, version, updateMode, pushRequested: sendPush },
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "That version is already recorded for this platform." };
    }
    throw error;
  }

  let pushed = 0;
  let simulated = 0;
  let failed = 0;
  let totalTokens = 0;
  let pushError: string | undefined;

  if (sendPush) {
    try {
      const summary = await broadcastReleasePush(platform, version, updateMode);
      pushed = summary.delivered;
      simulated = summary.simulated;
      failed = summary.failed;
      totalTokens = summary.totalTokens;
      pushError = summary.firstError;
      if (summary.failed > 0 || summary.simulated > 0) {
        log.warn("release push completed with non-live deliveries", { platform, version, ...summary });
      }
    } catch (error) {
      log.warn("release push failed", { error });
      pushError = error instanceof Error ? error.message : "Push dispatch failed";
    }
  }

  revalidatePath("/admin/releases");
  return { success: true, pushed, simulated, failed, totalTokens, pushError };
}

/**
 * Records a release for one or more platforms (Android, iOS, Web) in a single
 * atomic transaction so admins never have to fill the form twice.
 */
export async function createReleasesAction(
  input: MultiReleaseInput,
): Promise<ReleaseActionResult & { createdCount?: number }> {
  const actor = await requirePermission("releases:manage");

  const parsed = multiReleaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid release." };
  }
  const { platforms, version, updateMode, releaseNotes, sendPush } = parsed.data;

  // Validate version monotonicity for every selected platform before writing
  for (const platform of platforms) {
    const existing = await prisma.appRelease.findMany({
      where: { platform },
      select: { version: true },
    });
    const newest = existing.map((r) => r.version).sort((a, b) => compareVersions(b, a))[0];
    if (newest && compareVersions(version, newest) <= 0) {
      return {
        success: false,
        error: `Version must be newer than the current ${PLATFORM_LABELS[platform]} release (${newest}).`,
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const platform of platforms) {
        const release = await tx.appRelease.create({
          data: { platform, version, updateMode, releaseNotes, createdById: actor.userId },
        });
        await recordAudit(
          {
            actor: auditActorFrom(actor),
            action: "app_release.created",
            entityType: "AppRelease",
            entityId: release.id,
            after: { platform, version, updateMode, pushRequested: sendPush && platform !== "WEB" },
          },
          tx,
        );
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "That version is already recorded for one of the selected platforms." };
    }
    throw error;
  }

  let pushed = 0;
  let simulated = 0;
  let failed = 0;
  let totalTokens = 0;
  let pushError: string | undefined;

  if (sendPush) {
    for (const platform of platforms) {
      if (platform === "WEB") continue;
      try {
        const summary = await broadcastReleasePush(platform, version, updateMode);
        pushed += summary.delivered;
        simulated += summary.simulated;
        failed += summary.failed;
        totalTokens += summary.totalTokens;
        if (!pushError && summary.firstError) pushError = summary.firstError;
        if (summary.failed > 0 || summary.simulated > 0) {
          log.warn("release push completed with non-live deliveries", { platform, version, ...summary });
        }
      } catch (error) {
        log.warn("release push failed", { platform, error });
        if (!pushError) pushError = error instanceof Error ? error.message : "Push dispatch failed";
      }
    }
  }

  revalidatePath("/admin/releases");
  return { success: true, pushed, simulated, failed, totalTokens, pushError, createdCount: platforms.length };
}
