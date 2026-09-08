-- The day projection, plus manual-entry reason codes on event evidence.
--
-- attendance_days is deliberately NOT append-only, unlike attendance_events.
-- Being rewritable is the whole point of a projection: it is recomputed from
-- the events, the policy in effect on that date and the schedule that applied.
-- What must never change is the evidence underneath it.
-- CreateEnum
CREATE TYPE "ManualEntryReason" AS ENUM ('DEVICE_OFFLINE', 'PHONE_UNAVAILABLE', 'NEW_EMPLOYEE_NOT_ENROLLED', 'FORGOT_TO_PUNCH', 'SYSTEM_OUTAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "DayStatus" AS ENUM ('PENDING', 'SETTLED', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "event_evidence" ADD COLUMN     "manualReasonCode" "ManualEntryReason",
ADD COLUMN     "manualReasonText" TEXT;

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "status" "DayStatus" NOT NULL,
    "shiftIdSnapshot" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "actualIn" TIMESTAMP(3),
    "actualOut" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "grossMinutes" INTEGER NOT NULL DEFAULT 0,
    "netWorkedMinutes" INTEGER NOT NULL DEFAULT 0,
    "regularMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "payableOvertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyDepartureMinutes" INTEGER NOT NULL DEFAULT 0,
    "lowestIdentityAssurance" "IdentityAssurance",
    "lowestLocationAssurance" "LocationAssurance",
    "lowestTimeAssurance" "TimeAssurance",
    "flags" TEXT[],
    "policySnapshot" JSONB,
    "settledAt" TIMESTAMP(3),
    "projectionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_days_branchId_workDate_idx" ON "attendance_days"("branchId", "workDate");

-- CreateIndex
CREATE INDEX "attendance_days_status_workDate_idx" ON "attendance_days"("status", "workDate");

-- CreateIndex
CREATE INDEX "attendance_days_lowestIdentityAssurance_idx" ON "attendance_days"("lowestIdentityAssurance");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_employeeId_workDate_key" ON "attendance_days"("employeeId", "workDate");

