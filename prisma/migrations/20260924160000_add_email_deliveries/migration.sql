-- CreateTable
CREATE TABLE "email_deliveries" (
    "key" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("key","recipient")
);

-- CreateIndex
CREATE INDEX "email_deliveries_sentAt_idx" ON "email_deliveries"("sentAt");
