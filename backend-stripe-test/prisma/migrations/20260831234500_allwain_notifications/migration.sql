CREATE TABLE "AllwainNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "route" TEXT,
  "routeParams" JSONB,
  "dedupeKey" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainNotification_dedupeKey_key"
  ON "AllwainNotification"("dedupeKey");
CREATE INDEX "AllwainNotification_userId_readAt_createdAt_idx"
  ON "AllwainNotification"("userId", "readAt", "createdAt");
CREATE INDEX "AllwainNotification_userId_createdAt_idx"
  ON "AllwainNotification"("userId", "createdAt");
