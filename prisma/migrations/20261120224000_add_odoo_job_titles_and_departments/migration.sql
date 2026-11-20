-- CreateTable: odoo_job_titles
CREATE TABLE IF NOT EXISTS "odoo_job_titles" (
    "id" TEXT NOT NULL,
    "odooId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "odoo_job_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: odoo_departments
CREATE TABLE IF NOT EXISTS "odoo_departments" (
    "id" TEXT NOT NULL,
    "odooId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "odoo_departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "odoo_job_titles_odooId_key" ON "odoo_job_titles"("odooId");
CREATE UNIQUE INDEX IF NOT EXISTS "odoo_job_titles_name_key" ON "odoo_job_titles"("name");
CREATE INDEX IF NOT EXISTS "odoo_job_titles_isActive_name_idx" ON "odoo_job_titles"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "odoo_departments_odooId_key" ON "odoo_departments"("odooId");
CREATE UNIQUE INDEX IF NOT EXISTS "odoo_departments_name_key" ON "odoo_departments"("name");
CREATE INDEX IF NOT EXISTS "odoo_departments_isActive_name_idx" ON "odoo_departments"("isActive", "name");
