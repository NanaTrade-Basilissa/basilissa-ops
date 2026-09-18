import "server-only";
import { JobStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { enqueue } from "@/lib/platform/jobs";
import { recordAudit } from "@/lib/platform/audit";
import { auditActorFrom } from "./audit";
import { isSuperAdmin, type Actor } from "./authorization";
import { EMAIL_JOB_TYPES, type EmailJobType, type FormattedEmailJob } from "./constants";

export { EMAIL_JOB_TYPES, type EmailJobType, type FormattedEmailJob };

export type EmailQueueStats = {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  dead: number;
};

/**
 * Extracts human-friendly email metadata (recipient, subject/purpose, label)
 * from a raw job payload without throwing on schema variations.
 */
export function parseEmailJobPayload(type: string, rawPayload: unknown): {
  typeLabel: string;
  recipient: string;
  subject: string;
} {
  const payload = (typeof rawPayload === "object" && rawPayload !== null ? rawPayload : {}) as Record<
    string,
    unknown
  >;

  switch (type) {
    case "feedback.notify": {
      const submissionId = typeof payload.submissionId === "string" ? payload.submissionId : "Unknown";
      return {
        typeLabel: "Feedback Alert",
        recipient: "Configured Notification Emails",
        subject: `New Feedback Submission (${submissionId})`,
      };
    }

    case "identity.password_reset_send": {
      const email = typeof payload.email === "string" ? payload.email : "Unknown recipient";
      const purpose = payload.purpose === "INVITE" ? "Account Invitation" : "Password Reset";
      const name = typeof payload.name === "string" ? payload.name : undefined;
      return {
        typeLabel: purpose === "Account Invitation" ? "Account Invite" : "Password Reset",
        recipient: email,
        subject: name ? `${purpose} for ${name}` : `${purpose} Link`,
      };
    }

    case "assessments.invitation_send": {
      const email = typeof payload.email === "string" ? payload.email : "Unknown recipient";
      const title = typeof payload.assessmentTitle === "string" ? payload.assessmentTitle : "Assessment";
      const name = typeof payload.inviteeName === "string" ? payload.inviteeName : "";
      return {
        typeLabel: "Assessment Invite",
        recipient: email,
        subject: name ? `Assessment: ${title} (${name})` : `Assessment: ${title}`,
      };
    }

    case "assessments.notify_hr": {
      const responseId = typeof payload.responseId === "string" ? payload.responseId : "";
      return {
        typeLabel: "Assessment Result (HR)",
        recipient: "HR Team",
        subject: responseId ? `Assessment completed: ${responseId}` : "Assessment completed",
      };
    }

    case "aptitude.invitation_send": {
      const email = typeof payload.email === "string" ? payload.email : "Unknown recipient";
      const title = typeof payload.testTitle === "string" ? payload.testTitle : "Aptitude Test";
      const name = typeof payload.inviteeName === "string" ? payload.inviteeName : "";
      return {
        typeLabel: "Aptitude Invite",
        recipient: email,
        subject: name ? `Aptitude Test: ${title} (${name})` : `Aptitude Test: ${title}`,
      };
    }

    case "aptitude.notify_hr": {
      const attemptId = typeof payload.attemptId === "string" ? payload.attemptId : "";
      return {
        typeLabel: "Aptitude Result (HR)",
        recipient: "HR Team",
        subject: attemptId ? `Aptitude test completed: ${attemptId}` : "Aptitude test completed",
      };
    }

    default:
      return {
        typeLabel: type,
        recipient: typeof payload.email === "string" ? payload.email : "System",
        subject: `Job: ${type}`,
      };
  }
}

/**
 * Aggregates counts across the email queue by status.
 */
export async function getEmailQueueStats(): Promise<EmailQueueStats> {
  const where: Prisma.JobWhereInput = {
    type: { in: [...EMAIL_JOB_TYPES] },
  };

  const [total, pending, running, succeeded, dead] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.count({ where: { ...where, status: "PENDING" } }),
    prisma.job.count({ where: { ...where, status: "RUNNING" } }),
    prisma.job.count({ where: { ...where, status: "SUCCEEDED" } }),
    prisma.job.count({ where: { ...where, status: "DEAD" } }),
  ]);

  return { total, pending, running, succeeded, dead };
}

export type ListEmailJobsOptions = {
  status?: JobStatus | "ALL";
  type?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ListEmailJobsResult = {
  jobs: FormattedEmailJob[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Returns paginated, formatted email jobs with status and type filters.
 */
export async function listEmailJobs(options: ListEmailJobsOptions = {}): Promise<ListEmailJobsResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));

  const where: Prisma.JobWhereInput = {
    type: options.type && options.type !== "ALL" ? options.type : { in: [...EMAIL_JOB_TYPES] },
    ...(options.status && options.status !== "ALL" ? { status: options.status } : {}),
    ...(options.search
      ? {
          OR: [
            { id: { contains: options.search } },
            { lastError: { contains: options.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rawJobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const jobs: FormattedEmailJob[] = rawJobs.map((j) => {
    const { typeLabel, recipient, subject } = parseEmailJobPayload(j.type, j.payload);
    return {
      id: j.id,
      type: j.type,
      typeLabel,
      recipient,
      subject,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      runAt: j.runAt,
      lastError: j.lastError,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      payload: (typeof j.payload === "object" && j.payload !== null ? j.payload : {}) as Record<string, unknown>,
    };
  });

  return {
    jobs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/**
 * Retries a failed or stalled email job: resets attempts and schedules immediate pickup.
 */
export async function retryEmailJob(
  jobId: string,
  actor: Actor,
): Promise<{ success: boolean; error?: string }> {
  if (!isSuperAdmin(actor)) {
    return { success: false, error: "Only Super Admins can retry email jobs" };
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      runAt: new Date(),
      attempts: 0,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      completedAt: null,
    },
  });

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "email_queue.retry",
    entityType: "job",
    entityId: jobId,
    after: { status: "PENDING", attempts: 0, runAt: "immediate" },
  });

  return { success: true };
}

/**
 * Re-enqueues a fresh email job with the exact same type and payload.
 */
export async function resendEmailJob(
  jobId: string,
  actor: Actor,
): Promise<{ success: boolean; newJobId?: string; error?: string }> {
  if (!isSuperAdmin(actor)) {
    return { success: false, error: "Only Super Admins can resend email jobs" };
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  const newJobId = await enqueue(job.type, job.payload as Prisma.InputJsonValue);

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "email_queue.resend",
    entityType: "job",
    entityId: newJobId,
    before: { originalJobId: jobId, type: job.type },
  });

  return { success: true, newJobId };
}

/**
 * Cancels a pending email job, marking it DEAD so the worker will not execute it.
 */
export async function cancelEmailJob(
  jobId: string,
  actor: Actor,
): Promise<{ success: boolean; error?: string }> {
  if (!isSuperAdmin(actor)) {
    return { success: false, error: "Only Super Admins can cancel email jobs" };
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status !== "PENDING") {
    return { success: false, error: `Cannot cancel a job with status ${job.status}` };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "DEAD",
      lastError: `Cancelled by Super Admin (${actor.email})`,
      lockedAt: null,
      lockedBy: null,
      completedAt: new Date(),
    },
  });

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "email_queue.cancel",
    entityType: "job",
    entityId: jobId,
    after: { status: "DEAD", reason: "cancelled_by_admin" },
  });

  return { success: true };
}
