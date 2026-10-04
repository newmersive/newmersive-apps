-- Early TrueQIA registrations did not identify their source app and received no welcome balance.
-- Repair only accounts with TrueQIA activity and no prior token-funded trade.
UPDATE "User" AS app_user
SET "tokens" = 100
WHERE COALESCE(app_user."tokens", 0) = 0
  AND (
    EXISTS (
      SELECT 1
      FROM "Offer" AS offer
      WHERE offer."owner" = 'trueqia'
        AND offer."ownerUserId" = app_user."id"
    )
    OR EXISTS (
      SELECT 1
      FROM "Trade" AS trade
      WHERE trade."fromUserId" = app_user."id"
         OR trade."toUserId" = app_user."id"
    )
    OR EXISTS (
      SELECT 1
      FROM "Contract" AS contract
      WHERE contract."app" = 'trueqia'
        AND (
          contract."requesterUserId" = app_user."id"
          OR contract."providerUserId" = app_user."id"
        )
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Trade" AS funded_trade
    WHERE funded_trade."tokensTransferredAt" IS NOT NULL
      AND (
        funded_trade."fromUserId" = app_user."id"
        OR funded_trade."toUserId" = app_user."id"
      )
  );

-- Old clients could create the contract directly from an offer. Link those contracts to the
-- matching proposal so the active-trade screen and bilateral completion flow can take over.
UPDATE "Contract" AS contract
SET "tradeId" = trade."id"
FROM "Trade" AS trade
WHERE contract."app" = 'trueqia'
  AND contract."tradeId" IS NULL
  AND contract."offerId" = trade."offerId"
  AND contract."requesterUserId" = trade."fromUserId"
  AND contract."providerUserId" = trade."toUserId"
  AND contract."requesterUserId" <> contract."providerUserId";

-- Signing the legacy contract is stronger consent than accepting the earlier proposal screen.
UPDATE "Trade" AS trade
SET
  "status" = 'accepted',
  "resolvedAt" = COALESCE(trade."resolvedAt", NOW())
WHERE trade."status" = 'pending'
  AND EXISTS (
    SELECT 1
    FROM "Contract" AS contract
    WHERE contract."tradeId" = trade."id"
      AND contract."app" = 'trueqia'
      AND contract."status" = 'accepted'
  );
