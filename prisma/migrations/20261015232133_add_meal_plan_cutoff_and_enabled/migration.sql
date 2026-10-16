/*
  Warnings:

  - You are about to drop the column `description` on the `meal_plans` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "meal_plans" DROP COLUMN "description",
ADD COLUMN     "cutoffAt" TIMESTAMP(3),
ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true;
