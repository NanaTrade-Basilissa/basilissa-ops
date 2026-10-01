-- AlterTable
ALTER TABLE "announcement_recipients" ADD COLUMN     "ackReminderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ackRemindedAt" TIMESTAMP(3);
