"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auditActorFrom, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";
import { REFUSAL_MESSAGES, type AudiencePreview } from "./audience";
import { audienceSchema, announcementSchema, type AudienceInput } from "./validation";
import { previewAudience, sendAnnouncement } from "./service";

/**
 * Both actions re-check `announcement:write`, because a Server Action is
 * reachable by direct POST and the compose page's own guard is only a
 * convenience. `requireAnyBranchPermission` also hands back the sender's scope,
 * which decides who they may address; a branch manager's form can offer only
 * their own branches, but nothing stops a hand-built request naming another, so
 * the service checks the audience against the scope itself.
 */

export type AnnouncementFormState = FormState;

export async function sendAnnouncementAction(
  _prevState: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const { actor, scope } = await requireAnyBranchPermission("announcement:write");

  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    audienceKind: formData.get("audienceKind"),
    branchIds: formData.getAll("branchIds").map(String),
    employeeIds: formData.getAll("employeeIds").map(String),
    sendPush: formData.get("sendPush") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const result = await sendAnnouncement(
    parsed.data,
    { audit: auditActorFrom(actor), name: actor.name },
    scope,
  );

  if (!result.ok) {
    const message =
      result.error === "NO_RECIPIENTS"
        ? "Nobody active matches that audience, so there is no one to send it to."
        : REFUSAL_MESSAGES[result.error];
    return { error: message };
  }

  revalidatePath("/admin/announcements");
  redirect(`/admin/announcements/${result.announcementId}`);
}

/** The recipient count shown before sending. Never writes anything. */
export async function previewAnnouncementAudienceAction(input: AudienceInput): Promise<AudiencePreview> {
  const { scope } = await requireAnyBranchPermission("announcement:write");
  const parsed = audienceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "NO_RECIPIENTS" };
  return previewAudience(parsed.data, scope);
}
