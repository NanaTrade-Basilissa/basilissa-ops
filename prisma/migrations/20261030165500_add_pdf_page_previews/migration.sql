-- AlterTable
ALTER TABLE "hosted_files" ADD COLUMN IF NOT EXISTS "pageCount" INTEGER,
ADD COLUMN IF NOT EXISTS "previewPages" JSONB;
