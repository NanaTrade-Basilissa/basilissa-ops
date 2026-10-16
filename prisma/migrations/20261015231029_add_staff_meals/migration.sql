-- CreateEnum
CREATE TYPE "MealDecision" AS ENUM ('EATING', 'NOT_EATING');

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dishName" TEXT NOT NULL,
    "description" TEXT,
    "cutoffHour" INTEGER NOT NULL DEFAULT 20,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_selections" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "decision" "MealDecision" NOT NULL DEFAULT 'NOT_EATING',
    "claimedAt" TIMESTAMP(3),
    "claimVerifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_selections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_plans_branchId_date_idx" ON "meal_plans"("branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_branchId_date_key" ON "meal_plans"("branchId", "date");

-- CreateIndex
CREATE INDEX "meal_selections_employeeId_idx" ON "meal_selections"("employeeId");

-- CreateIndex
CREATE INDEX "meal_selections_mealPlanId_decision_idx" ON "meal_selections"("mealPlanId", "decision");

-- CreateIndex
CREATE INDEX "meal_selections_mealPlanId_claimedAt_idx" ON "meal_selections"("mealPlanId", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "meal_selections_mealPlanId_employeeId_key" ON "meal_selections"("mealPlanId", "employeeId");

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
