ALTER TABLE "Trade" ADD COLUMN "trueqiaDetails" JSONB;
ALTER TABLE "Contract" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Contract" ADD COLUMN "replacesId" TEXT;
CREATE TABLE "TrueqiaProfile" (
  "userId" TEXT PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Trade_offerId_status_idx" ON "Trade" ("offerId", "status");
-- Existing duplicates are retained for review. New proposals and unique acceptances
-- serialize on their Offer row; no destructive deduplication of historical trades.
