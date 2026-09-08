-- Minimum viable scheduling: shift templates, employee assignments, and
-- one-day exceptions.
--
-- Moved into Phase 1 from Phase 7 deliberately. Late arrival, missing
-- clock-outs and overtime are all undefined without a scheduled start and end,
-- so the manager operations phase is not buildable without this.
--
-- Recurring day-of-week assignment only. Rota cycles and rotations are Phase 7;
-- guessing their shape now would be guessing.
-- CreateEnum
CREATE TYPE "ScheduleExceptionType" AS ENUM ('DAY_OFF', 'SHIFT_CHANGE', 'EXTRA_SHIFT');

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "unpaidBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_shift_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_exceptions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ScheduleExceptionType" NOT NULL,
    "shiftId" TEXT,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shifts_branchId_isActive_idx" ON "shifts"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "employee_shift_assignments_employeeId_validFrom_idx" ON "employee_shift_assignments"("employeeId", "validFrom");

-- CreateIndex
CREATE INDEX "employee_shift_assignments_shiftId_idx" ON "employee_shift_assignments"("shiftId");

-- CreateIndex
CREATE INDEX "schedule_exceptions_date_idx" ON "schedule_exceptions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_exceptions_employeeId_date_key" ON "schedule_exceptions"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

