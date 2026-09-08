-- How a device knows an employee: terminal enrolment slot, app install id.
--
-- Empty until Phase 2. Modelled now because retrofitting an identity mapping
-- after attendance events reference it is the migration nobody wants.
--
-- The resolution key is deliberately NOT unique. A leaver's terminal slot is
-- reassigned to a new hire, so only the ACTIVE identity for a key must be
-- unique — a partial unique index, which Prisma cannot declare and which would
-- therefore show as permanent drift. Enforced in the service layer instead,
-- following the same reasoning as B7 (one primary branch).

-- CreateTable
CREATE TABLE "employee_device_identities" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "deviceId" TEXT,
    "label" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "employee_device_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_device_identities_providerType_externalId_revokedA_idx" ON "employee_device_identities"("providerType", "externalId", "revokedAt");

-- CreateIndex
CREATE INDEX "employee_device_identities_employeeId_revokedAt_idx" ON "employee_device_identities"("employeeId", "revokedAt");

-- AddForeignKey
ALTER TABLE "employee_device_identities" ADD CONSTRAINT "employee_device_identities_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

