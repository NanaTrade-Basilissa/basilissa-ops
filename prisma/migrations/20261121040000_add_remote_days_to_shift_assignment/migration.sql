-- AlterTable: employee_shift_assignments
ALTER TABLE "employee_shift_assignments"
  ADD COLUMN IF NOT EXISTS "remoteDaysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
