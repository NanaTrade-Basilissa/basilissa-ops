-- Multi-factor authentication for privileged roles.
--
-- The TOTP seed is stored encrypted, so a database dump alone does not yield
-- working second factors. Recovery codes are stored hashed for the same
-- reason: they are credentials, and a dump of that table would otherwise be a
-- complete MFA bypass for every enrolled user.
ALTER TABLE "users" ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaSecret" TEXT;

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_userId_usedAt_idx" ON "mfa_recovery_codes"("userId", "usedAt");

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

