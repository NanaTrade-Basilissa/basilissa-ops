-- CreateEnum
CREATE TYPE "BranchSchedulingMode" AS ENUM ('ROTATING_ROTA', 'FIXED_SCHEDULE');

-- AlterTable
ALTER TABLE "branches"
ADD COLUMN "schedulingMode" "BranchSchedulingMode" NOT NULL DEFAULT 'ROTATING_ROTA',
ADD COLUMN "fixedShiftStartMinute" INTEGER,
ADD COLUMN "fixedShiftEndMinute" INTEGER,
ADD COLUMN "fixedWorkDays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN "fixedOffOnPublicHolidays" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "shifts"
ADD COLUMN "deletedAt" TIMESTAMP(3);
