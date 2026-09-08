
-- CreateEnum
CREATE TYPE "IdentityFieldMode" AS ENUM ('REQUIRED', 'OPTIONAL', 'HIDDEN');

-- AlterTable
ALTER TABLE "assessment_invitations" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "invitationsExpire" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicLinkEmailMode" "IdentityFieldMode" NOT NULL DEFAULT 'OPTIONAL',
ADD COLUMN     "publicLinkEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicLinkNameMode" "IdentityFieldMode" NOT NULL DEFAULT 'REQUIRED',
ADD COLUMN     "publicLinkToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assessments_publicLinkToken_key" ON "assessments"("publicLinkToken");

