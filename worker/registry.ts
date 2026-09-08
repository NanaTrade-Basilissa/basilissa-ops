import { FEEDBACK_NOTIFY, handleFeedbackNotify } from "@/lib/modules/feedback/jobs";
import { PASSWORD_RESET_SEND, handlePasswordResetSend } from "@/lib/modules/identity/jobs";
import { ASSESSMENT_INVITATION_SEND, handleAssessmentInvitationSend } from "@/lib/modules/assessments/jobs";
import { APTITUDE_INVITATION_SEND, handleAptitudeInvitationSend } from "@/lib/modules/aptitude/jobs";

/**
 * Job type -> handler.
 *
 * Lives here rather than in `lib/platform/jobs.ts` because it imports from
 * domain modules, and platform must never depend on a module. The queue owns
 * the mechanism; this owns the vocabulary.
 *
 * Adding a job type means adding a line here. A queued job whose type is
 * missing from this map is treated as a failure and retried, then dies — which
 * is the right outcome for a job enqueued by a newer deploy than the worker
 * running it, since the worker will be replaced shortly and the retry will
 * then succeed.
 */
export type JobHandler = (payload: unknown) => Promise<void>;

export const HANDLERS: Record<string, JobHandler> = {
  [FEEDBACK_NOTIFY]: handleFeedbackNotify,
  [PASSWORD_RESET_SEND]: handlePasswordResetSend,
  [ASSESSMENT_INVITATION_SEND]: handleAssessmentInvitationSend,
  [APTITUDE_INVITATION_SEND]: handleAptitudeInvitationSend,
};

export function resolveHandler(type: string): JobHandler | undefined {
  return HANDLERS[type];
}
