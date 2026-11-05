"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission, auditActorFrom } from "@/lib/modules/identity/server";
import { recordAudit } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { releaseInputSchema, type ReleaseInput } from "./validation";
import { compareVersions } from "./version";
import { broadcastReleasePush } from "./server";

const log = scoped("releases");

export type ReleaseActionResult =
  | { success: true; pushed: number }
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
  if (sendPush) {
    try {
      pushed = await broadcastReleasePush(platform, version, updateMode);
    } catch (error) {
      log.warn("release push failed", { error });
    }
  }

  revalidatePath("/admin/releases");
  return { success: true, pushed };
}
