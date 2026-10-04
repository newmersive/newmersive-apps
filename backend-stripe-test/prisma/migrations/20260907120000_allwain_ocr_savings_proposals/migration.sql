ALTER TABLE "Offer"
  ADD COLUMN "proposalExpiresAt" TIMESTAMP(3),
  ADD COLUMN "proposalRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AllwainShoppingList"
  ADD COLUMN "sourceEvidenceDocumentId" TEXT,
  ADD COLUMN "sourceOcrExtractionId" TEXT,
  ADD COLUMN "sourceKind" TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE "AllwainShoppingListItem"
  ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'selected',
  ADD COLUMN "referencePriceSource" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "referencePriceLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "referenceCapturedAt" TIMESTAMP(3),
  ADD COLUMN "referenceDocumentId" TEXT,
  ADD COLUMN "ocrLineItemId" TEXT;

ALTER TABLE "AllwainScanRequest"
  ADD COLUMN "referencePriceSource" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "referencePriceLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "referenceDocumentId" TEXT,
  ADD COLUMN "ocrExtractionId" TEXT,
  ADD COLUMN "referenceCapturedAt" TIMESTAMP(3);

ALTER TABLE "Contract"
  ADD COLUMN "acceptedProposalRevisionId" TEXT,
  ADD COLUMN "feeBasis" TEXT NOT NULL DEFAULT 'sale_amount',
  ADD COLUMN "platformFeePayer" TEXT NOT NULL DEFAULT 'seller',
  ADD COLUMN "referenceAmount" INTEGER,
  ADD COLUMN "acceptedOfferAmount" INTEGER,
  ADD COLUMN "grossSavingsAmount" INTEGER,
  ADD COLUMN "netSavingsAmount" INTEGER;

ALTER TABLE "AllwainOrder"
  ADD COLUMN "acceptedProposalRevisionId" TEXT,
  ADD COLUMN "feeBasis" TEXT NOT NULL DEFAULT 'sale_amount',
  ADD COLUMN "platformFeePayer" TEXT NOT NULL DEFAULT 'seller',
  ADD COLUMN "referenceAmount" INTEGER,
  ADD COLUMN "acceptedOfferAmount" INTEGER,
  ADD COLUMN "grossSavingsAmount" INTEGER,
  ADD COLUMN "netSavingsAmount" INTEGER;

ALTER TABLE "AllwainOrderLine"
  ADD COLUMN "proposalRevisionId" TEXT,
  ADD COLUMN "referenceAmount" INTEGER,
  ADD COLUMN "grossSavingsAmount" INTEGER;

ALTER TABLE "AllwainSettlementPlan"
  ADD COLUMN "feeBasis" TEXT NOT NULL DEFAULT 'sale_amount',
  ADD COLUMN "platformFeePayer" TEXT NOT NULL DEFAULT 'seller',
  ADD COLUMN "referenceAmount" INTEGER,
  ADD COLUMN "acceptedOfferAmount" INTEGER,
  ADD COLUMN "grossSavingsAmount" INTEGER,
  ADD COLUMN "netSavingsAmount" INTEGER;

CREATE TABLE "AllwainEvidenceDocument" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "mimeType" TEXT,
  "storageKey" TEXT,
  "byteSize" INTEGER,
  "contentHash" TEXT NOT NULL,
  "rawTextHash" TEXT,
  "originalFileName" TEXT,
  "supersededById" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "annulledAt" TIMESTAMP(3),
  "annulmentReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainEvidenceDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainEvidenceDocument_status_check"
    CHECK ("status" IN ('active', 'consumed', 'annulled')),
  CONSTRAINT "AllwainEvidenceDocument_document_type_check"
    CHECK ("documentType" IN ('product', 'receipt', 'invoice', 'quote', 'purchase_list', 'unknown')),
  CONSTRAINT "AllwainEvidenceDocument_size_check"
    CHECK ("byteSize" IS NULL OR "byteSize" > 0)
);

CREATE TABLE "AllwainOcrExtraction" (
  "id" TEXT NOT NULL,
  "evidenceDocumentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'captured',
  "rawText" TEXT,
  "rawData" JSONB,
  "confidence" DOUBLE PRECISION,
  "extractionHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainOcrExtraction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainOcrExtraction_version_check" CHECK ("version" > 0),
  CONSTRAINT "AllwainOcrExtraction_status_check"
    CHECK ("status" IN ('captured', 'annulled')),
  CONSTRAINT "AllwainOcrExtraction_confidence_check"
    CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1)
);

CREATE TABLE "AllwainOcrLineItem" (
  "id" TEXT NOT NULL,
  "extractionId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "rawText" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPriceAmount" INTEGER NOT NULL,
  "lineTotalAmount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "taxIncluded" BOOLEAN,
  "discountAmount" INTEGER,
  "reviewStatus" TEXT NOT NULL DEFAULT 'selected',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainOcrLineItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainOcrLineItem_amounts_check"
    CHECK ("quantity" > 0 AND "unitPriceAmount" > 0 AND "lineTotalAmount" > 0 AND ("discountAmount" IS NULL OR "discountAmount" >= 0)),
  CONSTRAINT "AllwainOcrLineItem_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
  CONSTRAINT "AllwainOcrLineItem_review_status_check"
    CHECK ("reviewStatus" IN ('selected', 'discarded')),
  CONSTRAINT "AllwainOcrLineItem_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "AllwainProposalRevision" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "requestId" TEXT,
  "shoppingListId" TEXT,
  "totalAmount" INTEGER NOT NULL,
  "referenceAmount" INTEGER,
  "grossSavingsAmount" INTEGER,
  "currency" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "deliveryEstimate" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'current',
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainProposalRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainProposalRevision_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "AllwainProposalRevision_amounts_check"
    CHECK ("totalAmount" > 0 AND ("referenceAmount" IS NULL OR "referenceAmount" >= "totalAmount") AND ("grossSavingsAmount" IS NULL OR "grossSavingsAmount" >= 0)),
  CONSTRAINT "AllwainProposalRevision_status_check"
    CHECK ("status" IN ('current', 'superseded', 'accepted', 'expired', 'withdrawn')),
  CONSTRAINT "AllwainProposalRevision_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

UPDATE "Offer"
SET
  "proposalRevision" = 1,
  "proposalExpiresAt" = CASE
    WHEN "allwainStatus" = 'active' THEN CURRENT_TIMESTAMP + INTERVAL '7 days'
    ELSE COALESCE("updatedAt", "createdAt") + INTERVAL '7 days'
  END
WHERE "owner" = 'allwain' AND "allwainType" = 'proposal';

INSERT INTO "AllwainProposalRevision" (
  "id", "offerId", "revision", "sellerUserId", "requestId", "shoppingListId",
  "totalAmount", "referenceAmount", "grossSavingsAmount", "currency",
  "validUntil", "description", "deliveryEstimate", "payload", "snapshotHash",
  "status", "acceptedAt", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  "id",
  1,
  "ownerUserId",
  "requestId",
  "shoppingListId",
  GREATEST(1, ROUND(COALESCE("price", 0) * 100)::integer),
  NULL,
  NULL,
  UPPER(COALESCE("currency", 'EUR')),
  "proposalExpiresAt",
  "description",
  COALESCE("meta"->>'deliveryEstimate', 'Plazo no indicado'),
  jsonb_build_object('backfilled', true, 'offerMeta', COALESCE("meta", '{}'::jsonb)),
  md5("id" || ':1:' || COALESCE("updatedAt"::text, "createdAt"::text)),
  CASE
    WHEN "allwainStatus" = 'selected' THEN 'accepted'
    WHEN "allwainStatus" = 'active' THEN 'current'
    WHEN "allwainStatus" = 'withdrawn' THEN 'withdrawn'
    ELSE 'superseded'
  END,
  CASE WHEN "allwainStatus" = 'selected' THEN COALESCE("updatedAt", "createdAt") ELSE NULL END,
  COALESCE("updatedAt", "createdAt")
FROM "Offer"
WHERE "owner" = 'allwain' AND "allwainType" = 'proposal';

CREATE UNIQUE INDEX "AllwainShoppingListItem_ocrLineItemId_key" ON "AllwainShoppingListItem"("ocrLineItemId");
CREATE UNIQUE INDEX "Contract_acceptedProposalRevisionId_key" ON "Contract"("acceptedProposalRevisionId");
CREATE UNIQUE INDEX "AllwainOrder_acceptedProposalRevisionId_key" ON "AllwainOrder"("acceptedProposalRevisionId");
CREATE UNIQUE INDEX "AllwainOcrExtraction_evidenceDocumentId_version_key" ON "AllwainOcrExtraction"("evidenceDocumentId", "version");
CREATE UNIQUE INDEX "AllwainOcrLineItem_extractionId_position_key" ON "AllwainOcrLineItem"("extractionId", "position");
CREATE UNIQUE INDEX "AllwainProposalRevision_offerId_revision_key" ON "AllwainProposalRevision"("offerId", "revision");

CREATE INDEX "Offer_proposalExpiresAt_allwainStatus_idx" ON "Offer"("proposalExpiresAt", "allwainStatus");
CREATE INDEX "AllwainShoppingList_sourceEvidenceDocumentId_createdAt_idx" ON "AllwainShoppingList"("sourceEvidenceDocumentId", "createdAt");
CREATE INDEX "AllwainShoppingList_sourceOcrExtractionId_idx" ON "AllwainShoppingList"("sourceOcrExtractionId");
CREATE INDEX "AllwainShoppingListItem_shoppingListId_reviewStatus_position_idx" ON "AllwainShoppingListItem"("shoppingListId", "reviewStatus", "position");
CREATE INDEX "AllwainShoppingListItem_referenceDocumentId_idx" ON "AllwainShoppingListItem"("referenceDocumentId");
CREATE INDEX "AllwainScanRequest_referenceDocumentId_idx" ON "AllwainScanRequest"("referenceDocumentId");
CREATE INDEX "AllwainScanRequest_ocrExtractionId_idx" ON "AllwainScanRequest"("ocrExtractionId");
CREATE INDEX "AllwainEvidenceDocument_ownerUserId_status_createdAt_idx" ON "AllwainEvidenceDocument"("ownerUserId", "status", "createdAt");
CREATE INDEX "AllwainEvidenceDocument_ownerUserId_contentHash_status_idx" ON "AllwainEvidenceDocument"("ownerUserId", "contentHash", "status");
CREATE INDEX "AllwainEvidenceDocument_supersededById_idx" ON "AllwainEvidenceDocument"("supersededById");
CREATE INDEX "AllwainOcrExtraction_evidenceDocumentId_status_createdAt_idx" ON "AllwainOcrExtraction"("evidenceDocumentId", "status", "createdAt");
CREATE INDEX "AllwainOcrExtraction_extractionHash_idx" ON "AllwainOcrExtraction"("extractionHash");
CREATE INDEX "AllwainOcrLineItem_extractionId_reviewStatus_position_idx" ON "AllwainOcrLineItem"("extractionId", "reviewStatus", "position");
CREATE INDEX "AllwainProposalRevision_requestId_status_validUntil_idx" ON "AllwainProposalRevision"("requestId", "status", "validUntil");
CREATE INDEX "AllwainProposalRevision_shoppingListId_status_validUntil_idx" ON "AllwainProposalRevision"("shoppingListId", "status", "validUntil");
CREATE INDEX "AllwainProposalRevision_sellerUserId_createdAt_idx" ON "AllwainProposalRevision"("sellerUserId", "createdAt");
CREATE INDEX "AllwainOrderLine_proposalRevisionId_idx" ON "AllwainOrderLine"("proposalRevisionId");

ALTER TABLE "AllwainShoppingList"
  ADD CONSTRAINT "AllwainShoppingList_source_kind_check" CHECK ("sourceKind" IN ('manual', 'ocr_document'));

ALTER TABLE "AllwainShoppingListItem"
  ADD CONSTRAINT "AllwainShoppingListItem_review_status_check" CHECK ("reviewStatus" IN ('selected', 'discarded')),
  ADD CONSTRAINT "AllwainShoppingListItem_reference_source_check" CHECK ("referencePriceSource" IN ('manual', 'ocr_document')),
  ADD CONSTRAINT "AllwainShoppingListItem_locked_reference_check" CHECK (NOT "referencePriceLocked" OR ("targetUnitPriceAmount" IS NOT NULL AND "referenceDocumentId" IS NOT NULL AND "ocrLineItemId" IS NOT NULL));

ALTER TABLE "AllwainScanRequest"
  ADD CONSTRAINT "AllwainScanRequest_reference_source_check" CHECK ("referencePriceSource" IN ('manual', 'ocr_document')),
  ADD CONSTRAINT "AllwainScanRequest_locked_reference_check" CHECK (NOT "referencePriceLocked" OR ("referenceDocumentId" IS NOT NULL AND "ocrExtractionId" IS NOT NULL AND "referenceCapturedAt" IS NOT NULL));

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_fee_basis_check" CHECK ("feeBasis" IN ('sale_amount', 'verified_savings')),
  ADD CONSTRAINT "Contract_platform_fee_payer_check" CHECK ("platformFeePayer" IN ('seller', 'buyer', 'platform')),
  ADD CONSTRAINT "Contract_savings_amounts_check" CHECK (
    ("referenceAmount" IS NULL OR "referenceAmount" >= 0) AND
    ("acceptedOfferAmount" IS NULL OR "acceptedOfferAmount" >= 0) AND
    ("grossSavingsAmount" IS NULL OR "grossSavingsAmount" >= 0) AND
    ("netSavingsAmount" IS NULL OR "netSavingsAmount" >= 0)
  );

ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_fee_basis_check" CHECK ("feeBasis" IN ('sale_amount', 'verified_savings')),
  ADD CONSTRAINT "AllwainOrder_platform_fee_payer_check" CHECK ("platformFeePayer" IN ('seller', 'buyer', 'platform')),
  ADD CONSTRAINT "AllwainOrder_savings_amounts_check" CHECK (
    ("referenceAmount" IS NULL OR "referenceAmount" >= 0) AND
    ("acceptedOfferAmount" IS NULL OR "acceptedOfferAmount" >= 0) AND
    ("grossSavingsAmount" IS NULL OR "grossSavingsAmount" >= 0) AND
    ("netSavingsAmount" IS NULL OR "netSavingsAmount" >= 0)
  );

ALTER TABLE "AllwainSettlementPlan"
  ADD CONSTRAINT "AllwainSettlementPlan_fee_basis_check" CHECK ("feeBasis" IN ('sale_amount', 'verified_savings')),
  ADD CONSTRAINT "AllwainSettlementPlan_platform_fee_payer_check" CHECK ("platformFeePayer" IN ('seller', 'buyer', 'platform'));

ALTER TABLE "AllwainEvidenceDocument"
  ADD CONSTRAINT "AllwainEvidenceDocument_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AllwainEvidenceDocument_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "AllwainEvidenceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainOcrExtraction"
  ADD CONSTRAINT "AllwainOcrExtraction_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "AllwainEvidenceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainOcrLineItem"
  ADD CONSTRAINT "AllwainOcrLineItem_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "AllwainOcrExtraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainShoppingList"
  ADD CONSTRAINT "AllwainShoppingList_sourceEvidenceDocumentId_fkey" FOREIGN KEY ("sourceEvidenceDocumentId") REFERENCES "AllwainEvidenceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AllwainShoppingList_sourceOcrExtractionId_fkey" FOREIGN KEY ("sourceOcrExtractionId") REFERENCES "AllwainOcrExtraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainShoppingListItem"
  ADD CONSTRAINT "AllwainShoppingListItem_referenceDocumentId_fkey" FOREIGN KEY ("referenceDocumentId") REFERENCES "AllwainEvidenceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AllwainShoppingListItem_ocrLineItemId_fkey" FOREIGN KEY ("ocrLineItemId") REFERENCES "AllwainOcrLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainScanRequest"
  ADD CONSTRAINT "AllwainScanRequest_referenceDocumentId_fkey" FOREIGN KEY ("referenceDocumentId") REFERENCES "AllwainEvidenceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AllwainScanRequest_ocrExtractionId_fkey" FOREIGN KEY ("ocrExtractionId") REFERENCES "AllwainOcrExtraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainProposalRevision"
  ADD CONSTRAINT "AllwainProposalRevision_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AllwainProposalRevision_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_acceptedProposalRevisionId_fkey" FOREIGN KEY ("acceptedProposalRevisionId") REFERENCES "AllwainProposalRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_acceptedProposalRevisionId_fkey" FOREIGN KEY ("acceptedProposalRevisionId") REFERENCES "AllwainProposalRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainOrderLine"
  ADD CONSTRAINT "AllwainOrderLine_proposalRevisionId_fkey" FOREIGN KEY ("proposalRevisionId") REFERENCES "AllwainProposalRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
