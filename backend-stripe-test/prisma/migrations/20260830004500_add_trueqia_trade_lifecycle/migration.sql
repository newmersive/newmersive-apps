ALTER TABLE "Trade"
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "tokensTransferredAt" TIMESTAMP(3),
ADD COLUMN "fromCompletedAt" TIMESTAMP(3),
ADD COLUMN "toCompletedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

-- The previous implementation transferred tokens when the proposal was accepted.
-- Mark those rows as funded so activating an existing signed contract never charges twice.
UPDATE "Trade"
SET "tokensTransferredAt" = COALESCE("resolvedAt", "createdAt")
WHERE "status" = 'accepted';

-- A contract signed by both parties starts the execution phase.
UPDATE "Trade" AS trade
SET
  "status" = 'active',
  "startedAt" = COALESCE(
    (
      SELECT MAX(contract."updatedAt")
      FROM "Contract" AS contract
      WHERE contract."tradeId" = trade."id"
        AND contract."app" = 'trueqia'
        AND contract."status" = 'accepted'
    ),
    trade."resolvedAt",
    trade."createdAt"
  )
WHERE trade."status" = 'accepted'
  AND EXISTS (
    SELECT 1
    FROM "Contract" AS contract
    WHERE contract."tradeId" = trade."id"
      AND contract."app" = 'trueqia'
      AND contract."status" = 'accepted'
  );

CREATE INDEX "Trade_status_createdAt_idx" ON "Trade"("status", "createdAt");
CREATE INDEX "Trade_fromUserId_status_idx" ON "Trade"("fromUserId", "status");
CREATE INDEX "Trade_toUserId_status_idx" ON "Trade"("toUserId", "status");
