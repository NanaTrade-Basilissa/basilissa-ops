-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_submissions" (
    "id" TEXT NOT NULL,
    "submissionToken" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_answers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "branches_slug_key" ON "branches"("slug");

-- CreateIndex
CREATE INDEX "branches_isActive_idx" ON "branches"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "questions_order_key" ON "questions"("order");

-- CreateIndex
CREATE INDEX "questions_isActive_order_idx" ON "questions"("isActive", "order");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_submissions_submissionToken_key" ON "feedback_submissions"("submissionToken");

-- CreateIndex
CREATE INDEX "feedback_submissions_branchId_idx" ON "feedback_submissions"("branchId");

-- CreateIndex
CREATE INDEX "feedback_submissions_submittedAt_idx" ON "feedback_submissions"("submittedAt");

-- CreateIndex
CREATE INDEX "feedback_submissions_branchId_submittedAt_idx" ON "feedback_submissions"("branchId", "submittedAt");

-- CreateIndex
CREATE INDEX "feedback_answers_questionId_idx" ON "feedback_answers"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_answers_submissionId_questionId_key" ON "feedback_answers"("submissionId", "questionId");

-- AddForeignKey
ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "feedback_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
