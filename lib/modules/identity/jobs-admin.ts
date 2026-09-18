import "server-only";
import { JobStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit } from "@/lib/platform/audit";
import { auditActorFrom } from "./audit";
import { can, type Actor } from "./authorization";
import {
  EMAIL_JOB_TYPES,
  type FormattedJob,
  type JobCategory,
  type JobQueueStats,
} from "./constants";

export { type FormattedJob, type JobCategory, type JobQueueStats };

/**
 * Categorizes a physical job and provides a readable display label.
 */
export function categorizeJob(type: string): { category: JobCategory; typeLabel: string } {
  if (
    EMAIL_JOB_TYPES.includes(type as (typeof EMAIL_JOB_TYPES)[number]) ||
    type.includes(".notify") ||
    type.includes(".invitation_send") ||
    type.includes(".password_reset_send")
  ) {
    const labelMap: Record<string, string> = {
      "feedback.notify": "Feedback Notification",
      "identity.password_reset_send": "Password Reset / Invite",
      "assessments.invitation_send": "Assessment Invitation",
      "assessments.notify_hr": "Assessment HR Result",
      "aptitude.invitation_send": "Aptitude Invitation",
      "aptitude.notify_hr": "Aptitude HR Result",
    };
    return {
      category: "email",
      typeLabel: labelMap[type] ?? type,
    };
  }

  if (type.startsWith("attendance.") || type.includes("settle") || type.includes("reminder")) {
    const labelMap: Record<string, string> = {
      "attendance.auto_close": "Stale Day Auto-Close",
      "attendance.settlement_sweep": "Daily Settlement Sweep",
      "attendance.shift_reminders": "Shift Reminder Dispatch",
    };
    return {
      category: "sync",
      typeLabel: labelMap[type] ?? type,
    };
  }

  if (type.includes("purge") || type.includes("clean") || type.includes("prune") || type.includes("sweep")) {
    return {
      category: "maintenance",
      typeLabel: formatTypeToTitle(type),
    };
  }

  return {
    category: "system",
    typeLabel: formatTypeToTitle(type),
  };
}

function formatTypeToTitle(type: string): string {
  return type
    .split(/[._-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Aggregates counts across ALL background jobs in the database.
 */
export async function getJobQueueStats(): Promise<JobQueueStats> {
  const [total, pending, running, succeeded, dead] = await Promise.all([
    prisma.job.count(),
    prisma.job.count({ where: { status: JobStatus.PENDING } }),
    prisma.job.count({ where: { status: JobStatus.RUNNING } }),
    prisma.job.count({ where: { status: JobStatus.SUCCEEDED } }),
    prisma.job.count({ where: { status: JobStatus.DEAD } }),
  ]);

  return { total, pending, running, succeeded, dead };
}

export type ListAllJobsOptions = {
  status?: JobStatus | "ALL";
  type?: string;
  category?: JobCategory | "ALL";
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ListAllJobsResult = {
  jobs: FormattedJob[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  availableTypes: string[];
};

/**
 * Returns paginated, formatted jobs across all background tasks.
 */
export async function listAllJobs(options: ListAllJobsOptions = {}): Promise<ListAllJobsResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));

  const where: Prisma.JobWhereInput = {};

  if (options.status && options.status !== "ALL") {
    where.status = options.status;
  }

  if (options.type && options.type !== "ALL") {
    where.type = options.type;
  }

  if (options.search && options.search.trim() !== "") {
    const term = options.search.trim();
    where.OR = [
      { id: { contains: term, mode: "insensitive" } },
      { type: { contains: term, mode: "insensitive" } },
      { lastError: { contains: term, mode: "insensitive" } },
      { lockedBy: { contains: term, mode: "insensitive" } },
    ];
  }

  const [total, rawJobs, distinctTypes] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.job.findMany({
      select: { type: true },
      distinct: ["type"],
      orderBy: { type: "asc" },
    }),
  ]);

  const jobs: FormattedJob[] = rawJobs.map((j) => {
    const { category, typeLabel } = categorizeJob(j.type);
    return {
      id: j.id,
      type: j.type,
      typeLabel,
      category,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      runAt: j.runAt,
      lastError: j.lastError,
      lockedAt: j.lockedAt,
      lockedBy: j.lockedBy,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      completedAt: j.completedAt,
      payload: (typeof j.payload === "object" && j.payload !== null ? j.payload : {}) as Record<
        string,
        unknown
      >,
    };
  });

  const availableTypes = Array.from(
    new Set([...distinctTypes.map((d) => d.type), ...EMAIL_JOB_TYPES]),
  ).sort();

  return {
    jobs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
    availableTypes,
  };
}

/**
 * Retries any failed, dead, or stalled job by resetting attempts and scheduling for immediate pickup.
 */
export async function retryAnyJob(
  jobId: string,
  actor: Actor,
): Promise<{ success: boolean; error?: string }> {
  if (!can(actor, "jobs:manage")) {
    return { success: false, error: "Unauthorized: jobs:manage permission required" };
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.PENDING,
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
    action: "jobs.retry",
    entityType: "job",
    entityId: jobId,
    after: { status: "PENDING", attempts: 0, runAt: "immediate", type: job.type },
  });

  return { success: true };
}

/**
 * Cancels a pending job, preventing worker execution.
 */
export async function cancelAnyJob(
  jobId: string,
  actor: Actor,
): Promise<{ success: boolean; error?: string }> {
  if (!can(actor, "jobs:manage")) {
    return { success: false, error: "Unauthorized: jobs:manage permission required" };
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status !== JobStatus.PENDING) {
    return { success: false, error: `Cannot cancel job in ${job.status} status` };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.DEAD,
      lastError: `Cancelled by operator (${actor.email})`,
      lockedAt: null,
      lockedBy: null,
      completedAt: new Date(),
    },
  });

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "jobs.cancel",
    entityType: "job",
    entityId: jobId,
    after: { status: "DEAD", reason: "cancelled_by_operator", type: job.type },
  });

  return { success: true };
}
