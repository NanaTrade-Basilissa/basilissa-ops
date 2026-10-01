import { z } from "zod";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, AUDIENCE_KINDS, BANNER_HOURS } from "./constants";

/**
 * A realistic ceiling, not a technical one: an announcement to more than this
 * many hand-picked people should be a branch or everyone, and an unbounded list
 * in a form post is an easy way to make a request enormous.
 */
export const MAX_PEOPLE_PER_ANNOUNCEMENT = 500;

const id = z.string().min(1);

export const announcementSchema = z
  .object({
    title: z.string().trim().min(1, "Add a title").max(ANNOUNCEMENT_TITLE_MAX, `Keep it under ${ANNOUNCEMENT_TITLE_MAX} characters`),
    body: z.string().trim().min(1, "Write the message").max(ANNOUNCEMENT_BODY_MAX, `Keep it under ${ANNOUNCEMENT_BODY_MAX} characters`),
    audienceKind: z.enum(AUDIENCE_KINDS, { message: "Choose who it is for" }),
    branchIds: z.array(id).max(200),
    employeeIds: z.array(id).max(MAX_PEOPLE_PER_ANNOUNCEMENT, `Choose at most ${MAX_PEOPLE_PER_ANNOUNCEMENT} people, or use a branch`),
    sendPush: z.boolean(),
    /** Pins a banner in the app. Company-wide senders only; one at a time. */
    isUrgent: z.boolean(),
    bannerHours: z.coerce
      .number()
      .refine((hours) => (BANNER_HOURS as readonly number[]).includes(hours), "Choose how long the banner stays up"),
    /** Staff must tap "I've read this". */
    requiresAck: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.audienceKind === "BRANCHES" && value.branchIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Choose at least one branch" });
    }
    if (value.audienceKind === "PEOPLE" && value.employeeIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["employeeIds"], message: "Choose at least one person" });
    }
  });

export type AnnouncementInput = z.infer<typeof announcementSchema>;

/** Just the audience, for the live recipient count before sending. */
export const audienceSchema = z.object({
  audienceKind: z.enum(AUDIENCE_KINDS),
  branchIds: z.array(id).max(200),
  employeeIds: z.array(id).max(MAX_PEOPLE_PER_ANNOUNCEMENT),
});

export type AudienceInput = z.infer<typeof audienceSchema>;
