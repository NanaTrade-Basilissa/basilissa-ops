-- CreateEnum
CREATE TYPE "AptitudeQuestionKind" AS ENUM ('SINGLE_CHOICE', 'MULTI_CHOICE', 'FREE_TEXT');

-- CreateEnum
CREATE TYPE "AptitudeTestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateTable
CREATE TABLE "aptitude_tests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AptitudeTestStatus" NOT NULL DEFAULT 'DRAFT',
    "showScoreToCandidate" BOOLEAN NOT NULL DEFAULT false,
    "passMarkPercent" INTEGER,
    "timeLimitMinutes" INTEGER,
    "invitationsExpire" BOOLEAN NOT NULL DEFAULT true,
    "invitationTtlHours" INTEGER NOT NULL DEFAULT 168,
    "publicLinkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicLinkToken" TEXT,
    "publicLinkNameMode" "IdentityFieldMode" NOT NULL DEFAULT 'REQUIRED',
    "publicLinkEmailMode" "IdentityFieldMode" NOT NULL DEFAULT 'REQUIRED',
    "createdBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "aptitude_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aptitude_sections" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "aptitude_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aptitude_questions" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "kind" "AptitudeQuestionKind" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "aptitude_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aptitude_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "aptitude_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aptitude_invitations" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "candidateEmail" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aptitude_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aptitude_attempts" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "declaredName" TEXT,
    "declaredEmail" TEXT,
    "identityMismatch" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "scoredPoints" INTEGER,
    "maxPoints" INTEGER,

    CONSTRAINT "aptitude_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aptitude_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "text" TEXT,
    "awardedPoints" INTEGER,
    "possiblePoints" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aptitude_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aptitude_tests_publicLinkToken_key" ON "aptitude_tests"("publicLinkToken");

-- CreateIndex
CREATE INDEX "aptitude_tests_status_createdAt_idx" ON "aptitude_tests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "aptitude_tests_deletedAt_idx" ON "aptitude_tests"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "aptitude_sections_testId_order_key" ON "aptitude_sections"("testId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "aptitude_questions_sectionId_order_key" ON "aptitude_questions"("sectionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "aptitude_options_questionId_order_key" ON "aptitude_options"("questionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "aptitude_invitations_tokenHash_key" ON "aptitude_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "aptitude_invitations_testId_createdAt_idx" ON "aptitude_invitations"("testId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "aptitude_attempts_invitationId_key" ON "aptitude_attempts"("invitationId");

-- CreateIndex
CREATE INDEX "aptitude_attempts_submittedAt_idx" ON "aptitude_attempts"("submittedAt");

-- CreateIndex
CREATE INDEX "aptitude_attempts_deadlineAt_idx" ON "aptitude_attempts"("deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "aptitude_answers_attemptId_questionId_key" ON "aptitude_answers"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "aptitude_sections" ADD CONSTRAINT "aptitude_sections_testId_fkey" FOREIGN KEY ("testId") REFERENCES "aptitude_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptitude_questions" ADD CONSTRAINT "aptitude_questions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "aptitude_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptitude_options" ADD CONSTRAINT "aptitude_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "aptitude_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptitude_invitations" ADD CONSTRAINT "aptitude_invitations_testId_fkey" FOREIGN KEY ("testId") REFERENCES "aptitude_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptitude_attempts" ADD CONSTRAINT "aptitude_attempts_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "aptitude_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptitude_answers" ADD CONSTRAINT "aptitude_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "aptitude_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptitude_answers" ADD CONSTRAINT "aptitude_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "aptitude_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
