UPDATE "AllwainEmailDelivery"
SET "status" = 'unknown', "error" = 'SMTP_LEGACY_ATTEMPT_REQUIRES_REVIEW'
WHERE "attemptToken" IS NULL AND "nextAttemptAt" IS NULL AND "providerMessageId" IS NULL
  AND ("status" IN ('failed', 'processing') OR ("status" = 'queued' AND "attempts" > 0));
