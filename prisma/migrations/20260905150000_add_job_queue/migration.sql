-- Background job queue.
--
-- Postgres rather than a dedicated broker (see ADR 0002). The claim is a
-- single statement using FOR UPDATE SKIP LOCKED, which lets several workers
-- pull from the same queue without coordinating and without a job being handed
-- out twice — the property that usually motivates reaching for a broker.

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_status_runAt_idx" ON "jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "jobs_status_lockedAt_idx" ON "jobs"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");
