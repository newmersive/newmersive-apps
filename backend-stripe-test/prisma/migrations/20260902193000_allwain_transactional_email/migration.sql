CREATE TABLE "AllwainEmailDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "provider" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "AllwainEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainEmailDelivery_notificationId_key"
  ON "AllwainEmailDelivery"("notificationId");
CREATE INDEX "AllwainEmailDelivery_status_createdAt_idx"
  ON "AllwainEmailDelivery"("status", "createdAt");
CREATE INDEX "AllwainEmailDelivery_userId_createdAt_idx"
  ON "AllwainEmailDelivery"("userId", "createdAt");
CREATE INDEX "AllwainEmailDelivery_email_createdAt_idx"
  ON "AllwainEmailDelivery"("email", "createdAt");
