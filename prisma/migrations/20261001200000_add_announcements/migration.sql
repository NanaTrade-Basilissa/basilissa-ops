-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'BRANCHES', 'PEOPLE');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'SENT', 'FAILED', 'UNREACHABLE');

-- CreateEnum
CREATE TYPE "BannerClearReason" AS ENUM ('EXPIRED', 'MANUAL', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ANNOUNCEMENT', 'LEAVE_DECISION', 'SHIFT_REMINDER');

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "bannerExpiresAt" TIMESTAMP(3),
    "bannerClearedAt" TIMESTAMP(3),
    "bannerClearedBy" TEXT,
    "bannerClearReason" "BannerClearReason",
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "audienceKind" "AnnouncementAudience" NOT NULL,
    "audienceSpec" JSONB NOT NULL DEFAULT '{}',
    "sendPush" BOOLEAN NOT NULL DEFAULT false,
    "sendSms" BOOLEAN NOT NULL DEFAULT false,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_recipients" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "pushStatus" "DeliveryStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "pushError" TEXT,
    "pushSentAt" TIMESTAMP(3),
    "smsStatus" "DeliveryStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "smsError" TEXT,
    "smsSentAt" TIMESTAMP(3),
    "emailStatus" "DeliveryStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "emailError" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "announcement_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "announcementId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_createdAt_idx" ON "announcements"("createdAt");

-- CreateIndex
CREATE INDEX "announcement_recipients_employeeId_idx" ON "announcement_recipients"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_recipients_announcementId_employeeId_key" ON "announcement_recipients"("announcementId", "employeeId");

-- CreateIndex
CREATE INDEX "notifications_employeeId_createdAt_idx" ON "notifications"("employeeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_employeeId_readAt_idx" ON "notifications"("employeeId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_employeeId_announcementId_key" ON "notifications"("employeeId", "announcementId");

-- AddForeignKey
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one urgent banner is active at a time.
--
-- Written by hand: Prisma cannot express a partial or expression index. The
-- index is on a constant, so every active urgent row collides with every other;
-- the WHERE clause is what limits it to the active ones. A partial index cannot
-- mention now(), so an expired banner is cleared by a sweep (bannerClearedAt)
-- rather than detected by comparison. See the Announcement model.
CREATE UNIQUE INDEX "announcements_one_active_urgent"
  ON "announcements" ((true))
  WHERE "isUrgent" AND "bannerClearedAt" IS NULL;
