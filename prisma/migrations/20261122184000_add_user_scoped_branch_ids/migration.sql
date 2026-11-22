-- AlterTable
ALTER TABLE "users" ADD COLUMN "scopedBranchIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
