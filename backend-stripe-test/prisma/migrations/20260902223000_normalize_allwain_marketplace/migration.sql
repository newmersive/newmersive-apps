-- Normalize the Allwain marketplace without removing the legacy JSON payloads.
ALTER TABLE "Offer"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "allwainType" TEXT,
  ADD COLUMN "allwainStatus" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "subcategory" TEXT,
  ADD COLUMN "productKind" TEXT,
  ADD COLUMN "locationLabel" TEXT;

UPDATE "Offer"
SET
  "allwainType" = CASE
    WHEN "owner" = 'allwain' AND NULLIF("meta"->>'requestId', '') IS NOT NULL THEN 'proposal'
    WHEN "owner" = 'allwain' THEN 'catalog'
    ELSE NULL
  END,
  "allwainStatus" = CASE
    WHEN "owner" = 'allwain' AND LOWER(COALESCE("meta"->>'archived', 'false')) = 'true' THEN 'closed'
    WHEN "owner" = 'allwain'
      AND CASE
        WHEN COALESCE("meta"->>'availableQuantity', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN ("meta"->>'availableQuantity')::numeric
        ELSE 1
      END <= 0 THEN 'sold_out'
    WHEN "owner" = 'allwain' THEN 'active'
    ELSE NULL
  END,
  "requestId" = NULLIF("meta"->>'requestId', ''),
  "currency" = UPPER(COALESCE(NULLIF("meta"->>'currency', ''), 'EUR')),
  "unit" = NULLIF("meta"->>'unit', ''),
  "category" = NULLIF("meta"->>'category', ''),
  "subcategory" = NULLIF("meta"->>'subcategory', ''),
  "productKind" = NULLIF("meta"->>'productKind', ''),
  "locationLabel" = COALESCE(NULLIF("meta"->>'locationLabel', ''), NULLIF("meta"->>'location', ''))
WHERE "owner" = 'allwain';

ALTER TABLE "Contract"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "purchaseKey" TEXT;

UPDATE "Contract" AS c
SET "requestId" = o."requestId"
FROM "Offer" AS o
WHERE c."offerId" = o."id" AND c."app" = 'allwain';

CREATE UNIQUE INDEX "Contract_purchaseKey_key" ON "Contract"("purchaseKey");
CREATE INDEX "Contract_requestId_status_createdAt_idx" ON "Contract"("requestId", "status", "createdAt");

ALTER TABLE "AllwainScanRequest"
  ADD COLUMN "selectedOfferId" TEXT,
  ADD COLUMN "selectedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "category" TEXT,
  ADD COLUMN "subcategory" TEXT,
  ADD COLUMN "productKind" TEXT,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "locationLabel" TEXT,
  ADD COLUMN "locationLatApprox" DOUBLE PRECISION,
  ADD COLUMN "locationLngApprox" DOUBLE PRECISION;

UPDATE "AllwainScanRequest"
SET
  "category" = NULLIF("extracted"->>'category', ''),
  "subcategory" = NULLIF("extracted"->>'subcategory', ''),
  "productKind" = NULLIF("extracted"->>'productKind', ''),
  "unit" = NULLIF("extracted"->>'unit', ''),
  "currency" = UPPER(COALESCE(NULLIF("extracted"->>'currency', ''), 'EUR')),
  "locationLabel" = COALESCE(NULLIF("extracted"->>'locationLabel', ''), NULLIF("extracted"->>'deliveryAddress', '')),
  "locationLatApprox" = CASE
    WHEN ("extracted"->>'locationLatApprox') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN ("extracted"->>'locationLatApprox')::double precision
    ELSE NULL
  END,
  "locationLngApprox" = CASE
    WHEN ("extracted"->>'locationLngApprox') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN ("extracted"->>'locationLngApprox')::double precision
    ELSE NULL
  END;

CREATE INDEX "Offer_owner_allwainType_allwainStatus_createdAt_idx" ON "Offer"("owner", "allwainType", "allwainStatus", "createdAt");
CREATE INDEX "Offer_ownerUserId_allwainStatus_createdAt_idx" ON "Offer"("ownerUserId", "allwainStatus", "createdAt");
CREATE INDEX "Offer_requestId_allwainStatus_createdAt_idx" ON "Offer"("requestId", "allwainStatus", "createdAt");
CREATE INDEX "Offer_category_subcategory_createdAt_idx" ON "Offer"("category", "subcategory", "createdAt");
CREATE INDEX "Offer_productKind_createdAt_idx" ON "Offer"("productKind", "createdAt");
CREATE INDEX "Offer_currency_createdAt_idx" ON "Offer"("currency", "createdAt");
CREATE UNIQUE INDEX "Offer_allwain_request_seller_unique"
  ON "Offer"("requestId", "ownerUserId")
  WHERE "owner" = 'allwain' AND "requestId" IS NOT NULL;

CREATE INDEX "AllwainScanRequest_userId_status_createdAt_idx" ON "AllwainScanRequest"("userId", "status", "createdAt");
CREATE INDEX "AllwainScanRequest_category_status_createdAt_idx" ON "AllwainScanRequest"("category", "status", "createdAt");
CREATE INDEX "AllwainScanRequest_productKind_status_createdAt_idx" ON "AllwainScanRequest"("productKind", "status", "createdAt");
CREATE INDEX "AllwainScanRequest_selectedOfferId_idx" ON "AllwainScanRequest"("selectedOfferId");
