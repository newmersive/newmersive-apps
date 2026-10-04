ALTER TABLE "AllwainAppTesterProgress"
DROP CONSTRAINT IF EXISTS "AllwainAppTesterProgress_step_check";

ALTER TABLE "AllwainAppTesterProgress"
ADD CONSTRAINT "AllwainAppTesterProgress_step_check"
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
);
