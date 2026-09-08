-- Attendance events: the raw evidence every payroll figure is derived from.
--
-- Append-only, enforced by the same triggers audit_logs uses. The
-- append_only_guard() function was written generically in
-- 20260905140000_add_audit_log precisely so this table could reuse it.
--
-- There is no status column. "Superseded" and "voided" are derived rather than
-- stored, because storing them would mean updating an existing row and the
-- triggers below reject that. Supersession is a pointer written on the row
-- being inserted; voiding comes from attendance corrections.
-- CreateEnum
CREATE TYPE "AttendanceDirection" AS ENUM ('IN', 'OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('MOBILE_APP', 'FINGERPRINT', 'MANAGER_MANUAL', 'SYSTEM_AUTO_CLOSE');

-- CreateEnum
CREATE TYPE "IdentityAssurance" AS ENUM ('NONE', 'ASSERTED', 'DEVICE_BOUND', 'BIOMETRIC');

-- CreateEnum
CREATE TYPE "LocationAssurance" AS ENUM ('NONE', 'ASSERTED', 'GPS_VERIFIED', 'PHYSICALLY_PRESENT');

-- CreateEnum
CREATE TYPE "TimeAssurance" AS ENUM ('SERVER', 'DEVICE_SYNCED', 'DEVICE_UNVERIFIED', 'HUMAN_ASSERTED');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('VERIFIED', 'PARTIAL', 'UNVERIFIED', 'FAILED_FALLBACK');

-- CreateEnum
CREATE TYPE "GeofenceDecision" AS ENUM ('INSIDE', 'OUTSIDE', 'AMBIGUOUS', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "direction" "AttendanceDirection" NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "providerRef" TEXT,
    "deviceId" TEXT,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceReportedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockSkewMs" INTEGER,
    "directionHint" "AttendanceDirection",
    "hintMismatch" BOOLEAN NOT NULL DEFAULT false,
    "identityAssurance" "IdentityAssurance" NOT NULL,
    "locationAssurance" "LocationAssurance" NOT NULL,
    "timeAssurance" "TimeAssurance" NOT NULL,
    "verificationOutcome" "VerificationOutcome" NOT NULL,
    "supersedesEventId" TEXT,
    "supersededByEventId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "flags" TEXT[],

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_evidence" (
    "eventId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMeters" INTEGER,
    "distanceMeters" INTEGER,
    "geofenceDecision" "GeofenceDecision" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "geofenceSnapshot" JSONB,
    "faceScore" DOUBLE PRECISION,
    "faceThreshold" DOUBLE PRECISION,
    "faceModelVersion" TEXT,
    "livenessResult" TEXT,
    "attestationVerdict" TEXT,
    "isMockLocation" BOOLEAN,
    "capturedFrameKey" TEXT,
    "retentionExpiresAt" TIMESTAMP(3),
    "deviceRawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_evidence_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "quarantined_events" (
    "id" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "deviceId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAs" TEXT,

    CONSTRAINT "quarantined_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_events_employeeId_occurredAt_idx" ON "attendance_events"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "attendance_events_branchId_occurredAt_idx" ON "attendance_events"("branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "attendance_events_deviceId_occurredAt_idx" ON "attendance_events"("deviceId", "occurredAt");

-- CreateIndex
CREATE INDEX "attendance_events_supersedesEventId_idx" ON "attendance_events"("supersedesEventId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_providerType_idempotencyKey_key" ON "attendance_events"("providerType", "idempotencyKey");

-- CreateIndex
CREATE INDEX "event_evidence_retentionExpiresAt_idx" ON "event_evidence"("retentionExpiresAt");

-- CreateIndex
CREATE INDEX "quarantined_events_resolvedAt_receivedAt_idx" ON "quarantined_events"("resolvedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "quarantined_events_providerType_receivedAt_idx" ON "quarantined_events"("providerType", "receivedAt");

-- AddForeignKey
ALTER TABLE "event_evidence" ADD CONSTRAINT "event_evidence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "attendance_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
CREATE TRIGGER "attendance_events_no_update"
    BEFORE UPDATE ON "attendance_events"
    FOR EACH ROW EXECUTE FUNCTION append_only_guard();

CREATE TRIGGER "attendance_events_no_delete"
    BEFORE DELETE ON "attendance_events"
    FOR EACH ROW EXECUTE FUNCTION append_only_guard();
