import type { JobContext } from "@/lib/platform/jobs";

/**
 * Job type -> handler.
 *
 * Lives here rather than in `lib/platform/jobs.ts` because it connects the
 * platform queue mechanism to domain modules.
 *
 * Handlers are loaded dynamically on invocation so that importing the registry
 * (e.g. from admin job management tools or cron sweeps) introduces zero static
 * module dependencies, preventing circular import loops during bundle evaluation.
 */
export type JobHandler = (payload: unknown, context: JobContext) => Promise<void>;

export const HANDLERS: Record<string, JobHandler> = {
  "feedback.notify": async (payload, context) => {
    const { handleFeedbackNotify } = await import("@/lib/modules/feedback/jobs");
    return handleFeedbackNotify(payload, context);
  },
  "identity.password_reset_send": async (payload, context) => {
    const { handlePasswordResetSend } = await import("@/lib/modules/identity/jobs");
    return handlePasswordResetSend(payload, context);
  },
  "assessments.invitation_send": async (payload, context) => {
    const { handleAssessmentInvitationSend } = await import("@/lib/modules/assessments/jobs");
    return handleAssessmentInvitationSend(payload, context);
  },
  "assessments.notify_hr": async (payload, context) => {
    const { handleAssessmentNotifyHr } = await import("@/lib/modules/assessments/jobs");
    return handleAssessmentNotifyHr(payload, context);
  },
  "aptitude.invitation_send": async (payload, context) => {
    const { handleAptitudeInvitationSend } = await import("@/lib/modules/aptitude/jobs");
    return handleAptitudeInvitationSend(payload, context);
  },
  "aptitude.notify_hr": async (payload, context) => {
    const { handleAptitudeNotifyHr } = await import("@/lib/modules/aptitude/jobs");
    return handleAptitudeNotifyHr(payload, context);
  },
  "announcements.fanout": async (payload) => {
    const { handleAnnouncementFanout } = await import("@/lib/modules/announcements/jobs");
    return handleAnnouncementFanout(payload);
  },
};

export function resolveHandler(type: string): JobHandler | undefined {
  return HANDLERS[type];
}
