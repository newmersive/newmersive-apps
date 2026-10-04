ALTER TABLE "AllwainBuyerProfile"
  ADD COLUMN "defaultFiscalProfileId" TEXT;

ALTER TABLE "AllwainSellerProfile"
  ADD COLUMN "fiscalStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "defaultFiscalProfileId" TEXT;

ALTER TABLE "AllwainOrder"
  ADD COLUMN "taxStatus" TEXT NOT NULL DEFAULT 'pending_profile',
  ADD COLUMN "documentStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "traceabilityStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN "settlementStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "buyerCapacity" TEXT NOT NULL DEFAULT 'consumer',
  ADD COLUMN "legalSellerUserId" TEXT,
  ADD COLUMN "refundedAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commercialTermsVersion" TEXT NOT NULL DEFAULT 'allwain-marketplace-v1';

ALTER TABLE "Contract"
  ADD COLUMN "buyerCapacity" TEXT NOT NULL DEFAULT 'consumer';

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_buyerCapacity_check" CHECK ("buyerCapacity" IN ('consumer', 'business'));

UPDATE "AllwainOrder"
SET "legalSellerUserId" = "sellerUserId"
WHERE "legalSellerUserId" IS NULL;

ALTER TABLE "AllwainPayment"
  ADD COLUMN "stripeBalanceTransactionId" TEXT,
  ADD COLUMN "processorFeeAmount" INTEGER,
  ADD COLUMN "processorNetAmount" INTEGER;

CREATE TABLE "AllwainFiscalProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "legalForm" TEXT,
  "legalName" TEXT,
  "tradeName" TEXT,
  "taxIdType" TEXT,
  "taxId" TEXT,
  "vatId" TEXT,
  "countryCode" TEXT NOT NULL DEFAULT 'ES',
  "taxTerritory" TEXT,
  "vatRegime" TEXT NOT NULL DEFAULT 'unknown',
  "reagpActivity" TEXT,
  "ownProduction" BOOLEAN,
  "invoiceEmail" TEXT,
  "billingAddress" JSONB,
  "attestationVersion" TEXT,
  "attestedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "restrictedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainFiscalProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainFiscalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainFiscalProfile_kind_check" CHECK ("kind" IN ('consumer', 'business')),
  CONSTRAINT "AllwainFiscalProfile_status_check" CHECK ("status" IN ('draft', 'attested', 'verified', 'restricted'))
);

CREATE UNIQUE INDEX "AllwainFiscalProfile_userId_kind_key" ON "AllwainFiscalProfile"("userId", "kind");
CREATE INDEX "AllwainFiscalProfile_userId_status_idx" ON "AllwainFiscalProfile"("userId", "status");
CREATE INDEX "AllwainFiscalProfile_countryCode_vatRegime_idx" ON "AllwainFiscalProfile"("countryCode", "vatRegime");

CREATE TABLE "AllwainProductComplianceProfile" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "productKind" TEXT NOT NULL DEFAULT 'other',
  "foodCategory" TEXT,
  "ownProduction" BOOLEAN,
  "producerName" TEXT,
  "originCountry" TEXT,
  "originRegion" TEXT,
  "responsibleOperator" TEXT,
  "registrationNumber" TEXT,
  "ingredients" TEXT,
  "allergens" JSONB,
  "nutrition" JSONB,
  "nominalQuantity" DECIMAL(18,3),
  "nominalUnit" TEXT,
  "storageInstructions" TEXT,
  "onlineInfoComplete" BOOLEAN NOT NULL DEFAULT false,
  "lotTrackingRequired" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainProductComplianceProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainProductComplianceProfile_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainProductComplianceProfile_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AllwainProductComplianceProfile_offerId_key" ON "AllwainProductComplianceProfile"("offerId");
CREATE INDEX "AllwainProductComplianceProfile_sellerUserId_updatedAt_idx" ON "AllwainProductComplianceProfile"("sellerUserId", "updatedAt");
CREATE INDEX "AllwainProductComplianceProfile_productKind_onlineInfoComplete_idx" ON "AllwainProductComplianceProfile"("productKind", "onlineInfoComplete");

CREATE TABLE "AllwainPartySnapshot" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "userId" TEXT,
  "fiscalProfileId" TEXT,
  "profileVersion" INTEGER,
  "actingCapacity" TEXT NOT NULL,
  "countryCode" TEXT,
  "taxTerritory" TEXT,
  "vatRegime" TEXT,
  "displayName" TEXT,
  "snapshot" JSONB NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainPartySnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainPartySnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainPartySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainPartySnapshot_role_check" CHECK ("role" IN ('buyer', 'seller', 'connector', 'platform'))
);

CREATE UNIQUE INDEX "AllwainPartySnapshot_orderId_role_key" ON "AllwainPartySnapshot"("orderId", "role");
CREATE INDEX "AllwainPartySnapshot_userId_createdAt_idx" ON "AllwainPartySnapshot"("userId", "createdAt");
CREATE INDEX "AllwainPartySnapshot_orderId_createdAt_idx" ON "AllwainPartySnapshot"("orderId", "createdAt");

CREATE TABLE "AllwainOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "offerId" TEXT,
  "sellerUserId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPriceAmount" INTEGER NOT NULL,
  "subtotalAmount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "productSnapshot" JSONB NOT NULL,
  "productSnapshotHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainOrderLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainOrderLine_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainOrderLine_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainOrderLine_amounts_check" CHECK ("quantity" > 0 AND "unitPriceAmount" >= 0 AND "subtotalAmount" >= 0)
);

CREATE INDEX "AllwainOrderLine_orderId_createdAt_idx" ON "AllwainOrderLine"("orderId", "createdAt");
CREATE INDEX "AllwainOrderLine_offerId_idx" ON "AllwainOrderLine"("offerId");
CREATE INDEX "AllwainOrderLine_sellerUserId_createdAt_idx" ON "AllwainOrderLine"("sellerUserId", "createdAt");

CREATE TABLE "AllwainTaxRuleVersion" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "conditions" JSONB NOT NULL,
  "outcome" JSONB NOT NULL,
  "sourceReferences" JSONB,
  "requiresProfessionalReview" BOOLEAN NOT NULL DEFAULT true,
  "advisorApprovedAt" TIMESTAMP(3),
  "advisorReference" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainTaxRuleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainTaxRuleVersion_status_check" CHECK ("status" IN ('draft', 'active', 'retired'))
);

CREATE UNIQUE INDEX "AllwainTaxRuleVersion_code_version_key" ON "AllwainTaxRuleVersion"("code", "version");
CREATE INDEX "AllwainTaxRuleVersion_status_priority_effectiveFrom_idx" ON "AllwainTaxRuleVersion"("status", "priority", "effectiveFrom");

CREATE TABLE "AllwainTaxDetermination" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_profile',
  "ruleVersionId" TEXT,
  "treatmentCode" TEXT,
  "taxableBaseAmount" INTEGER NOT NULL DEFAULT 0,
  "taxAmount" INTEGER NOT NULL DEFAULT 0,
  "agriculturalCompensationAmount" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "explanation" TEXT,
  "inputSnapshot" JSONB NOT NULL,
  "outputSnapshot" JSONB,
  "determinedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "overrideReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainTaxDetermination_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainTaxDetermination_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainTaxDetermination_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "AllwainTaxRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainTaxDetermination_amounts_check" CHECK ("taxableBaseAmount" >= 0 AND "taxAmount" >= 0 AND "agriculturalCompensationAmount" >= 0)
);

CREATE UNIQUE INDEX "AllwainTaxDetermination_orderId_key" ON "AllwainTaxDetermination"("orderId");
CREATE INDEX "AllwainTaxDetermination_status_createdAt_idx" ON "AllwainTaxDetermination"("status", "createdAt");
CREATE INDEX "AllwainTaxDetermination_ruleVersionId_idx" ON "AllwainTaxDetermination"("ruleVersionId");

CREATE TABLE "AllwainSettlementPlan" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "grossAmount" INTEGER NOT NULL,
  "productAmount" INTEGER NOT NULL,
  "shippingAmount" INTEGER NOT NULL DEFAULT 0,
  "taxAmount" INTEGER NOT NULL DEFAULT 0,
  "agriculturalCompensationAmount" INTEGER NOT NULL DEFAULT 0,
  "platformFeeAmount" INTEGER NOT NULL,
  "connectorAmount" INTEGER NOT NULL DEFAULT 0,
  "sellerAmount" INTEGER NOT NULL,
  "processorFeeAmount" INTEGER,
  "currency" TEXT NOT NULL,
  "formulaSnapshot" JSONB NOT NULL,
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainSettlementPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainSettlementPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainSettlementPlan_amounts_check" CHECK ("grossAmount" >= 0 AND "productAmount" >= 0 AND "shippingAmount" >= 0 AND "taxAmount" >= 0 AND "agriculturalCompensationAmount" >= 0 AND "platformFeeAmount" >= 0 AND "connectorAmount" >= 0 AND "sellerAmount" >= 0)
);

CREATE UNIQUE INDEX "AllwainSettlementPlan_orderId_version_key" ON "AllwainSettlementPlan"("orderId", "version");
CREATE INDEX "AllwainSettlementPlan_orderId_status_idx" ON "AllwainSettlementPlan"("orderId", "status");
CREATE INDEX "AllwainSettlementPlan_status_updatedAt_idx" ON "AllwainSettlementPlan"("status", "updatedAt");

CREATE TABLE "AllwainLedgerEntry" (
  "id" TEXT NOT NULL,
  "orderId" TEXT,
  "paymentId" TEXT,
  "settlementPlanId" TEXT,
  "accountCode" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reversalOfEntryId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainLedgerEntry_settlementPlanId_fkey" FOREIGN KEY ("settlementPlanId") REFERENCES "AllwainSettlementPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainLedgerEntry_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "AllwainLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainLedgerEntry_direction_check" CHECK ("direction" IN ('debit', 'credit')),
  CONSTRAINT "AllwainLedgerEntry_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "AllwainLedgerEntry_idempotencyKey_key" ON "AllwainLedgerEntry"("idempotencyKey");
CREATE INDEX "AllwainLedgerEntry_orderId_occurredAt_idx" ON "AllwainLedgerEntry"("orderId", "occurredAt");
CREATE INDEX "AllwainLedgerEntry_paymentId_occurredAt_idx" ON "AllwainLedgerEntry"("paymentId", "occurredAt");
CREATE INDEX "AllwainLedgerEntry_accountCode_occurredAt_idx" ON "AllwainLedgerEntry"("accountCode", "occurredAt");
CREATE INDEX "AllwainLedgerEntry_referenceType_referenceId_idx" ON "AllwainLedgerEntry"("referenceType", "referenceId");

CREATE TABLE "AllwainTransfer" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT,
  "recipientUserId" TEXT NOT NULL,
  "recipientRole" TEXT NOT NULL,
  "stripeAccountId" TEXT,
  "stripeTransferId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "amount" INTEGER NOT NULL,
  "reversedAmount" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "releaseTrigger" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "transferredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainTransfer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainTransfer_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainTransfer_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainTransfer_amounts_check" CHECK ("amount" >= 0 AND "reversedAmount" >= 0 AND "reversedAmount" <= "amount")
);

CREATE UNIQUE INDEX "AllwainTransfer_stripeTransferId_key" ON "AllwainTransfer"("stripeTransferId");
CREATE UNIQUE INDEX "AllwainTransfer_idempotencyKey_key" ON "AllwainTransfer"("idempotencyKey");
CREATE INDEX "AllwainTransfer_orderId_recipientRole_idx" ON "AllwainTransfer"("orderId", "recipientRole");
CREATE INDEX "AllwainTransfer_recipientUserId_status_createdAt_idx" ON "AllwainTransfer"("recipientUserId", "status", "createdAt");
CREATE INDEX "AllwainTransfer_status_createdAt_idx" ON "AllwainTransfer"("status", "createdAt");

CREATE TABLE "AllwainPayoutAllocation" (
  "id" TEXT NOT NULL,
  "sellerPayoutId" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainPayoutAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainPayoutAllocation_sellerPayoutId_fkey" FOREIGN KEY ("sellerPayoutId") REFERENCES "AllwainSellerPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainPayoutAllocation_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "AllwainTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainPayoutAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainPayoutAllocation_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "AllwainPayoutAllocation_sellerPayoutId_transferId_key" ON "AllwainPayoutAllocation"("sellerPayoutId", "transferId");
CREATE INDEX "AllwainPayoutAllocation_orderId_createdAt_idx" ON "AllwainPayoutAllocation"("orderId", "createdAt");

CREATE TABLE "AllwainReconciliationRun" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "status" TEXT NOT NULL DEFAULT 'running',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "summary" JSONB,
  "error" TEXT,
  "startedByUserId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AllwainReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AllwainReconciliationRun_status_startedAt_idx" ON "AllwainReconciliationRun"("status", "startedAt");
CREATE INDEX "AllwainReconciliationRun_periodStart_periodEnd_idx" ON "AllwainReconciliationRun"("periodStart", "periodEnd");

CREATE TABLE "AllwainDocumentSequence" (
  "id" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "series" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainDocumentSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainDocumentSequence_documentType_series_year_key" ON "AllwainDocumentSequence"("documentType", "series", "year");

CREATE TABLE "AllwainFiscalDocument" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "issuerUserId" TEXT,
  "recipientUserId" TEXT,
  "documentNumber" TEXT,
  "series" TEXT,
  "sourceReference" TEXT,
  "currency" TEXT NOT NULL,
  "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
  "taxAmount" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" INTEGER NOT NULL,
  "templateVersion" TEXT NOT NULL,
  "contentSnapshot" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "storageKey" TEXT,
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "replacesDocumentId" TEXT,
  "issuedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainFiscalDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainFiscalDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainFiscalDocument_issuerUserId_fkey" FOREIGN KEY ("issuerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainFiscalDocument_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainFiscalDocument_replacesDocumentId_fkey" FOREIGN KEY ("replacesDocumentId") REFERENCES "AllwainFiscalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainFiscalDocument_amounts_check" CHECK ("subtotalAmount" >= 0 AND "taxAmount" >= 0 AND "totalAmount" >= 0)
);

CREATE UNIQUE INDEX "AllwainFiscalDocument_documentType_documentNumber_key" ON "AllwainFiscalDocument"("documentType", "documentNumber");
CREATE UNIQUE INDEX "AllwainFiscalDocument_orderId_documentType_sourceReference_key" ON "AllwainFiscalDocument"("orderId", "documentType", "sourceReference");
CREATE INDEX "AllwainFiscalDocument_orderId_createdAt_idx" ON "AllwainFiscalDocument"("orderId", "createdAt");
CREATE INDEX "AllwainFiscalDocument_documentType_status_createdAt_idx" ON "AllwainFiscalDocument"("documentType", "status", "createdAt");

CREATE TABLE "AllwainProductLot" (
  "id" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "offerId" TEXT,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "originCountry" TEXT,
  "originRegion" TEXT,
  "harvestOrProducedAt" TIMESTAMP(3),
  "bestBeforeAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "availableQuantity" DECIMAL(18,3),
  "unit" TEXT,
  "traceabilityData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainProductLot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainProductLot_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainProductLot_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AllwainProductLot_sellerUserId_code_key" ON "AllwainProductLot"("sellerUserId", "code");
CREATE INDEX "AllwainProductLot_offerId_status_idx" ON "AllwainProductLot"("offerId", "status");
CREATE INDEX "AllwainProductLot_status_expiresAt_idx" ON "AllwainProductLot"("status", "expiresAt");

CREATE TABLE "AllwainOrderLotAllocation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainOrderLotAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainOrderLotAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainOrderLotAllocation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "AllwainOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainOrderLotAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AllwainProductLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainOrderLotAllocation_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "AllwainOrderLotAllocation_orderLineId_lotId_key" ON "AllwainOrderLotAllocation"("orderLineId", "lotId");
CREATE INDEX "AllwainOrderLotAllocation_orderId_createdAt_idx" ON "AllwainOrderLotAllocation"("orderId", "createdAt");
CREATE INDEX "AllwainOrderLotAllocation_lotId_createdAt_idx" ON "AllwainOrderLotAllocation"("lotId", "createdAt");

CREATE TABLE "AllwainIncident" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "reporterUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "reason" TEXT NOT NULL,
  "requestedResolution" TEXT,
  "refundAmount" INTEGER,
  "currency" TEXT,
  "evidence" JSONB,
  "resolution" JSONB,
  "assignedToUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "AllwainIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainIncident_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainIncident_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainIncident_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainIncident_refundAmount_check" CHECK ("refundAmount" IS NULL OR "refundAmount" >= 0)
);

CREATE INDEX "AllwainIncident_orderId_createdAt_idx" ON "AllwainIncident"("orderId", "createdAt");
CREATE INDEX "AllwainIncident_status_createdAt_idx" ON "AllwainIncident"("status", "createdAt");
CREATE INDEX "AllwainIncident_reporterUserId_createdAt_idx" ON "AllwainIncident"("reporterUserId", "createdAt");

CREATE TABLE "AllwainConsentEvidence" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderId" TEXT,
  "consentType" TEXT NOT NULL,
  "documentVersion" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "evidence" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainConsentEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainConsentEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainConsentEvidence_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AllwainConsentEvidence_userId_consentType_occurredAt_idx" ON "AllwainConsentEvidence"("userId", "consentType", "occurredAt");
CREATE INDEX "AllwainConsentEvidence_orderId_occurredAt_idx" ON "AllwainConsentEvidence"("orderId", "occurredAt");

CREATE TABLE "AllwainReview" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "subjectUserId" TEXT NOT NULL,
  "subjectRole" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "status" TEXT NOT NULL DEFAULT 'published',
  "response" TEXT,
  "respondedAt" TIMESTAMP(3),
  "reportedAt" TIMESTAMP(3),
  "reportReason" TEXT,
  "moderatedByUserId" TEXT,
  "moderationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainReview_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainReview_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainReview_moderatedByUserId_fkey" FOREIGN KEY ("moderatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "AllwainReview_subjectRole_check" CHECK ("subjectRole" IN ('buyer', 'seller', 'connector')),
  CONSTRAINT "AllwainReview_status_check" CHECK ("status" IN ('published', 'reported', 'hidden')),
  CONSTRAINT "AllwainReview_no_self_review_check" CHECK ("authorUserId" <> "subjectUserId")
);

CREATE UNIQUE INDEX "AllwainReview_orderId_authorUserId_subjectUserId_key" ON "AllwainReview"("orderId", "authorUserId", "subjectUserId");
CREATE INDEX "AllwainReview_subjectUserId_status_createdAt_idx" ON "AllwainReview"("subjectUserId", "status", "createdAt");
CREATE INDEX "AllwainReview_authorUserId_createdAt_idx" ON "AllwainReview"("authorUserId", "createdAt");
CREATE INDEX "AllwainReview_orderId_createdAt_idx" ON "AllwainReview"("orderId", "createdAt");
CREATE INDEX "AllwainReview_status_reportedAt_idx" ON "AllwainReview"("status", "reportedAt");

CREATE TABLE "AllwainReputation" (
  "userId" TEXT NOT NULL,
  "averageRating" DECIMAL(3,2) NOT NULL DEFAULT 0,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "completedOrders" INTEGER NOT NULL DEFAULT 0,
  "lastReviewAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainReputation_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "AllwainReputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainReputation_averageRating_check" CHECK ("averageRating" >= 0 AND "averageRating" <= 5),
  CONSTRAINT "AllwainReputation_counts_check" CHECK ("reviewCount" >= 0 AND "completedOrders" >= 0)
);

CREATE INDEX "AllwainReputation_averageRating_reviewCount_idx" ON "AllwainReputation"("averageRating", "reviewCount");
CREATE INDEX "AllwainReputation_completedOrders_idx" ON "AllwainReputation"("completedOrders");

CREATE INDEX "AllwainOrder_taxStatus_createdAt_idx" ON "AllwainOrder"("taxStatus", "createdAt");
CREATE INDEX "AllwainOrder_documentStatus_createdAt_idx" ON "AllwainOrder"("documentStatus", "createdAt");
CREATE INDEX "AllwainPayment_stripeBalanceTransactionId_idx" ON "AllwainPayment"("stripeBalanceTransactionId");
