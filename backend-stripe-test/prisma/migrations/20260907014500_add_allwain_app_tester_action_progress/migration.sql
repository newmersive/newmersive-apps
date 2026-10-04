CREATE TABLE "AllwainAppTesterActionProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "appVersion" TEXT,
    "clientReference" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllwainAppTesterActionProgress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AllwainAppTesterActionProgress_program_check"
      CHECK ("programId" = 'allwain-app-pilot-v1'),
    CONSTRAINT "AllwainAppTesterActionProgress_step_check"
      CHECK (
        "stepId" IN (
          'access',
          'profile',
          'capture',
          'buy',
          'compare',
          'sell',
          'connector',
          'notifications',
          'delivery',
          'assistant',
          'accessibility',
          'support'
        )
      ),
    CONSTRAINT "AllwainAppTesterActionProgress_action_check"
      CHECK ("actionId" IN ('a1', 'a2')),
    CONSTRAINT "AllwainAppTesterActionProgress_status_check"
      CHECK ("status" IN ('pending', 'completed')),
    CONSTRAINT "AllwainAppTesterActionProgress_platform_check"
      CHECK ("platform" IN ('web', 'android', 'ios', 'unknown')),
    CONSTRAINT "AllwainAppTesterActionProgress_app_version_length_check"
      CHECK ("appVersion" IS NULL OR char_length("appVersion") BETWEEN 1 AND 80),
    CONSTRAINT "AllwainAppTesterActionProgress_client_reference_length_check"
      CHECK (char_length("clientReference") BETWEEN 8 AND 100),
    CONSTRAINT "AllwainAppTesterActionProgress_completed_at_check"
      CHECK (
        ("status" = 'completed' AND "completedAt" IS NOT NULL)
        OR ("status" = 'pending' AND "completedAt" IS NULL)
      )
);

CREATE UNIQUE INDEX "AllwainAppTesterActionProgress_userId_programId_stepId_actionId_key"
ON "AllwainAppTesterActionProgress"("userId", "programId", "stepId", "actionId");

CREATE INDEX "AllwainAppTesterActionProgress_userId_programId_updatedAt_idx"
ON "AllwainAppTesterActionProgress"("userId", "programId", "updatedAt");

CREATE INDEX "AllwainAppTesterActionProgress_programId_stepId_actionId_status_idx"
ON "AllwainAppTesterActionProgress"("programId", "stepId", "actionId", "status");

ALTER TABLE "AllwainAppTesterActionProgress"
ADD CONSTRAINT "AllwainAppTesterActionProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A route completed before action-level tracking represents both of its published actions.
-- Persist that interpretation now so the new 24-action counter never contradicts legacy progress.
INSERT INTO "AllwainAppTesterActionProgress" (
  "id",
  "userId",
  "programId",
  "stepId",
  "actionId",
  "status",
  "platform",
  "appVersion",
  "clientReference",
  "completedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  progress."id" || ':' || actions."actionId",
  progress."userId",
  progress."programId",
  progress."stepId",
  actions."actionId",
  'completed',
  progress."platform",
  progress."appVersion",
  'backfill:' || progress."id" || ':' || actions."actionId",
  progress."completedAt",
  progress."createdAt",
  progress."updatedAt"
FROM "AllwainAppTesterProgress" progress
CROSS JOIN (VALUES ('a1'), ('a2')) AS actions("actionId")
WHERE progress."programId" = 'allwain-app-pilot-v1'
  AND progress."status" = 'completed'
ON CONFLICT ("userId", "programId", "stepId", "actionId") DO NOTHING;

-- Account erasure may remove only the authenticated tester's action mutation events.
-- Every other audit update/delete remains rejected by the append-only trigger.
CREATE OR REPLACE FUNCTION allwain_reject_audit_mutation()
RETURNS trigger AS $$
DECLARE
  erasure_user_id TEXT := NULLIF(
    current_setting('allwain.account_erasure_user_id', true),
    ''
  );
BEGIN
  IF TG_OP = 'DELETE'
    AND erasure_user_id IS NOT NULL
    AND OLD."actorUserId" = erasure_user_id
    AND (
      (
        OLD."aggregateType" = 'web_tester_feedback'
        AND OLD."eventType" = 'web_tester.feedback_submitted'
      )
      OR
      (
        OLD."aggregateType" = 'app_tester_progress_request'
        AND OLD."eventType" = 'app_tester.progress_completed'
      )
      OR
      (
        OLD."aggregateType" = 'app_tester_action_request'
        AND OLD."eventType" = 'app_tester.action_updated'
      )
    )
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'AllwainAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;
