import "server-only";
import { prisma } from "@/lib/platform/prisma";

/**
 * Resolves active email addresses for HR notifications.
 *
 * 1. Queries active users assigned the HR role.
 * 2. Includes the test or assessment creator if active.
 * 3. Falls back to active Super Admins if no HR users are configured.
 */
export async function getHrNotificationEmails(createdByUserId?: string | null): Promise<string[]> {
  const now = new Date();
  const hrUsers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roleAssignments: {
        some: {
          role: "HR",
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
      },
    },
    select: { email: true },
  });

  const emails: string[] = hrUsers
    .map((u) => u.email.trim().toLowerCase())
    .filter(Boolean);

  if (createdByUserId) {
    const creator = await prisma.user.findUnique({
      where: { id: createdByUserId, status: "ACTIVE" },
      select: { email: true },
    });
    if (creator?.email) {
      emails.push(creator.email.trim().toLowerCase());
    }
  }

  if (emails.length === 0) {
    const admins = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        roleAssignments: {
          some: {
            role: "SUPER_ADMIN",
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
        },
      },
      select: { email: true },
    });
    emails.push(...admins.map((u) => u.email.trim().toLowerCase()).filter(Boolean));
  }

  return Array.from(new Set(emails));
}
