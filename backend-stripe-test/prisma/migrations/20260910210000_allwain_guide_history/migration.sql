CREATE TABLE "AllwainGuideTurn" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientMessageId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "userText" TEXT NOT NULL,
  "reply" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainGuideTurn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainGuideTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AllwainGuideTurn_userId_clientMessageId_key" ON "AllwainGuideTurn"("userId", "clientMessageId");
CREATE INDEX "AllwainGuideTurn_userId_createdAt_id_idx" ON "AllwainGuideTurn"("userId", "createdAt", "id");
