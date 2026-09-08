-- HR assessments: scored tests sent to named people on single-use links.
--
-- Deliberately separate from `questions` and the feedback tables. They look
-- alike and are different in every way that matters: feedback is anonymous,
-- unscored, 1-5 ratings from customers with no right answer; an assessment is
-- attributable, scored against an answer key, and sat once by one named
-- person. Sharing the models would mean a nullable isCorrect, a nullable
-- section, and a rating scale assessments never use.
--
-- Only the invitation token HASH is stored, as with password resets: a
-- database dump must not yield working links.

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssessmentQuestionKind" AS ENUM ('SINGLE_CHOICE', 'MULTI_CHOICE', 'FREE_TEXT');

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "showScoreToTaker" BOOLEAN NOT NULL DEFAULT false,
    "passMarkPercent" INTEGER,
    "invitationTtlHours" INTEGER NOT NULL DEFAULT 168,
    "createdBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_sections" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "assessment_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "kind" "AssessmentQuestionKind" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assessment_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_invitations" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "employeeId" TEXT,
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_responses" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "declaredName" TEXT,
    "declaredEmail" TEXT,
    "identityMismatch" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "scoredPoints" INTEGER,
    "maxPoints" INTEGER,

    CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_answers" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "text" TEXT,
    "awardedPoints" INTEGER,
    "possiblePoints" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessments_status_createdAt_idx" ON "assessments"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_sections_assessmentId_order_key" ON "assessment_sections"("assessmentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_sectionId_order_key" ON "assessment_questions"("sectionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_options_questionId_order_key" ON "assessment_options"("questionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_invitations_tokenHash_key" ON "assessment_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "assessment_invitations_assessmentId_createdAt_idx" ON "assessment_invitations"("assessmentId", "createdAt");

-- CreateIndex
CREATE INDEX "assessment_invitations_employeeId_idx" ON "assessment_invitations"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_responses_invitationId_key" ON "assessment_responses"("invitationId");

-- CreateIndex
CREATE INDEX "assessment_responses_submittedAt_idx" ON "assessment_responses"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answers_responseId_questionId_key" ON "assessment_answers"("responseId", "questionId");

-- AddForeignKey
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "assessment_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_options" ADD CONSTRAINT "assessment_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "assessment_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_invitations" ADD CONSTRAINT "assessment_invitations_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_invitations" ADD CONSTRAINT "assessment_invitations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "assessment_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "assessment_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "assessment_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

