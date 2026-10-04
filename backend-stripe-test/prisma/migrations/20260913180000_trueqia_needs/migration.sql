CREATE TABLE "TrueqiaNeed" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT NOT NULL, "category" TEXT NOT NULL, "mode" TEXT NOT NULL,
  "locationLabel" TEXT NOT NULL, "availability" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TrueqiaNeed_status_category_mode_createdAt_idx" ON "TrueqiaNeed" ("status", "category", "mode", "createdAt");
CREATE INDEX "TrueqiaNeed_userId_createdAt_idx" ON "TrueqiaNeed" ("userId", "createdAt");
CREATE TABLE "TrueqiaNeedResponse" (
  "id" TEXT PRIMARY KEY, "needId" TEXT NOT NULL, "responderUserId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL, "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrueqiaNeedResponse_needId_fkey" FOREIGN KEY ("needId") REFERENCES "TrueqiaNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TrueqiaNeedResponse_needId_responderUserId_offerId_key" ON "TrueqiaNeedResponse" ("needId", "responderUserId", "offerId");
CREATE INDEX "TrueqiaNeedResponse_responderUserId_createdAt_idx" ON "TrueqiaNeedResponse" ("responderUserId", "createdAt");
