CREATE TABLE "AllwainAppTesterProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "appVersion" TEXT,
    "clientReference" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllwainAppTesterProgress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AllwainAppTesterProgress_program_check"
      CHECK ("programId" = 'allwain-app-pilot-v1'),
    CONSTRAINT "AllwainAppTesterProgress_step_check"
      CHECK ("stepId" IN ('access', 'buy', 'sell', 'connector', 'support')),
    CONSTRAINT "AllwainAppTesterProgress_status_check"
      CHECK ("status" = 'completed'),
    CONSTRAINT "AllwainAppTesterProgress_platform_check"
      CHECK ("platform" IN ('web', 'android', 'ios', 'unknown')),
    CONSTRAINT "AllwainAppTesterProgress_app_version_length_check"
      CHECK ("appVersion" IS NULL OR char_length("appVersion") BETWEEN 1 AND 80),
    CONSTRAINT "AllwainAppTesterProgress_client_reference_length_check"
      CHECK (char_length("clientReference") BETWEEN 8 AND 100)
);

CREATE UNIQUE INDEX "AllwainAppTesterProgress_userId_programId_stepId_key"
ON "AllwainAppTesterProgress"("userId", "programId", "stepId");

CREATE INDEX "AllwainAppTesterProgress_userId_programId_updatedAt_idx"
ON "AllwainAppTesterProgress"("userId", "programId", "updatedAt");

CREATE INDEX "AllwainAppTesterProgress_programId_stepId_status_idx"
ON "AllwainAppTesterProgress"("programId", "stepId", "status");

ALTER TABLE "AllwainAppTesterProgress"
ADD CONSTRAINT "AllwainAppTesterProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
