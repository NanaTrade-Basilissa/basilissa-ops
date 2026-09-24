import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";

/**
 * Postgres-backed job queue.
 *
 * This file owns the mechanism only — claiming, retrying, giving up. It has no
 * idea what any job *does*, which is what keeps it in `lib/platform`: the
 * handler registry lives in `worker/registry.ts`, where it may import from
 * domain modules. Inverting that would make the queue depend on every module
 * that uses it.
 *
 * WHY NOT A BROKER
 * ----------------
 * Beyond ADR 0002's general answer: `enqueue()` accepts a transaction client,
 * so a job can be created in the same transaction as the change that causes
 * it. Work is then never scheduled for a change that rolled back, and never
 * lost for one that committed. An external broker cannot participate in a
 * Postgres transaction, so it can only offer "probably both" — which, for
 * anything touching attendance, is not good enough.
 */

export type EnqueueOptions = {
  /** Delay before the job becomes eligible. Default: immediately. */
  runAt?: Date;
  /** Attempts before the job is declared DEAD. Default: 5. */
  maxAttempts?: number;
};

type Writer = Pick<typeof prisma, "job"> | Prisma.TransactionClient;

/**
 * Schedules a job.
 *
 * Pass `tx` whenever the job is a consequence of a database change, which is
 * almost always.
 */
export async function enqueue(
  type: string,
  payload: Prisma.InputJsonValue = {},
  options: EnqueueOptions = {},
  tx?: Writer,
): Promise<string> {
  const client = tx ?? prisma;
  const job = await client.job.create({
    data: {
      type,
      payload,
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 5,
    },
    select: { id: true },
  });
  return job.id;
}

export type ClaimedJob = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  /** From the previous attempt. Kept when a person retries a DEAD job. */
  lastError: string | null;
};

/**
 * Atomically claims up to `limit` eligible jobs for this worker.
 *
 * One statement, deliberately. `FOR UPDATE SKIP LOCKED` lets several workers
 * pull from the same queue concurrently: rows another transaction already
 * holds are skipped rather than waited on, so workers never block each other
 * and a job is never handed to two of them. A read-then-update would race, and
 * the race would surface as duplicate work — duplicate emails now, duplicate
 * payroll sync later.
 */
export async function claim(workerId: string, limit = 5): Promise<ClaimedJob[]> {
  return prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "jobs" SET
      "status"    = 'RUNNING',
      "lockedAt"  = NOW(),
      "lockedBy"  = ${workerId},
      "attempts"  = "attempts" + 1,
      "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "jobs"
      WHERE "status" = 'PENDING' AND "runAt" <= NOW()
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts", "lastError"
  `;
}

export async function markSucceeded(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

/** Full jitter: `random(0, base * 2^n)`, capped. */
export function backoffMs(attempts: number, baseMs = 10_000, capMs = 60 * 60_000): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempts - 1));
  return Math.floor(Math.random() * ceiling);
}

/**
 * Thrown by a handler when retrying cannot possibly help.
 *
 * The queue's default is to retry, which is right when the reason for failure
 * is unknown — a lost connection, a provider having a bad minute. It is wrong
 * when the job is asking for something impossible: a malformed address will be
 * just as malformed in an hour, and five attempts only delay the moment
 * somebody notices.
 *
 * Dead-letters immediately rather than discarding. A job nobody can complete
 * is exactly the kind that needs a person, and deleting it hides that.
 */
/**
 * What the worker tells a handler about the job it is running. `jobId` is
 * stable across retries, which makes it the idempotency key for anything a
 * handler must not repeat: see `emailOptionsForJob`. Optional in handler
 * signatures so a handler can still be called directly (tests, scripts), where
 * it simply has no key.
 *
 * `retrying` is true when an earlier attempt failed, including one a person
 * re-queued from the email queue (which resets `attempts` but keeps
 * `lastError`). A failed attempt may still have done its work, a timed-out
 * email being the known case, so a retry is when to check first.
 */
export type JobContext = { jobId: string; retrying: boolean };

export function jobContextFor(job: Pick<ClaimedJob, "id" | "attempts" | "lastError">): JobContext {
  return { jobId: job.id, retrying: job.attempts > 1 || job.lastError !== null };
}

export class PermanentJobError extends Error {
  override readonly name = "PermanentJobError";

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Records a failed attempt: reschedules with backoff, or declares the job DEAD
 * once its attempts are spent.
 *
 * Backoff is jittered rather than a fixed doubling. Without jitter, a batch of
 * jobs that failed together retries together — so an outage that knocked them
 * all down produces a synchronised stampede the moment it looks recovered,
 * which is how a brief outage becomes a long one.
 *
 * DEAD jobs are kept. A dead job is evidence that something needs a person,
 * and deleting it only hides that.
 *
 * A `PermanentJobError` skips the remaining attempts and dies now — see its
 * own note for why retrying an impossible job is worse than not.
 */
export async function markFailed(job: ClaimedJob, error: unknown): Promise<"retry" | "dead"> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // A handler that knows retrying is pointless says so, and is believed. The
  // remaining attempts would each fail identically.
  const exhausted = error instanceof PermanentJobError || job.attempts >= job.maxAttempts;

  await prisma.job.update({
    where: { id: job.id },
    data: exhausted
      ? {
          status: "DEAD",
          lastError: message.slice(0, 2000),
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        }
      : {
          status: "PENDING",
          lastError: message.slice(0, 2000),
          runAt: new Date(Date.now() + backoffMs(job.attempts)),
          lockedAt: null,
          lockedBy: null,
        },
  });

  return exhausted ? "dead" : "retry";
}

/**
 * Returns jobs stuck in RUNNING to the queue.
 *
 * A worker that is killed mid-job — a deploy, an OOM, a lost container —
 * leaves its claim behind with nothing to release it. Without this the job
 * simply stops existing as far as the queue is concerned, which is the quiet
 * failure mode of every hand-rolled queue.
 *
 * `staleAfterMs` must exceed the longest plausible job duration, or a slow job
 * gets reclaimed and run twice.
 */
export async function reclaimStuck(staleAfterMs = 15 * 60_000): Promise<number> {
  const { count } = await prisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - staleAfterMs) } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });
  return count;
}

export type QueueDepth = { pending: number; running: number; dead: number; oldestPendingAt: Date | null };

/** Queue health, for logging and later alerting. */
export async function queueDepth(): Promise<QueueDepth> {
  const [pending, running, dead, oldest] = await Promise.all([
    prisma.job.count({ where: { status: "PENDING" } }),
    prisma.job.count({ where: { status: "RUNNING" } }),
    prisma.job.count({ where: { status: "DEAD" } }),
    prisma.job.findFirst({
      where: { status: "PENDING" },
      orderBy: { runAt: "asc" },
      select: { runAt: true },
    }),
  ]);

  return { pending, running, dead, oldestPendingAt: oldest?.runAt ?? null };
}
