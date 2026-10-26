-- CreateEnum
CREATE TYPE "LeaveCycleStatus" AS ENUM ('UPCOMING', 'OPEN', 'AUTO_SCHEDULING', 'FINALIZED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "probationEndDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "attachmentKey" TEXT,
ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "cycleId" TEXT,
ADD COLUMN     "isAutoScheduled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isoWeek" TEXT;

-- CreateTable
CREATE TABLE "leave_cycles" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT,
    "windowStart" DATE NOT NULL,
    "windowEnd" DATE NOT NULL,
    "status" "LeaveCycleStatus" NOT NULL DEFAULT 'UPCOMING',
    "blackoutWeeks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autoScheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_allocations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "entitledDays" INTEGER NOT NULL DEFAULT 15,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "autoAssigned" BOOLEAN NOT NULL DEFAULT false,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "probationEndDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_leave_quotas" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "jobCategory" TEXT NOT NULL,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_leave_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_cycles_year_key" ON "leave_cycles"("year");

-- CreateIndex
CREATE INDEX "leave_allocations_cycleId_isEligible_idx" ON "leave_allocations"("cycleId", "isEligible");

-- CreateIndex
CREATE UNIQUE INDEX "leave_allocations_employeeId_cycleId_key" ON "leave_allocations"("employeeId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_leave_quotas_branchId_jobCategory_key" ON "branch_leave_quotas"("branchId", "jobCategory");

-- CreateIndex
CREATE INDEX "leave_requests_cycleId_status_idx" ON "leave_requests"("cycleId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_branchId_isoWeek_status_idx" ON "leave_requests"("branchId", "isoWeek", "status");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "leave_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_allocations" ADD CONSTRAINT "leave_allocations_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "leave_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_leave_quotas" ADD CONSTRAINT "branch_leave_quotas_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
