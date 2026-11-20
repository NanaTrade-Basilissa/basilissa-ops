-- CreateEnum
CREATE TYPE "FeedbackQuestionType" AS ENUM ('RATING', 'TEXT');

-- AlterTable: questions
ALTER TABLE "questions"
  ADD COLUMN "type" "FeedbackQuestionType" NOT NULL DEFAULT 'RATING',
  ADD COLUMN "isRequired" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: feedback_answers
ALTER TABLE "feedback_answers"
  ALTER COLUMN "score" DROP NOT NULL,
  ADD COLUMN "textResponse" TEXT;
