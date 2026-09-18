-- AlterTable
ALTER TABLE "aptitude_sections" ADD COLUMN "timeLimitMinutes" INTEGER;

-- AlterTable
ALTER TABLE "aptitude_attempts" ADD COLUMN "currentSectionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sectionStartedAt" TIMESTAMP(3);
