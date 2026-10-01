"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auditActorFrom, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { DEFAULT_BANNER_HOURS } from "./constants";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";
import { REFUSAL_MESSAGES, type AudiencePreview } from "./audience";
import { audienceSchema, announcementSchema, type AudienceInput } from "./validation";
import { getAnnouncementDetail } from "./queries";
import { clearUrgentBanner, previewAudience, retryFailedDeliveries, sendAnnouncement } from "./service";
import { MAX_SMS_RECIPIENTS } from "./constants";

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
    sendEmail: formData.get("sendEmail") === "on",
    sendSms: formData.get("sendSms") === "on",
    isUrgent: formData.get("isUrgent") === "on",
    bannerHours: formData.get("bannerHours") ?? DEFAULT_BANNER_HOURS,
    requiresAck: formData.get("requiresAck") === "on",
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
        : result.error === "URGENT_NEEDS_GLOBAL"
          ? "Only someone with company-wide access can send an urgent announcement, because the banner is shown to everyone."
          : result.error === "SMS_LIMIT"
            ? `That would text more than ${MAX_SMS_RECIPIENTS} people. Text fewer people, or use push and email instead.`
            : result.error === "URGENT_CONFLICT"
            ? "Another urgent announcement was sent a moment ago. Check it, then send yours again if it is still needed."
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

/** Ends an urgent banner early. The announcement stays in history. Company-wide senders only, like sending one. */
export async function clearUrgentBannerAction(formData: FormData): Promise<void> {
  const { actor, scope } = await requireAnyBranchPermission("announcement:write");
  const id = String(formData.get("announcementId") ?? "");
  if (!id || scope.kind !== "all") return;

  await clearUrgentBanner(id, { audit: auditActorFrom(actor), name: actor.name });
  revalidatePath("/admin/announcements");
  revalidatePath(`/admin/announcements/${id}`);
}

/**
 * Retries the deliveries that failed. Allowed for the sender of the announcement
 * and for company-wide senders, the same people who can see it (`getAnnouncementDetail`
 * is checked first, so a branch manager cannot retry someone else's).
 */
export async function retryFailedDeliveriesAction(formData: FormData): Promise<void> {
  const { actor, scope } = await requireAnyBranchPermission("announcement:write");
  const id = String(formData.get("announcementId") ?? "");
  if (!id) return;
  const visible = await getAnnouncementDetail(id, { userId: actor.userId, scope });
  if (!visible) return;

  await retryFailedDeliveries(id, { audit: auditActorFrom(actor), name: actor.name });
  revalidatePath(`/admin/announcements/${id}`);
}
