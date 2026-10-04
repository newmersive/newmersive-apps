BEGIN;

ALTER TABLE "AllwainBuyerPaymentProfile"
  ADD COLUMN "paymentMethodStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "defaultPaymentMethodId" TEXT,
  ADD COLUMN "defaultCardBrand" TEXT,
  ADD COLUMN "defaultCardLast4" TEXT,
  ADD COLUMN "defaultCardExpMonth" INTEGER,
  ADD COLUMN "defaultCardExpYear" INTEGER,
  ADD COLUMN "stripeSetupIntentId" TEXT,
  ADD COLUMN "stripeCheckoutSessionId" TEXT,
  ADD COLUMN "setupConsentVersion" TEXT,
  ADD COLUMN "setupConsentAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "setupConsentEvidenceHash" TEXT,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

ALTER TABLE "Contract"
  ADD COLUMN "deliveryChannel" TEXT;

ALTER TABLE "AllwainOrder"
  ADD COLUMN "deliveryChannel" TEXT,
  ADD COLUMN "recurringPlanId" TEXT,
  ADD COLUMN "recurringSequence" INTEGER,
  ADD COLUMN "scheduledFor" TIMESTAMP(3);

ALTER TABLE "AllwainScanRequest"
  ADD COLUMN "publicationReviewId" TEXT,
  ADD COLUMN "qualityDecision" TEXT,
  ADD COLUMN "qualityScore" INTEGER,
  ADD COLUMN "qualityReviewedAt" TIMESTAMP(3),
  ADD COLUMN "paymentGuaranteeStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "paymentGuaranteeConsentVersion" TEXT,
  ADD COLUMN "paymentGuaranteeAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "paymentGuaranteeEvidenceHash" TEXT;

UPDATE "Contract"
SET "deliveryChannel" = CASE
  WHEN "deliveryMethod" = 'shipping' THEN 'carrier'
  WHEN "deliveryMethod" = 'in_person' THEN 'seller'
  WHEN "deliveryMethod" = 'pickup' THEN 'pickup'
  ELSE NULL
END
WHERE "deliveryChannel" IS NULL;

-- This backfill only classifies the existing delivery route. Legacy preorder
-- rows may predate the durable mandate fields enforced by the previous
-- migration, so avoid revalidating unrelated historical payment state here.
ALTER TABLE "AllwainOrder"
  DISABLE TRIGGER "AllwainOrder_validate_preorder_mandate";

UPDATE "AllwainOrder"
SET "deliveryChannel" = CASE
  WHEN "deliveryMethod" = 'shipping' THEN 'carrier'
  WHEN "deliveryMethod" = 'in_person' THEN 'seller'
  WHEN "deliveryMethod" = 'pickup' THEN 'pickup'
  ELSE NULL
END
WHERE "deliveryChannel" IS NULL;

ALTER TABLE "AllwainOrder"
  ENABLE TRIGGER "AllwainOrder_validate_preorder_mandate";

CREATE TABLE "AllwainExperienceProfile" (
  "userId" TEXT NOT NULL,
  "onboardingVersion" INTEGER NOT NULL DEFAULT 0,
  "onboardingCompletedAt" TIMESTAMP(3),
  "primaryIntent" TEXT,
  "guidanceEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastContext" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainExperienceProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "AllwainExperienceProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AllwainPublicationReview" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "draftHash" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "summary" TEXT NOT NULL,
  "issues" JSONB NOT NULL,
  "suggestions" JSONB NOT NULL,
  "normalized" JSONB,
  "provider" TEXT NOT NULL DEFAULT 'rules',
  "model" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainPublicationReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainPublicationReview_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainPublicationReview_score_check" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "AllwainPublicationReview_decision_check" CHECK ("decision" IN ('approve', 'improve', 'block'))
);

CREATE TABLE "AllwainDeliveryCheckpoint" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "checkpointType" TEXT NOT NULL,
  "expectedUserId" TEXT NOT NULL,
  "verifiedByConnectorUserId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "shortCodeHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainDeliveryCheckpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainDeliveryCheckpoint_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "AllwainDeliveryAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainDeliveryCheckpoint_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainDeliveryCheckpoint_expectedUserId_fkey"
    FOREIGN KEY ("expectedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainDeliveryCheckpoint_verifiedByConnectorUserId_fkey"
    FOREIGN KEY ("verifiedByConnectorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainDeliveryCheckpoint_type_check" CHECK ("checkpointType" IN ('seller_handoff', 'buyer_delivery')),
  CONSTRAINT "AllwainDeliveryCheckpoint_status_check" CHECK ("status" IN ('pending', 'verified', 'expired', 'canceled'))
);

CREATE TABLE "AllwainRecurringPlan" (
  "id" TEXT NOT NULL,
  "sourceOrderId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_initial_payment',
  "interval" TEXT NOT NULL,
  "intervalCount" INTEGER NOT NULL DEFAULT 1,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPriceAmount" INTEGER NOT NULL,
  "maximumChargeAmount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "platformFeeBps" INTEGER NOT NULL,
  "buyerCapacity" TEXT NOT NULL DEFAULT 'consumer',
  "deliveryMethod" TEXT,
  "deliveryChannel" TEXT,
  "deliveryAddress" JSONB,
  "deliveryNotes" TEXT,
  "deliveryWindow" JSONB,
  "commercialTermsVersion" TEXT NOT NULL,
  "mandateVersion" TEXT NOT NULL,
  "mandateAcceptedAt" TIMESTAMP(3) NOT NULL,
  "mandateEvidenceHash" TEXT NOT NULL,
  "mandateSnapshotHash" TEXT NOT NULL,
  "stripeCustomerId" TEXT,
  "stripePaymentMethodId" TEXT,
  "nextRunAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "maxOccurrences" INTEGER,
  "completedOccurrences" INTEGER NOT NULL DEFAULT 0,
  "failedOccurrences" INTEGER NOT NULL DEFAULT 0,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastFailureCode" TEXT,
  "lastFailureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainRecurringPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainRecurringPlan_sourceOrderId_fkey"
    FOREIGN KEY ("sourceOrderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainRecurringPlan_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainRecurringPlan_buyerUserId_fkey"
    FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainRecurringPlan_sellerUserId_fkey"
    FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainRecurringPlan_interval_check"
    CHECK ("interval" IN ('weekly', 'biweekly', 'monthly')),
  CONSTRAINT "AllwainRecurringPlan_status_check"
    CHECK ("status" IN ('pending_initial_payment', 'active', 'paused', 'requires_action', 'canceled', 'completed')),
  CONSTRAINT "AllwainRecurringPlan_amount_check"
    CHECK ("quantity" > 0 AND "unitPriceAmount" >= 0 AND "maximumChargeAmount" > 0 AND "platformFeeBps" BETWEEN 0 AND 10000),
  CONSTRAINT "AllwainRecurringPlan_occurrence_check"
    CHECK ("maxOccurrences" IS NULL OR "maxOccurrences" > 1)
);

CREATE TABLE "AllwainRecurringOccurrence" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "orderId" TEXT,
  "paymentId" TEXT,
  "stripePaymentIntentId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainRecurringOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainRecurringOccurrence_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "AllwainRecurringPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainRecurringOccurrence_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainRecurringOccurrence_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainRecurringOccurrence_status_check"
    CHECK ("status" IN ('scheduled', 'processing', 'paid', 'requires_action', 'failed', 'skipped', 'canceled')),
  CONSTRAINT "AllwainRecurringOccurrence_sequence_check"
    CHECK ("sequence" > 0 AND "attempts" >= 0)
);

CREATE UNIQUE INDEX "AllwainBuyerPaymentProfile_stripeSetupIntentId_key"
  ON "AllwainBuyerPaymentProfile"("stripeSetupIntentId");
CREATE UNIQUE INDEX "AllwainBuyerPaymentProfile_stripeCheckoutSessionId_key"
  ON "AllwainBuyerPaymentProfile"("stripeCheckoutSessionId");
CREATE INDEX "AllwainBuyerPaymentProfile_paymentMethodStatus_updatedAt_idx"
  ON "AllwainBuyerPaymentProfile"("paymentMethodStatus", "updatedAt");

CREATE INDEX "AllwainExperienceProfile_onboardingVersion_updatedAt_idx"
  ON "AllwainExperienceProfile"("onboardingVersion", "updatedAt");

CREATE INDEX "AllwainPublicationReview_userId_createdAt_idx"
  ON "AllwainPublicationReview"("userId", "createdAt");
CREATE INDEX "AllwainPublicationReview_entityType_entityId_idx"
  ON "AllwainPublicationReview"("entityType", "entityId");
CREATE INDEX "AllwainPublicationReview_decision_createdAt_idx"
  ON "AllwainPublicationReview"("decision", "createdAt");
CREATE INDEX "AllwainPublicationReview_draftHash_createdAt_idx"
  ON "AllwainPublicationReview"("draftHash", "createdAt");

CREATE UNIQUE INDEX "AllwainDeliveryCheckpoint_tokenHash_key"
  ON "AllwainDeliveryCheckpoint"("tokenHash");
CREATE UNIQUE INDEX "AllwainDeliveryCheckpoint_assignmentId_checkpointType_key"
  ON "AllwainDeliveryCheckpoint"("assignmentId", "checkpointType");
CREATE INDEX "AllwainDeliveryCheckpoint_orderId_checkpointType_idx"
  ON "AllwainDeliveryCheckpoint"("orderId", "checkpointType");
CREATE INDEX "AllwainDeliveryCheckpoint_expectedUserId_status_expiresAt_idx"
  ON "AllwainDeliveryCheckpoint"("expectedUserId", "status", "expiresAt");
CREATE INDEX "AllwainDeliveryCheckpoint_verifiedByConnectorUserId_verifiedAt_idx"
  ON "AllwainDeliveryCheckpoint"("verifiedByConnectorUserId", "verifiedAt");

CREATE UNIQUE INDEX "AllwainRecurringPlan_sourceOrderId_key"
  ON "AllwainRecurringPlan"("sourceOrderId");
CREATE INDEX "AllwainRecurringPlan_buyerUserId_status_nextRunAt_idx"
  ON "AllwainRecurringPlan"("buyerUserId", "status", "nextRunAt");
CREATE INDEX "AllwainRecurringPlan_sellerUserId_status_nextRunAt_idx"
  ON "AllwainRecurringPlan"("sellerUserId", "status", "nextRunAt");
CREATE INDEX "AllwainRecurringPlan_status_nextRunAt_idx"
  ON "AllwainRecurringPlan"("status", "nextRunAt");
CREATE INDEX "AllwainRecurringPlan_offerId_status_idx"
  ON "AllwainRecurringPlan"("offerId", "status");

CREATE UNIQUE INDEX "AllwainRecurringOccurrence_orderId_key"
  ON "AllwainRecurringOccurrence"("orderId");
CREATE UNIQUE INDEX "AllwainRecurringOccurrence_paymentId_key"
  ON "AllwainRecurringOccurrence"("paymentId");
CREATE UNIQUE INDEX "AllwainRecurringOccurrence_stripePaymentIntentId_key"
  ON "AllwainRecurringOccurrence"("stripePaymentIntentId");
CREATE UNIQUE INDEX "AllwainRecurringOccurrence_idempotencyKey_key"
  ON "AllwainRecurringOccurrence"("idempotencyKey");
CREATE UNIQUE INDEX "AllwainRecurringOccurrence_planId_sequence_key"
  ON "AllwainRecurringOccurrence"("planId", "sequence");
CREATE INDEX "AllwainRecurringOccurrence_status_scheduledFor_idx"
  ON "AllwainRecurringOccurrence"("status", "scheduledFor");
CREATE INDEX "AllwainRecurringOccurrence_planId_createdAt_idx"
  ON "AllwainRecurringOccurrence"("planId", "createdAt");

CREATE UNIQUE INDEX "AllwainOrder_recurringPlanId_recurringSequence_key"
  ON "AllwainOrder"("recurringPlanId", "recurringSequence");
CREATE INDEX "AllwainOrder_recurringPlanId_scheduledFor_idx"
  ON "AllwainOrder"("recurringPlanId", "scheduledFor");

CREATE INDEX "AllwainScanRequest_qualityDecision_createdAt_idx"
  ON "AllwainScanRequest"("qualityDecision", "createdAt");
CREATE INDEX "AllwainScanRequest_paymentGuaranteeStatus_createdAt_idx"
  ON "AllwainScanRequest"("paymentGuaranteeStatus", "createdAt");

ALTER TABLE "AllwainBuyerPaymentProfile"
  ADD CONSTRAINT "AllwainBuyerPaymentProfile_status_check"
  CHECK ("paymentMethodStatus" IN ('not_started', 'setup_pending', 'ready', 'failed'));

ALTER TABLE "AllwainScanRequest"
  ADD CONSTRAINT "AllwainScanRequest_quality_score_check"
  CHECK ("qualityScore" IS NULL OR "qualityScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "AllwainScanRequest_quality_decision_check"
  CHECK ("qualityDecision" IS NULL OR "qualityDecision" IN ('approve', 'improve', 'block')),
  ADD CONSTRAINT "AllwainScanRequest_payment_guarantee_status_check"
  CHECK ("paymentGuaranteeStatus" IN ('not_started', 'setup_pending', 'ready', 'failed'));

COMMIT;
