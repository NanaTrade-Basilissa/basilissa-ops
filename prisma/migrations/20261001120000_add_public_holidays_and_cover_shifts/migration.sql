-- CreateEnum
CREATE TYPE "HolidaySource" AS ENUM ('CALENDAR', 'MANUAL');

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "offOnPublicHolidays" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "schedule_exceptions" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "source" "HolidaySource" NOT NULL DEFAULT 'MANUAL',
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_date_key" ON "public_holidays"("date");

-- CreateIndex
CREATE INDEX "schedule_exceptions_branchId_date_idx" ON "schedule_exceptions"("branchId", "date");

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
