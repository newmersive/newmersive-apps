CREATE TABLE "AllwainGuideExecution" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "actionHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'started',
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainGuideExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainGuideExecution_status_check" CHECK ("status" IN ('started', 'completed', 'uncertain')),
  CONSTRAINT "AllwainGuideExecution_result_check" CHECK (("status" = 'completed') = ("result" IS NOT NULL)),
  CONSTRAINT "AllwainGuideExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AllwainGuideExecution_userId_idempotencyKey_key" ON "AllwainGuideExecution"("userId", "idempotencyKey");
CREATE INDEX "AllwainGuideExecution_status_createdAt_idx" ON "AllwainGuideExecution"("status", "createdAt");
