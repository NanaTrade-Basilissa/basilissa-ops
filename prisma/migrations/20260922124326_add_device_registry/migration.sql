-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "devices_branchId_idx" ON "devices"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_providerType_serialNumber_key" ON "devices"("providerType", "serialNumber");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
