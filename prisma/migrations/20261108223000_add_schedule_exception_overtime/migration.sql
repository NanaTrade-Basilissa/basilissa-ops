-- AlterEnum
ALTER TYPE "ScheduleExceptionType" ADD VALUE 'OVERTIME';

-- AlterTable
ALTER TABLE "schedule_exceptions" ADD COLUMN "overtimeMinutes" INTEGER;
