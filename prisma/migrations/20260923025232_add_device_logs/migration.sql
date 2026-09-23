-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "device_logs" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_logs_serialNumber_receivedAt_idx" ON "device_logs"("serialNumber", "receivedAt");
