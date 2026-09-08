-- Identity model: User + RoleAssignment + Session, replacing AdminUser.
--
-- admin_users is NOT dropped here. Every row is copied into users with a
-- SUPER_ADMIN/GLOBAL assignment, and the old table is left read-only for one
-- release so this migration can be verified against production data before
-- anything becomes unrecoverable. A follow-up migration drops it.
--
-- Existing admins keep their passwordHash, so nobody has to reset a password.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'SHIFT_SUPERVISOR', 'BRANCH_MANAGER', 'AREA_MANAGER', 'HR', 'ADMINISTRATOR', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('GLOBAL', 'BRANCH');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "role_assignments_userId_idx" ON "role_assignments"("userId");

-- CreateIndex
CREATE INDEX "role_assignments_scopeType_scopeId_idx" ON "role_assignments"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignments_userId_role_scopeType_scopeId_key" ON "role_assignments"("userId", "role", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data migration: admin_users -> users + SUPER_ADMIN/GLOBAL assignment
-- ---------------------------------------------------------------------------
-- Ids are carried over unchanged so anything referencing an admin id still
-- resolves. ON CONFLICT DO NOTHING keeps this safe to re-run.

INSERT INTO "users" ("id", "name", "email", "passwordHash", "status", "sessionVersion", "createdAt", "updatedAt")
SELECT
    "id",
    "name",
    "email",
    "passwordHash",
    'ACTIVE'::"UserStatus",
    0,
    "createdAt",
    "updatedAt"
FROM "admin_users"
ON CONFLICT ("id") DO NOTHING;

-- Deterministic ids ('migrated_' || user id) rather than random ones, so the
-- origin of every seeded grant is readable and re-running cannot duplicate.
INSERT INTO "role_assignments" ("id", "userId", "role", "scopeType", "scopeId", "validFrom", "createdAt", "grantedBy")
SELECT
    'migrated_' || "id",
    "id",
    'SUPER_ADMIN'::"Role",
    'GLOBAL'::"ScopeType",
    '',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    NULL
FROM "admin_users"
ON CONFLICT ("id") DO NOTHING;
