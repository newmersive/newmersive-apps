CREATE TABLE "AllwainAiUsageEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "feature" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "sourceType" TEXT,
  "requestRecordId" TEXT,
  "status" TEXT NOT NULL,
  "inputBytes" INTEGER,
  "category" TEXT,
  "productKind" TEXT,
  "confidence" DOUBLE PRECISION,
  "detectedFields" INTEGER,
  "latencyMs" INTEGER,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainAiUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AllwainAiUsageEvent_feature_createdAt_idx"
  ON "AllwainAiUsageEvent"("feature", "createdAt");
CREATE INDEX "AllwainAiUsageEvent_provider_operation_status_createdAt_idx"
  ON "AllwainAiUsageEvent"("provider", "operation", "status", "createdAt");
CREATE INDEX "AllwainAiUsageEvent_userId_createdAt_idx"
  ON "AllwainAiUsageEvent"("userId", "createdAt");
CREATE INDEX "AllwainAiUsageEvent_requestRecordId_idx"
  ON "AllwainAiUsageEvent"("requestRecordId");

ALTER TABLE "AllwainAiUsageEvent"
  ADD CONSTRAINT "AllwainAiUsageEvent_status_check"
  CHECK ("status" IN ('succeeded', 'failed'));

ALTER TABLE "AllwainAiUsageEvent"
  ADD CONSTRAINT "AllwainAiUsageEvent_nonnegative_metrics_check"
  CHECK (
    ("inputBytes" IS NULL OR "inputBytes" >= 0) AND
    ("detectedFields" IS NULL OR "detectedFields" >= 0) AND
    ("latencyMs" IS NULL OR "latencyMs" >= 0) AND
    ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
  );
