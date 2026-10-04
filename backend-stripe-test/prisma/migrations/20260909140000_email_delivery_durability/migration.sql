ALTER TABLE "AllwainNotification" ADD COLUMN "emailDeliveryRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AllwainEmailDelivery"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "attemptToken" TEXT,
  ADD COLUMN "providerMessageId" TEXT;
CREATE INDEX "AllwainEmailDelivery_status_nextAttemptAt_createdAt_idx"
  ON "AllwainEmailDelivery"("status", "nextAttemptAt", "createdAt");
