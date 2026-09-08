-- Attendance policy: the rules attendance is calculated under.
--
-- Effective-dated and never updated in place. AttendanceDay is a pure
-- projection rebuildable from events, so a single mutable settings row would
-- mean changing a threshold today silently recalculates last month under
-- today's rules. A change closes the current row and inserts a new one.
-- CreateEnum
CREATE TYPE "BreakPolicy" AS ENUM ('EXPLICIT_PUNCH', 'AUTO_DEDUCT');

-- CreateTable
CREATE TABLE "attendance_policies" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "graceInMinutes" INTEGER NOT NULL DEFAULT 5,
    "graceOutMinutes" INTEGER NOT NULL DEFAULT 5,
    "overtimeThresholdMinutes" INTEGER NOT NULL DEFAULT 10,
    "breakPolicy" "BreakPolicy" NOT NULL DEFAULT 'EXPLICIT_PUNCH',
    "autoDeductMinutes" INTEGER NOT NULL DEFAULT 30,
    "autoDeductAfterMinutes" INTEGER NOT NULL DEFAULT 300,
    "roundingMinutes" INTEGER NOT NULL DEFAULT 0,
    "autoCloseGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "dedupWindowMinutes" INTEGER NOT NULL DEFAULT 5,
    "maxManualEntryDays" INTEGER NOT NULL DEFAULT 7,
    "isProvisional" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_policies_branchId_validFrom_idx" ON "attendance_policies"("branchId", "validFrom");

-- CreateIndex
CREATE INDEX "attendance_policies_validFrom_idx" ON "attendance_policies"("validFrom");

