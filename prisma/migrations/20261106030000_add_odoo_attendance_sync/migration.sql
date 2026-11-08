-- CreateEnum
CREATE TYPE "OdooSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "attendance_days"
ADD COLUMN "odooAttendanceId" INTEGER,
ADD COLUMN "odooSyncStatus" "OdooSyncStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "odooSyncedAt" TIMESTAMP(3),
ADD COLUMN "odooSyncedIn" TIMESTAMP(3),
ADD COLUMN "odooSyncedOut" TIMESTAMP(3),
ADD COLUMN "odooSyncError" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_odooAttendanceId_key" ON "attendance_days"("odooAttendanceId");

-- CreateIndex
CREATE INDEX "attendance_days_odooSyncStatus_workDate_idx" ON "attendance_days"("odooSyncStatus", "workDate");
