"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBranchPermission } from "@/lib/modules/identity/server";
import {
  listConfigurableRecipientsForBranch,
  saveBranchFeedbackRecipients,
  type ConfigurableRecipient,
  type SaveRecipientInput,
} from "@/lib/modules/feedback/recipients";

const recipientItemSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  name: z.string().trim().max(120).optional(),
  roleLabel: z.string().trim().max(100).optional(),
  userId: z.string().nullish(),
  enabled: z.boolean(),
});

const saveRecipientsSchema = z.object({
  branchId: z.string().min(1),
  recipients: z.array(recipientItemSchema),
});

export async function getBranchRecipientsAction(
  branchId: string,
): Promise<{ success: boolean; data?: ConfigurableRecipient[]; error?: string }> {
  try {
    await requireBranchPermission("branch:read", branchId);
    const data = await listConfigurableRecipientsForBranch(branchId);
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load recipients";
    return { success: false, error: message };
  }
}

export async function saveBranchRecipientsAction(
  branchId: string,
  recipients: SaveRecipientInput[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireBranchPermission("branch:write", branchId);
    const parsed = saveRecipientsSchema.parse({ branchId, recipients });
    await saveBranchFeedbackRecipients(branchId, parsed.recipients, actor);
    revalidatePath(`/admin/branches/${branchId}`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save recipients";
    return { success: false, error: message };
  }
}
