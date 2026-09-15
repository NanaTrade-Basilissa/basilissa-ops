import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { auditActorFrom, type Actor } from "@/lib/modules/identity/server";
import { recordAudit } from "@/lib/platform/audit";

export type ConfigurableRecipient = {
  id?: string;
  email: string;
  name: string;
  roleLabel: string;
  userId?: string | null;
  enabled: boolean;
  isDefaultManager: boolean;
};

/**
 * Resolves the destination email addresses for a new feedback submission.
 *
 * If the branch has configured recipients in branch_feedback_recipients,
 * this returns all enabled addresses.
 *
 * If no custom recipients have been configured yet, it resolves active users
 * holding BRANCH_MANAGER for this branch, and AREA_MANAGER covering this branch.
 * Both are checked by default per system requirements.
 */
export async function getFeedbackRecipientsForBranch(branchId: string): Promise<string[]> {
  const configured = await prisma.branchFeedbackRecipient.findMany({
    where: { branchId },
    select: { email: true, enabled: true },
  });

  if (configured.length > 0) {
    return Array.from(
      new Set(
        configured
          .filter((r) => r.enabled)
          .map((r) => r.email.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  // Default behavior when no customization has been saved yet:
  // Dynamically resolve active Branch Managers and Area Managers for this branch.
  const now = new Date();
  const defaultManagers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roleAssignments: {
        some: {
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
          AND: [
            {
              OR: [
                {
                  role: "BRANCH_MANAGER",
                  scopeType: "BRANCH",
                  scopeId: branchId,
                },
                {
                  role: "AREA_MANAGER",
                  OR: [
                    { scopeType: "BRANCH", scopeId: branchId },
                    { scopeType: "GLOBAL" },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    select: { email: true },
  });

  return Array.from(
    new Set(
      defaultManagers
        .map((u) => u.email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/**
 * Lists recipients for administrative review and editing on the branch page.
 */
export async function listConfigurableRecipientsForBranch(
  branchId: string,
): Promise<ConfigurableRecipient[]> {
  const now = new Date();

  // Find active users with branch or area manager roles for this branch
  const activeManagers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roleAssignments: {
        some: {
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
          AND: [
            {
              OR: [
                {
                  role: "BRANCH_MANAGER",
                  scopeType: "BRANCH",
                  scopeId: branchId,
                },
                {
                  role: "AREA_MANAGER",
                  OR: [
                    { scopeType: "BRANCH", scopeId: branchId },
                    { scopeType: "GLOBAL" },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      roleAssignments: {
        where: {
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
        select: {
          role: true,
          scopeType: true,
          scopeId: true,
        },
      },
    },
  });

  const existingRows = await prisma.branchFeedbackRecipient.findMany({
    where: { branchId },
    orderBy: { createdAt: "asc" },
  });

  const recipientsByEmail = new Map<string, ConfigurableRecipient>();

  if (existingRows.length > 0) {
    for (const row of existingRows) {
      const emailLower = row.email.toLowerCase();
      recipientsByEmail.set(emailLower, {
        id: row.id,
        email: row.email,
        name: row.name || row.email,
        roleLabel: row.roleLabel || "Custom recipient",
        userId: row.userId,
        enabled: row.enabled,
        isDefaultManager: false,
      });
    }

    // Annotate default manager flags and add any newly assigned managers
    for (const manager of activeManagers) {
      const emailLower = manager.email.toLowerCase();
      const roles = manager.roleAssignments.map((ra) => ra.role);
      const isBM = roles.includes("BRANCH_MANAGER");
      const isAM = roles.includes("AREA_MANAGER");
      const roleLabel = isBM && isAM ? "Branch & Area Manager" : isBM ? "Branch Manager" : "Area Manager";

      const existing = recipientsByEmail.get(emailLower);
      if (existing) {
        existing.isDefaultManager = true;
        if (!existing.roleLabel || existing.roleLabel === "Custom recipient") {
          existing.roleLabel = roleLabel;
        }
      } else {
        // Manager assigned recently, default enabled to true
        recipientsByEmail.set(emailLower, {
          email: manager.email,
          name: manager.name,
          roleLabel,
          userId: manager.id,
          enabled: true,
          isDefaultManager: true,
        });
      }
    }
  } else {
    // Initial state: default managers are checked
    for (const manager of activeManagers) {
      const emailLower = manager.email.toLowerCase();
      const roles = manager.roleAssignments.map((ra) => ra.role);
      const isBM = roles.includes("BRANCH_MANAGER");
      const isAM = roles.includes("AREA_MANAGER");
      const roleLabel = isBM && isAM ? "Branch & Area Manager" : isBM ? "Branch Manager" : "Area Manager";

      recipientsByEmail.set(emailLower, {
        email: manager.email,
        name: manager.name,
        roleLabel,
        userId: manager.id,
        enabled: true,
        isDefaultManager: true,
      });
    }
  }

  return Array.from(recipientsByEmail.values());
}

export type SaveRecipientInput = {
  email: string;
  name?: string;
  roleLabel?: string;
  userId?: string | null;
  enabled: boolean;
};

/**
 * Saves the complete recipient configuration for a branch.
 */
export async function saveBranchFeedbackRecipients(
  branchId: string,
  recipients: SaveRecipientInput[],
  actor: Actor,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.branchFeedbackRecipient.findMany({
      where: { branchId },
    });

    const incomingEmails = new Set(recipients.map((r) => r.email.trim().toLowerCase()));

    // Delete removed custom recipients
    const toDelete = existing.filter((e) => !incomingEmails.has(e.email.toLowerCase()));
    if (toDelete.length > 0) {
      await tx.branchFeedbackRecipient.deleteMany({
        where: { id: { in: toDelete.map((d) => d.id) } },
      });
    }

    // Upsert remaining/new recipients
    for (const r of recipients) {
      const emailClean = r.email.trim().toLowerCase();
      await tx.branchFeedbackRecipient.upsert({
        where: {
          branchId_email: {
            branchId,
            email: emailClean,
          },
        },
        create: {
          branchId,
          email: emailClean,
          name: r.name?.trim() || null,
          roleLabel: r.roleLabel?.trim() || null,
          userId: r.userId || null,
          enabled: r.enabled,
        },
        update: {
          name: r.name?.trim() || null,
          roleLabel: r.roleLabel?.trim() || null,
          userId: r.userId || null,
          enabled: r.enabled,
        },
      });
    }

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "branch.feedback_recipients_updated",
        entityType: "Branch",
        entityId: branchId,
        metadata: {
          recipientCount: recipients.length,
          enabledCount: recipients.filter((r) => r.enabled).length,
        },
      },
      tx,
    );
  });
}
