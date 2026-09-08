-- Attendance corrections.
--
-- Append-only, reusing append_only_guard() like attendance_events and
-- audit_logs. A correction changes what attendance MEANS, never what was
-- recorded: adjusting a time voids the original event and inserts a
-- replacement, so both the punch the terminal produced and the value a manager
-- decided stay permanently visible and separately attributed.
-- CreateEnum
CREATE TYPE "CorrectionOperation" AS ENUM ('ADJUST_TIME', 'INSERT_EVENT', 'VOID_EVENT', 'REASSIGN_BRANCH');

-- CreateEnum
CREATE TYPE "CorrectionReason" AS ENUM ('DEVICE_CLOCK_WRONG', 'WRONG_EMPLOYEE', 'DUPLICATE_PUNCH', 'FORGOT_TO_PUNCH', 'DISPUTE_RESOLVED', 'OTHER');

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "operation" "CorrectionOperation" NOT NULL,
    "targetEventId" TEXT,
    "replacementEventId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reasonCode" "CorrectionReason" NOT NULL,
    "reasonText" TEXT NOT NULL,
    "correctedBy" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_corrections_employeeId_workDate_idx" ON "attendance_corrections"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "attendance_corrections_targetEventId_idx" ON "attendance_corrections"("targetEventId");

-- CreateIndex
CREATE INDEX "attendance_corrections_correctedBy_createdAt_idx" ON "attendance_corrections"("correctedBy", "createdAt");


-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
-- Deletion is forbidden outright. Updates are not, because approval genuinely
-- happens after the fact — but only the approval fields may move. Without the
-- column check, "append-only" would still allow rewriting the reason a
-- correction was made, which is the part a dispute actually turns on.

CREATE TRIGGER "attendance_corrections_no_delete"
    BEFORE DELETE ON "attendance_corrections"
    FOR EACH ROW EXECUTE FUNCTION append_only_guard();

CREATE OR REPLACE FUNCTION attendance_corrections_content_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF  NEW."employeeId"         IS DISTINCT FROM OLD."employeeId"
     OR NEW."workDate"           IS DISTINCT FROM OLD."workDate"
     OR NEW."operation"          IS DISTINCT FROM OLD."operation"
     OR NEW."targetEventId"      IS DISTINCT FROM OLD."targetEventId"
     OR NEW."replacementEventId" IS DISTINCT FROM OLD."replacementEventId"
     OR NEW."before"             IS DISTINCT FROM OLD."before"
     OR NEW."after"              IS DISTINCT FROM OLD."after"
     OR NEW."reasonCode"         IS DISTINCT FROM OLD."reasonCode"
     OR NEW."reasonText"         IS DISTINCT FROM OLD."reasonText"
     OR NEW."correctedBy"        IS DISTINCT FROM OLD."correctedBy"
     OR NEW."createdAt"          IS DISTINCT FROM OLD."createdAt"
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'restrict_violation',
                MESSAGE = 'attendance_corrections content is immutable; only approval fields may change',
                HINT    = 'Record a further correction instead of editing this one.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attendance_corrections_content_immutable"
    BEFORE UPDATE ON "attendance_corrections"
    FOR EACH ROW EXECUTE FUNCTION attendance_corrections_content_immutable();
