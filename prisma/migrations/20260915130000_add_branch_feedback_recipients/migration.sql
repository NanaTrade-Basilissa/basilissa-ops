/* CreateTable */
CREATE TABLE "branch_feedback_recipients" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "roleLabel" TEXT,
    "userId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_feedback_recipients_pkey" PRIMARY KEY ("id")
);

/* CreateIndex */
CREATE UNIQUE INDEX "branch_feedback_recipients_branchId_email_key" ON "branch_feedback_recipients"("branchId", "email");

/* CreateIndex */
CREATE INDEX "branch_feedback_recipients_branchId_enabled_idx" ON "branch_feedback_recipients"("branchId", "enabled");

/* AddForeignKey */
ALTER TABLE "branch_feedback_recipients" ADD CONSTRAINT "branch_feedback_recipients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

/* AddForeignKey */
ALTER TABLE "branch_feedback_recipients" ADD CONSTRAINT "branch_feedback_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
