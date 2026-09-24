import "server-only";
import { getEnv } from "@/lib/platform/env";
import { sendEmail, type SendEmailResult } from "@/lib/platform/email";
import {
  buildFeedbackNotificationEmail,
  type FeedbackNotificationPayload,
  type NotificationAnswer,
} from "@/lib/email-templates";
import { getFeedbackRecipientsForBranch } from "./recipients";

export type { NotificationAnswer, FeedbackNotificationPayload };

/**
 * Sends the feedback notification to every configured recipient for the branch.
 *
 * Never throws, and returns what happened. The submission is already saved by
 * the time this runs, so a failure is not the customer's problem: it is
 * logged, and the job that called this knows whether another attempt is needed.
 */
export async function sendFeedbackNotification(
  payload: FeedbackNotificationPayload,
): Promise<SendEmailResult> {
  const dashboardUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/admin/branches/${payload.branchId}#submission-${payload.submissionId}`;
  const recipients = await getFeedbackRecipientsForBranch(payload.branchId);

  return sendEmail({
    to: recipients,
    from: payload.branchName,
    subject: `New feedback: ${payload.branchName} (${payload.overallScore.toFixed(1)}/5)`,
    html: buildFeedbackNotificationEmail(payload, dashboardUrl),
    context: { submissionId: payload.submissionId },
  });
}
