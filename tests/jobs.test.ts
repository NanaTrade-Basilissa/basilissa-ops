import { describe, expect, it, vi, beforeEach } from "vitest";

type JobRow = {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  completedAt: Date | null;
};

const store = vi.hoisted(() => ({ rows: new Map<string, JobRow>(), seq: 0 }));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    job: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.seq += 1;
        const id = `job_${store.seq}`;
        store.rows.set(id, {
          id,
          type: data.type as string,
          payload: data.payload ?? {},
          status: "PENDING",
          runAt: (data.runAt as Date) ?? new Date(),
          attempts: 0,
          maxAttempts: (data.maxAttempts as number) ?? 5,
          lastError: null,
          lockedAt: null,
          lockedBy: null,
          completedAt: null,
        });
        return { id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.rows.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, never>; data: Record<string, unknown> }) => {
        const w = where as unknown as { status: string; lockedAt?: { lt: Date } };
        let count = 0;
        for (const row of store.rows.values()) {
          if (row.status !== w.status) continue;
          if (w.lockedAt && !(row.lockedAt && row.lockedAt < w.lockedAt.lt)) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
      count: async ({ where }: { where: { status: string } }) =>
        [...store.rows.values()].filter((r) => r.status === where.status).length,
      findFirst: async ({ where }: { where: { status: string } }) =>
        [...store.rows.values()]
          .filter((r) => r.status === where.status)
          .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())[0] ?? null,
    },
    // claim() is raw SQL; model it as the single atomic statement it is.
    $queryRaw: async (_s: TemplateStringsArray, ...values: unknown[]) => {
      const [workerId, limit] = values as [string, number];
      const now = Date.now();
      const eligible = [...store.rows.values()]
        .filter((r) => r.status === "PENDING" && r.runAt.getTime() <= now)
        .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
        .slice(0, limit);

      for (const row of eligible) {
        row.status = "RUNNING";
        row.lockedAt = new Date();
        row.lockedBy = workerId;
        row.attempts += 1;
      }

      return eligible.map((r) => ({
        id: r.id,
        type: r.type,
        payload: r.payload,
        attempts: r.attempts,
        maxAttempts: r.maxAttempts,
      }));
    },
  },
}));

const {
  enqueue,
  claim,
  markSucceeded,
  markFailed,
  reclaimStuck,
  queueDepth,
  backoffMs,
  PermanentJobError,
  jobContextFor,
} = await import("@/lib/platform/jobs");

beforeEach(() => {
  store.rows.clear();
  store.seq = 0;
});

describe("enqueue and claim", () => {
  it("claims an eligible job and increments its attempt count", async () => {
    await enqueue("feedback.notify", { submissionId: "sub_1" });

    const claimed = await claim("worker-a");
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ type: "feedback.notify", attempts: 1 });
    expect(claimed[0].payload).toEqual({ submissionId: "sub_1" });
  });

  // The property that makes a database queue viable: a claimed job is no
  // longer visible to anyone else. Without it two workers send the same email.
  it("does not hand the same job to a second worker", async () => {
    await enqueue("feedback.notify", { submissionId: "sub_1" });

    const first = await claim("worker-a");
    const second = await claim("worker-b");

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("leaves jobs scheduled for the future alone", async () => {
    await enqueue("later", {}, { runAt: new Date(Date.now() + 60_000) });
    expect(await claim("worker-a")).toHaveLength(0);
  });

  it("respects the batch limit and takes the oldest first", async () => {
    await enqueue("a", {}, { runAt: new Date(Date.now() - 3000) });
    await enqueue("b", {}, { runAt: new Date(Date.now() - 2000) });
    await enqueue("c", {}, { runAt: new Date(Date.now() - 1000) });

    const claimed = await claim("worker-a", 2);
    expect(claimed.map((j) => j.type)).toEqual(["a", "b"]);
  });
});

describe("completion and failure", () => {
  it("marks a job succeeded and releases the lock", async () => {
    await enqueue("feedback.notify");
    const [job] = await claim("worker-a");

    await markSucceeded(job.id);

    const row = store.rows.get(job.id)!;
    expect(row.status).toBe("SUCCEEDED");
    expect(row.lockedBy).toBeNull();
    expect(row.completedAt).not.toBeNull();
  });

  it("reschedules a failure into the future and records why", async () => {
    await enqueue("flaky", {}, { maxAttempts: 3 });
    const [job] = await claim("worker-a");

    const outcome = await markFailed(job, new Error("upstream timeout"));

    expect(outcome).toBe("retry");
    const row = store.rows.get(job.id)!;
    expect(row.status).toBe("PENDING");
    expect(row.lastError).toContain("upstream timeout");
    expect(row.lockedBy).toBeNull();
  });

  it("declares a job DEAD once attempts are exhausted, and keeps the row", async () => {
    await enqueue("doomed", {}, { maxAttempts: 1 });
    const [job] = await claim("worker-a");

    expect(await markFailed(job, new Error("nope"))).toBe("dead");

    const row = store.rows.get(job.id)!;
    expect(row.status).toBe("DEAD");
    // Evidence that something needs a human. Deleting it would hide that.
    expect(store.rows.has(job.id)).toBe(true);
  });

  /**
   * Retrying is the right default when the reason is unknown, and the wrong
   * one when the handler already knows the request is impossible. Five
   * identical rejections only delay the moment somebody looks.
   */
  it("dies immediately on a PermanentJobError, with attempts to spare", async () => {
    await enqueue("hopeless", {}, { maxAttempts: 5 });
    const [job] = await claim("worker-a");

    expect(await markFailed(job, new PermanentJobError("address is not an address"))).toBe("dead");

    const row = store.rows.get(job.id)!;
    expect(row.status).toBe("DEAD");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("address is not an address");
    // Named in the record, so the row explains why it never retried.
    expect(row.lastError).toContain("PermanentJobError");
  });

  it("still retries an ordinary error with attempts remaining", async () => {
    await enqueue("flaky", {}, { maxAttempts: 5 });
    const [job] = await claim("worker-a");

    expect(await markFailed(job, new Error("provider had a bad minute"))).toBe("retry");
    expect(store.rows.get(job.id)!.status).toBe("PENDING");
  });

  it("keeps the dead row as evidence, exactly as an exhausted job would", async () => {
    await enqueue("hopeless", {}, { maxAttempts: 5 });
    const [job] = await claim("worker-a");

    await markFailed(job, new PermanentJobError("rejected"));

    expect(store.rows.has(job.id)).toBe(true);
    expect(store.rows.get(job.id)!.completedAt).not.toBeNull();
  });

  it("truncates a very long error rather than failing to record it", async () => {
    await enqueue("verbose", {}, { maxAttempts: 1 });
    const [job] = await claim("worker-a");

    await markFailed(job, new Error("x".repeat(5000)));

    expect(store.rows.get(job.id)!.lastError!.length).toBeLessThanOrEqual(2000);
  });
});

describe("backoffMs", () => {
  it("grows with attempts and stays within the cap", () => {
    for (let attempt = 1; attempt <= 12; attempt++) {
      const delay = backoffMs(attempt, 1000, 60_000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(60_000);
    }
  });

  // Full jitter, not a fixed doubling. Jobs that failed together during an
  // outage must not all retry at the same instant the moment it looks
  // recovered — that is how a brief outage becomes a long one.
  it("is jittered, so a batch that failed together does not retry together", () => {
    const delays = new Set(Array.from({ length: 50 }, () => backoffMs(5, 1000, 600_000)));
    expect(delays.size).toBeGreaterThan(1);
  });
});

describe("reclaimStuck", () => {
  it("returns jobs abandoned by a dead worker", async () => {
    await enqueue("orphan");
    const [job] = await claim("worker-a");
    // Worker died here: the row stays RUNNING with nothing to release it.
    store.rows.get(job.id)!.lockedAt = new Date(Date.now() - 30 * 60_000);

    expect(await reclaimStuck(15 * 60_000)).toBe(1);
    expect(store.rows.get(job.id)!.status).toBe("PENDING");
  });

  it("leaves a job that is merely still running", async () => {
    await enqueue("slow");
    await claim("worker-a");

    expect(await reclaimStuck(15 * 60_000)).toBe(0);
  });
});

describe("queueDepth", () => {
  it("counts by status and reports the oldest pending job", async () => {
    await enqueue("a", {}, { runAt: new Date(Date.now() - 5000) });
    await enqueue("b");
    const [claimed] = await claim("worker-a", 1);
    await markSucceeded(claimed.id);

    const depth = await queueDepth();
    expect(depth.pending).toBe(1);
    expect(depth.dead).toBe(0);
    expect(depth.oldestPendingAt).not.toBeNull();
  });
});

describe("the context a handler is given", () => {
  it("is a retry after a failed attempt, or when a person re-queued a failed job", () => {
    expect(jobContextFor({ id: "j", attempts: 1, lastError: null })).toEqual({ jobId: "j", retrying: false });
    expect(jobContextFor({ id: "j", attempts: 2, lastError: "Error: timeout" }).retrying).toBe(true);
    // A manual retry resets attempts to 0 but keeps the error.
    expect(jobContextFor({ id: "j", attempts: 1, lastError: "Error: timeout" }).retrying).toBe(true);
  });
});
