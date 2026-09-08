-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "assessments_deletedAt_idx" ON "assessments"("deletedAt");
