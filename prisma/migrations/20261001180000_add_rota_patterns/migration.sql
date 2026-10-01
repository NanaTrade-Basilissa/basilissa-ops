-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "autoRota" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "shift_patterns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_pattern_days" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "shiftId" TEXT,

    CONSTRAINT "shift_pattern_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_pattern_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "anchorDate" DATE NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_pattern_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_patterns_branchId_isActive_idx" ON "shift_patterns"("branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "shift_pattern_days_patternId_dayIndex_key" ON "shift_pattern_days"("patternId", "dayIndex");

-- CreateIndex
CREATE INDEX "employee_pattern_assignments_employeeId_validFrom_idx" ON "employee_pattern_assignments"("employeeId", "validFrom");

-- CreateIndex
CREATE INDEX "employee_pattern_assignments_branchId_validFrom_idx" ON "employee_pattern_assignments"("branchId", "validFrom");

-- CreateIndex
CREATE INDEX "employee_pattern_assignments_patternId_idx" ON "employee_pattern_assignments"("patternId");

-- AddForeignKey
ALTER TABLE "shift_patterns" ADD CONSTRAINT "shift_patterns_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_pattern_days" ADD CONSTRAINT "shift_pattern_days_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "shift_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_pattern_days" ADD CONSTRAINT "shift_pattern_days_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_pattern_assignments" ADD CONSTRAINT "employee_pattern_assignments_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "shift_patterns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_pattern_assignments" ADD CONSTRAINT "employee_pattern_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

