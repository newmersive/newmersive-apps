ALTER TABLE "ChatThread"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3);

CREATE INDEX "ChatThread_app_contextType_createdByUserId_createdAt_idx"
  ON "ChatThread"("app", "contextType", "createdByUserId", "createdAt");
