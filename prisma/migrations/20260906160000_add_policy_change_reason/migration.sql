-- Record WHY an attendance policy version was put in effect, not just who.
--
-- Grace periods and overtime thresholds are employment terms. "The overtime
-- threshold moved from 10 to 30 minutes on 4 March, by HR" does not answer the
-- question anyone actually asks a year later, which is why.
--
-- Nullable, and deliberately not backfilled: the seeded defaults and any
-- version written before today genuinely have no recorded reason, and
-- inventing one ("migrated") would make an absence look like an answer. The
-- application requires a reason on every new version from here.

-- AlterTable
ALTER TABLE "attendance_policies" ADD COLUMN     "changeReason" TEXT;
