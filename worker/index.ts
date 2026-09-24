// Side-effect import, and it must stay first: it populates DATABASE_URL before
// the Prisma client module below is evaluated. See worker/env.ts.
import "./env";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/platform/prisma";
import { claim, jobContextFor, markFailed, markSucceeded, queueDepth, reclaimStuck } from "@/lib/platform/jobs";
import { logger, setBaseFields } from "@/lib/platform/logger";
import {
  autoCloseStaleDays,
  runDailySettlementSweep,
  dispatchUpcomingShiftReminders,
} from "@/lib/modules/attendance/jobs";
import { purgeExpiredPasswordResets } from "@/lib/modules/identity/jobs";
import { purgeSentInvitationJobs } from "@/lib/modules/assessments/jobs";
import { autoSubmitExpiredAttempts, purgeSentInvitationJobs as purgeSentAptitudeInvitationJobs } from "@/lib/modules/aptitude/jobs";
import { notifyJobDead, notifyWorkerError } from "@/lib/platform/slack";
import { purgeOldEmailDeliveries } from "@/lib/platform/email";
import { resolveHandler } from "./registry";

/**
 * Background worker entrypoint.
 *
 * A separate long-running process, deployed from this repository and sharing
 * the same domain modules as the web app (ADR 0001). Vercel's request-scoped
 * functions cannot host it: nothing there outlives a request, and this loop
 * has to.
 *
 * Run with `pnpm worker`.
 *
 * WHY `--conditions=react-server`
 * ------------------------------
 * The domain modules guard themselves with `import "server-only"`, which keeps
 * them out of client bundles. That package resolves to a module that throws on
 * import unless the `react-server` export condition is set — a condition Next
 * sets for us, and a plain Node process does not. Without the flag this worker
 * dies at startup on its first import.
 *
 * The alternative would be dropping `server-only` from everything the worker
 * touches, which trades a real safety guard for a startup flag. The guard's
 * intent is "never ship this to a browser", and a background worker satisfies
 * that, so declaring the condition is honest rather than a workaround.
 *
 * DEPLOYMENT PREREQUISITE
 * -----------------------
 * Feedback notification emails now go through this queue. Until the worker is
 * actually deployed and running, submissions are still recorded correctly but
 * the emails sit in `jobs` unsent. That is recoverable — starting the worker
 * drains the backlog — but it is not silent-safe, so the queue depth is logged
 * on every tick and a backlog is warned about explicitly.
 */

const WORKER_ID = `${process.env.WORKER_NAME ?? "worker"}-${randomUUID().slice(0, 8)}`;

/**
 * ADR 0001: poll interval is a cost parameter, not only a latency one. Neon
 * autosuspends idle compute, and a polling worker keeps it awake permanently,
 * so this should be the longest interval the requirement allows. Nothing
 * currently queued is urgent — an email within a minute is fine.
 */
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 60_000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 5);
/** Must exceed the longest plausible job, or a slow job is reclaimed and run twice. */
const STALE_JOB_MS = Number(process.env.WORKER_STALE_JOB_MS ?? 15 * 60_000);
/** Warn when the oldest pending job has waited longer than this. */
const BACKLOG_WARN_MS = Number(process.env.WORKER_BACKLOG_WARN_MS ?? 10 * 60_000);
/**
 * How often time-driven work runs, as opposed to work triggered by an event.
 *
 * Deliberately far less often than the poll interval. Auto-closing a forgotten
 * clock-out is not urgent — the day already sat open overnight — and every
 * sweep is a query against a database that a polling worker is already keeping
 * awake (ADR 0001).
 */
const PERIODIC_INTERVAL_MS = Number(process.env.WORKER_PERIODIC_INTERVAL_MS ?? 15 * 60_000);

let lastPeriodicRun = 0;
let shuttingDown = false;
/** Set while the loop is sleeping, so a shutdown signal can cut the wait short. */
let wakeUp: (() => void) | null = null;

// Every line from this process carries the worker id, so logs from two
// workers draining the same queue can be told apart.
setBaseFields({ worker: WORKER_ID });

async function runOne(job: Awaited<ReturnType<typeof claim>>[number]): Promise<void> {
  const handler = resolveHandler(job.type);

  if (!handler) {
    // Deliberately a failure rather than a discard: most often this is a job
    // enqueued by a newer deploy than the worker running it, and the retry
    // will succeed once the worker catches up.
    await markFailed(job, new Error(`No handler registered for job type "${job.type}"`));
    logger.warn("unknown job type", { jobId: job.id, type: job.type });
    return;
  }

  const startedAt = Date.now();
  try {
    await handler(job.payload, jobContextFor(job));
    await markSucceeded(job.id);
    logger.info("job succeeded", { jobId: job.id, type: job.type, ms: Date.now() - startedAt });
  } catch (error) {
    const outcome = await markFailed(job, error);
    // A retry is expected noise; a dead job needs someone to look at it.
    const emit = outcome === "dead" ? logger.error : logger.warn;
    emit(outcome === "dead" ? "job died" : "job failed, will retry", {
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      ms: Date.now() - startedAt,
      // Passed as the Error itself: the logger unwraps name, message and
      // stack, which JSON.stringify would otherwise discard entirely.
      error,
    });

    if (outcome === "dead") {
      notifyJobDead({
        id: job.id,
        type: job.type,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        error,
        payload: job.payload,
      }).catch(() => {});
    }
  }
}

/**
 * Work driven by the clock rather than by an event arriving.
 *
 * Kept out of the job queue on purpose: a recurring job has to enqueue itself,
 * which needs deduplication to avoid piling up, and that is more machinery than
 * an interval check deserves. If a periodic task ever needs retries or a
 * visible history, it should become a real job then.
 */
async function runPeriodic(now: number): Promise<void> {
  if (now - lastPeriodicRun < PERIODIC_INTERVAL_MS) return;
  lastPeriodicRun = now;

  // Attendance sweeps
  try {
    const summary = await autoCloseStaleDays(new Date());
    if (summary.closed > 0 || summary.examined > 0) {
      logger.info("auto-close sweep", summary);
    }
  } catch (error) {
    // A failed sweep must not stop the queue being drained.
    logger.error("auto-close sweep failed", { error });
  }

  try {
    const reminderSummary = await dispatchUpcomingShiftReminders(new Date());
    if (reminderSummary.remindersDispatched > 0) {
      logger.info("shift reminders sweep", reminderSummary);
    }
  } catch (error) {
    logger.error("shift reminders sweep failed", { error });
  }

  try {
    const settlementSummary = await runDailySettlementSweep(new Date());
    if (settlementSummary.settled > 0) {
      logger.info("daily settlement sweep", settlementSummary);
    }
  } catch (error) {
    logger.error("daily settlement sweep failed", { error });
  }

  // Expired password reset tokens, and the send jobs whose payloads carry the
  // tokens themselves. Separate try: neither sweep should be able to skip the
  // other by failing.
  try {
    await purgeExpiredPasswordResets(new Date());
  } catch (error) {
    logger.error("password reset purge failed", { error });
  }

  try {
    await purgeSentInvitationJobs(new Date());
  } catch (error) {
    logger.error("invitation send purge failed", { error });
  }

  // Aptitude sweeps: auto-submit expired attempts and purge sent invitation jobs.
  try {
    const summary = await autoSubmitExpiredAttempts(new Date());
    if (summary.submitted > 0) logger.info("aptitude auto-submit sweep", summary);
  } catch (error) {
    logger.error("aptitude auto-submit sweep failed", { error });
  }

  try {
    await purgeSentAptitudeInvitationJobs(new Date());
  } catch (error) {
    logger.error("aptitude invitation send purge failed", { error });
  }

  try {
    await purgeOldEmailDeliveries(new Date());
  } catch (error) {
    logger.error("email delivery purge failed", { error });
  }
}

async function tick(): Promise<void> {
  await runPeriodic(Date.now());

  const reclaimed = await reclaimStuck(STALE_JOB_MS);
  if (reclaimed > 0) logger.warn("reclaimed jobs from a dead worker", { count: reclaimed });

  const jobs = await claim(WORKER_ID, BATCH_SIZE);

  // Sequential on purpose. The batch is small, the jobs are I/O-bound against
  // the same database, and running them one at a time keeps connection use
  // predictable. Parallelism here would be optimising a queue that is not busy.
  for (const job of jobs) {
    if (shuttingDown) break;
    await runOne(job);
  }

  const depth = await queueDepth();
  if (depth.dead > 0) {
    logger.error("dead jobs are waiting for a human", { dead: depth.dead });
  }
  if (depth.oldestPendingAt && Date.now() - depth.oldestPendingAt.getTime() > BACKLOG_WARN_MS) {
    logger.warn("queue is falling behind", {
      pending: depth.pending,
      oldestPendingAt: depth.oldestPendingAt.toISOString(),
    });
  }
  if (jobs.length > 0) {
    logger.info("batch complete", { processed: jobs.length, ...depth });
  }
}

async function main(): Promise<void> {
  logger.info("worker starting", {
    pollIntervalMs: POLL_INTERVAL_MS,
    periodicIntervalMs: PERIODIC_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    // Confirms which database this process is attached to, mirroring the line
    // prisma.config.ts prints for CLI commands. Credentials are never included.
    database: safeDatabaseTarget(),
  });

  while (!shuttingDown) {
    // A failure here is the loop itself breaking — a lost connection, say —
    // not a job failing. Log and keep polling; the next tick may well work.
    await tick().catch((error) => {
      logger.error("tick failed", { error });
    });

    if (shuttingDown) break;
    await sleep(POLL_INTERVAL_MS);
  }

  logger.info("worker stopped");
  await prisma.$disconnect();
}

function safeDatabaseTarget(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return `${url.host}${url.pathname}`;
  } catch {
    return "unknown";
  }
}

/**
 * Interruptible sleep. Cancelling the timer alone would leave the promise
 * pending forever, so shutdown has to resolve it — otherwise the process hangs
 * for a full poll interval and gets SIGKILLed instead of stopping cleanly.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeUp = null;
      resolve();
    }, ms);

    wakeUp = () => {
      clearTimeout(timer);
      wakeUp = null;
      resolve();
    };
  });
}

/**
 * Graceful shutdown. A container being replaced gets a SIGTERM and a short
 * grace period; finishing the current batch means a job is not left half-done
 * and stuck in RUNNING until `reclaimStuck` notices it fifteen minutes later.
 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutdown signal received, finishing current batch", { signal });
    wakeUp?.();
  });
}

main().catch(async (error) => {
  logger.error("worker crashed", { error });
  await notifyWorkerError({
    processName: "basilissa-worker",
    action: "worker process fatal crash",
    error,
  }).catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
