-- CreateEnum
CREATE TYPE "AppPlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "AppUpdateMode" AS ENUM ('FLEXIBLE', 'REQUIRED');

-- CreateTable
CREATE TABLE "app_releases" (
    "id" TEXT NOT NULL,
    "platform" "AppPlatform" NOT NULL,
    "version" TEXT NOT NULL,
    "updateMode" "AppUpdateMode" NOT NULL DEFAULT 'FLEXIBLE',
    "releaseNotes" TEXT,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_releases_platform_releasedAt_idx" ON "app_releases"("platform", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_releases_platform_version_key" ON "app_releases"("platform", "version");

-- AddForeignKey
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
