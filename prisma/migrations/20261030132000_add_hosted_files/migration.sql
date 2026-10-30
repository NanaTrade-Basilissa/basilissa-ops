-- CreateEnum
CREATE TYPE "HostedFileDisplayMode" AS ENUM ('IN_APP_VIEWER', 'DIRECT_RAW');

-- CreateEnum
CREATE TYPE "LowResPreviewStatus" AS ENUM ('NONE', 'PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "hosted_files" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "slug" TEXT,
    "displayMode" "HostedFileDisplayMode" NOT NULL DEFAULT 'IN_APP_VIEWER',
    "generateLowRes" BOOLEAN NOT NULL DEFAULT true,
    "lowResKey" TEXT,
    "lowResUrl" TEXT,
    "lowResSize" INTEGER,
    "lowResStatus" "LowResPreviewStatus" NOT NULL DEFAULT 'NONE',
    "uploadedById" TEXT NOT NULL,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hosted_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hosted_files_slug_key" ON "hosted_files"("slug");

-- CreateIndex
CREATE INDEX "hosted_files_uploadedById_idx" ON "hosted_files"("uploadedById");

-- CreateIndex
CREATE INDEX "hosted_files_slug_idx" ON "hosted_files"("slug");

-- CreateIndex
CREATE INDEX "hosted_files_isPublic_idx" ON "hosted_files"("isPublic");

-- AddForeignKey
ALTER TABLE "hosted_files" ADD CONSTRAINT "hosted_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
