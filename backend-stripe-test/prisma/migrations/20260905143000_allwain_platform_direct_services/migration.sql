-- Platform-owned services are direct sales by Allwain. Marketplace sales keep
-- their existing seller-of-record and Connect transfer model.

ALTER TABLE "AllwainSellerProfile"
  ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'marketplace';

ALTER TABLE "Offer"
  ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'marketplace';

ALTER TABLE "Contract"
  ADD COLUMN "platformRetainedAmount" INTEGER,
  ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'marketplace',
  ADD COLUMN "businessOfRecord" TEXT NOT NULL DEFAULT 'seller';

ALTER TABLE "AllwainRecurringPlan"
  ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'marketplace',
  ADD COLUMN "businessOfRecord" TEXT NOT NULL DEFAULT 'seller',
  ADD COLUMN "platformRetainedAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AllwainOrder"
  DROP CONSTRAINT IF EXISTS "AllwainOrder_business_of_record_check",
  DROP CONSTRAINT IF EXISTS "AllwainOrder_allocation_identity_check",
  ADD COLUMN "platformRetainedAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'marketplace';

ALTER TABLE "AllwainPayment"
  DROP CONSTRAINT IF EXISTS "AllwainPayment_allocation_identity_check",
  ADD COLUMN "platformRetainedAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'marketplace',
  ADD COLUMN "businessOfRecord" TEXT NOT NULL DEFAULT 'seller';

ALTER TABLE "AllwainSettlementPlan"
  DROP CONSTRAINT IF EXISTS "AllwainSettlementPlan_allocation_identity_check",
  ADD COLUMN "platformRetainedAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commercialModel" TEXT NOT NULL DEFAULT 'marketplace',
  ADD COLUMN "businessOfRecord" TEXT NOT NULL DEFAULT 'seller';

UPDATE "Contract"
SET "platformRetainedAmount" = COALESCE("platformNetFeeAmount", "platformFeeAmount", 0)
WHERE "platformRetainedAmount" IS NULL;

UPDATE "AllwainRecurringPlan" p
SET "platformRetainedAmount" = COALESCE(o."platformNetFeeAmount", 0)
FROM "AllwainOrder" o
WHERE o."id" = p."sourceOrderId";

UPDATE "AllwainOrder"
SET "platformRetainedAmount" = "platformNetFeeAmount";

UPDATE "AllwainPayment"
SET "platformRetainedAmount" = "platformNetFeeAmount";

UPDATE "AllwainSettlementPlan"
SET "platformRetainedAmount" = "platformNetFeeAmount";

INSERT INTO "AllwainSellerProfile" (
  "userId", "status", "commercialModel", "sellerType", "displayName",
  "fiscalStatus", "activatedAt", "verifiedAt", "createdAt", "updatedAt"
)
SELECT
  u."id", 'active', 'platform_direct', 'company', 'Allwain',
  'not_started', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE LOWER(u."email") = 'newmersive@gmail.com'
ON CONFLICT ("userId") DO UPDATE SET
  "status" = 'active',
  "commercialModel" = 'platform_direct',
  "sellerType" = 'company',
  "displayName" = 'Allwain',
  "activatedAt" = COALESCE("AllwainSellerProfile"."activatedAt", CURRENT_TIMESTAMP),
  "verifiedAt" = COALESCE("AllwainSellerProfile"."verifiedAt", CURRENT_TIMESTAMP),
  "restrictedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Offer" o
SET "commercialModel" = 'platform_direct'
FROM "User" u
WHERE o."ownerUserId" = u."id"
  AND LOWER(u."email") = 'newmersive@gmail.com'
  AND o."owner" = 'allwain'
  AND o."productKind" = 'service';

ALTER TABLE "AllwainSellerProfile"
  ADD CONSTRAINT "AllwainSellerProfile_commercial_model_check"
  CHECK ("commercialModel" IN ('marketplace', 'platform_direct'));

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_commercial_model_check"
  CHECK ("commercialModel" IN ('marketplace', 'platform_direct'));

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_commercial_model_check"
  CHECK ("commercialModel" IN ('marketplace', 'platform_direct')),
  ADD CONSTRAINT "Contract_business_of_record_check"
  CHECK (
    ("commercialModel" = 'marketplace' AND "businessOfRecord" = 'seller') OR
    ("commercialModel" = 'platform_direct' AND "businessOfRecord" = 'platform')
  ),
  ADD CONSTRAINT "Contract_platform_retained_amount_check"
  CHECK ("platformRetainedAmount" IS NULL OR "platformRetainedAmount" >= 0),
  ADD CONSTRAINT "Contract_platform_direct_allocation_check"
  CHECK (
    "commercialModel" <> 'platform_direct' OR
    (
      COALESCE("platformFeeBps", 0) = 0 AND
      COALESCE("platformFeeAmount", 0) = 0 AND
      COALESCE("platformNetFeeAmount", 0) = 0 AND
      COALESCE("connectorPlatformShareAmount", 0) = 0 AND
      COALESCE("sellerAmount", 0) = 0 AND
      COALESCE("platformRetainedAmount", "subtotalAmount", 0) = COALESCE("subtotalAmount", 0)
    )
  );

ALTER TABLE "AllwainRecurringPlan"
  ADD CONSTRAINT "AllwainRecurringPlan_commercial_model_check"
  CHECK ("commercialModel" IN ('marketplace', 'platform_direct')),
  ADD CONSTRAINT "AllwainRecurringPlan_business_of_record_check"
  CHECK (
    ("commercialModel" = 'marketplace' AND "businessOfRecord" = 'seller') OR
    ("commercialModel" = 'platform_direct' AND "businessOfRecord" = 'platform')
  ),
  ADD CONSTRAINT "AllwainRecurringPlan_platform_retained_amount_check"
  CHECK ("platformRetainedAmount" >= 0),
  ADD CONSTRAINT "AllwainRecurringPlan_platform_direct_allocation_check"
  CHECK (
    "commercialModel" <> 'platform_direct' OR
    (
      "platformFeeBps" = 0 AND
      "connectorPlatformShareAmount" = 0
    )
  );

ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_commercial_model_check"
  CHECK ("commercialModel" IN ('marketplace', 'platform_direct')),
  ADD CONSTRAINT "AllwainOrder_business_of_record_check"
  CHECK (
    ("commercialModel" = 'marketplace' AND "businessOfRecord" = 'seller') OR
    ("commercialModel" = 'platform_direct' AND "businessOfRecord" = 'platform')
  ),
  ADD CONSTRAINT "AllwainOrder_platform_retained_amount_check"
  CHECK ("platformRetainedAmount" >= 0),
  ADD CONSTRAINT "AllwainOrder_model_allocation_check"
  CHECK (
    ("commercialModel" = 'marketplace' AND
      "platformRetainedAmount" = "platformNetFeeAmount" AND
      "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount") OR
    ("commercialModel" = 'platform_direct' AND
      "platformFeeBps" = 0 AND
      "platformFeeAmount" = 0 AND
      "platformNetFeeAmount" = 0 AND
      "connectorPlatformShareAmount" = 0 AND
      "sellerAmount" = 0)
  ),
  ADD CONSTRAINT "AllwainOrder_allocation_identity_check"
  CHECK (
    "connectorFeeAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
    "totalAmount" = "sellerAmount" + "platformRetainedAmount" + "connectorFeeAmount" + "carrierDeliveryAmount"
  );

ALTER TABLE "AllwainPayment"
  ADD CONSTRAINT "AllwainPayment_commercial_model_check"
  CHECK ("commercialModel" IN ('marketplace', 'platform_direct')),
  ADD CONSTRAINT "AllwainPayment_business_of_record_check"
  CHECK (
    ("commercialModel" = 'marketplace' AND "businessOfRecord" = 'seller') OR
    ("commercialModel" = 'platform_direct' AND "businessOfRecord" = 'platform')
  ),
  ADD CONSTRAINT "AllwainPayment_platform_retained_amount_check"
  CHECK ("platformRetainedAmount" >= 0),
  ADD CONSTRAINT "AllwainPayment_allocation_identity_check"
  CHECK (
    "kind" NOT IN ('payment', 'recurring_charge', 'deferred_charge') OR
    (
      "connectorFeeAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
      "amount" = "sellerAmount" + "platformRetainedAmount" + "connectorFeeAmount" + "carrierDeliveryAmount" AND
      (
        ("commercialModel" = 'marketplace' AND
          "platformRetainedAmount" = "platformNetFeeAmount" AND
          "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount") OR
        ("commercialModel" = 'platform_direct' AND
          "platformFeeAmount" = 0 AND
          "platformNetFeeAmount" = 0 AND
          "connectorPlatformShareAmount" = 0 AND
          "sellerAmount" = 0)
      )
    )
  );

ALTER TABLE "AllwainSettlementPlan"
  ADD CONSTRAINT "AllwainSettlementPlan_commercial_model_check"
  CHECK ("commercialModel" IN ('marketplace', 'platform_direct')),
  ADD CONSTRAINT "AllwainSettlementPlan_business_of_record_check"
  CHECK (
    ("commercialModel" = 'marketplace' AND "businessOfRecord" = 'seller') OR
    ("commercialModel" = 'platform_direct' AND "businessOfRecord" = 'platform')
  ),
  ADD CONSTRAINT "AllwainSettlementPlan_platform_retained_amount_check"
  CHECK ("platformRetainedAmount" >= 0),
  ADD CONSTRAINT "AllwainSettlementPlan_model_allocation_check"
  CHECK (
    ("commercialModel" = 'marketplace' AND
      "platformRetainedAmount" = "platformNetFeeAmount" AND
      "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount") OR
    ("commercialModel" = 'platform_direct' AND
      "platformFeeAmount" = 0 AND
      "platformNetFeeAmount" = 0 AND
      "connectorPlatformShareAmount" = 0 AND
      "sellerAmount" = 0)
  ),
  ADD CONSTRAINT "AllwainSettlementPlan_allocation_identity_check"
  CHECK (
    "connectorAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
    "grossAmount" = "sellerAmount" + "platformRetainedAmount" + "connectorAmount" + "carrierDeliveryAmount"
  );

CREATE INDEX "AllwainSellerProfile_commercialModel_status_idx"
  ON "AllwainSellerProfile"("commercialModel", "status");
CREATE INDEX "Offer_commercialModel_productKind_createdAt_idx"
  ON "Offer"("commercialModel", "productKind", "createdAt");
CREATE INDEX "AllwainOrder_commercialModel_status_createdAt_idx"
  ON "AllwainOrder"("commercialModel", "status", "createdAt");

CREATE OR REPLACE FUNCTION allwain_protect_order_commercial_core()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AllwainOrder history cannot be deleted';
  END IF;
  IF OLD."commercialTermsAcceptedAt" IS NOT NULL OR
     NEW."commercialTermsAcceptedAt" IS NOT NULL OR
     OLD."settlementStatus" IN ('checkout_locked', 'locked', 'settled', 'partially_refunded', 'refunded') THEN
    IF ROW(
      OLD."contractId", OLD."offerId", OLD."buyerUserId", OLD."sellerUserId",
      OLD."paymentMode", OLD."preorderChargeDeadlineAt", OLD."quantity", OLD."unit",
      OLD."unitPriceAmount", OLD."subtotalAmount", OLD."shippingAmount",
      OLD."carrierDeliveryAmount", OLD."carrierQuoteId", OLD."taxAmount",
      OLD."agriculturalCompensationAmount", OLD."totalAmount", OLD."currency",
      OLD."platformFeeBps", OLD."platformFeeAmount", OLD."platformNetFeeAmount",
      OLD."platformRetainedAmount", OLD."connectorFeeAmount",
      OLD."connectorPlatformShareAmount", OLD."connectorDeliveryAmount",
      OLD."sellerAmount", OLD."deliveryPricingSnapshot", OLD."paymentArchitecture",
      OLD."commercialModel", OLD."businessOfRecord", OLD."processorFeePayer",
      OLD."legalSellerUserId"
    ) IS DISTINCT FROM ROW(
      NEW."contractId", NEW."offerId", NEW."buyerUserId", NEW."sellerUserId",
      NEW."paymentMode", NEW."preorderChargeDeadlineAt", NEW."quantity", NEW."unit",
      NEW."unitPriceAmount", NEW."subtotalAmount", NEW."shippingAmount",
      NEW."carrierDeliveryAmount", NEW."carrierQuoteId", NEW."taxAmount",
      NEW."agriculturalCompensationAmount", NEW."totalAmount", NEW."currency",
      NEW."platformFeeBps", NEW."platformFeeAmount", NEW."platformNetFeeAmount",
      NEW."platformRetainedAmount", NEW."connectorFeeAmount",
      NEW."connectorPlatformShareAmount", NEW."connectorDeliveryAmount",
      NEW."sellerAmount", NEW."deliveryPricingSnapshot", NEW."paymentArchitecture",
      NEW."commercialModel", NEW."businessOfRecord", NEW."processorFeePayer",
      NEW."legalSellerUserId"
    ) THEN
      RAISE EXCEPTION 'Accepted order commercial terms cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION allwain_protect_payment_core()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AllwainPayment history cannot be deleted';
  END IF;
  IF ROW(
    OLD."orderId", OLD."provider", OLD."kind", OLD."operationKey", OLD."amount",
    OLD."currency", OLD."platformFeeAmount", OLD."platformNetFeeAmount",
    OLD."platformRetainedAmount", OLD."sellerAmount", OLD."connectorFeeAmount",
    OLD."connectorPlatformShareAmount", OLD."connectorDeliveryAmount",
    OLD."carrierDeliveryAmount", OLD."settlementPlanId", OLD."settlementPlanVersion",
    OLD."settlementSnapshotHash", OLD."onBehalfOfStripeAccountId",
    OLD."commercialModel", OLD."businessOfRecord", OLD."processorFeePayer"
  ) IS DISTINCT FROM ROW(
    NEW."orderId", NEW."provider", NEW."kind", NEW."operationKey", NEW."amount",
    NEW."currency", NEW."platformFeeAmount", NEW."platformNetFeeAmount",
    NEW."platformRetainedAmount", NEW."sellerAmount", NEW."connectorFeeAmount",
    NEW."connectorPlatformShareAmount", NEW."connectorDeliveryAmount",
    NEW."carrierDeliveryAmount", NEW."settlementPlanId", NEW."settlementPlanVersion",
    NEW."settlementSnapshotHash", NEW."onBehalfOfStripeAccountId",
    NEW."commercialModel", NEW."businessOfRecord", NEW."processorFeePayer"
  ) THEN
    RAISE EXCEPTION 'AllwainPayment financial core cannot be changed';
  END IF;
  IF
    (OLD."stripeCheckoutSessionId" IS NOT NULL AND OLD."stripeCheckoutSessionId" IS DISTINCT FROM NEW."stripeCheckoutSessionId") OR
    (OLD."stripePaymentIntentId" IS NOT NULL AND OLD."stripePaymentIntentId" IS DISTINCT FROM NEW."stripePaymentIntentId") OR
    (OLD."stripeSetupIntentId" IS NOT NULL AND OLD."stripeSetupIntentId" IS DISTINCT FROM NEW."stripeSetupIntentId") OR
    (OLD."stripeCustomerId" IS NOT NULL AND OLD."stripeCustomerId" IS DISTINCT FROM NEW."stripeCustomerId") OR
    (OLD."stripePaymentMethodId" IS NOT NULL AND OLD."stripePaymentMethodId" IS DISTINCT FROM NEW."stripePaymentMethodId") OR
    (OLD."stripeChargeId" IS NOT NULL AND OLD."stripeChargeId" IS DISTINCT FROM NEW."stripeChargeId")
  THEN
    RAISE EXCEPTION 'Stripe payment identifiers cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION allwain_protect_locked_settlement()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AllwainSettlementPlan history cannot be deleted';
  END IF;
  IF OLD."status" IN ('checkout_locked', 'locked', 'settled', 'partially_refunded', 'refunded')
     OR NEW."status" IN ('checkout_locked', 'locked', 'settled', 'partially_refunded', 'refunded') THEN
    IF ROW(
      OLD."orderId", OLD."version", OLD."grossAmount", OLD."productAmount",
      OLD."shippingAmount", OLD."carrierDeliveryAmount", OLD."taxAmount",
      OLD."agriculturalCompensationAmount", OLD."platformFeeAmount",
      OLD."platformNetFeeAmount", OLD."platformRetainedAmount",
      OLD."connectorAmount", OLD."connectorPlatformShareAmount",
      OLD."connectorDeliveryAmount", OLD."sellerAmount", OLD."currency",
      OLD."commercialModel", OLD."businessOfRecord", OLD."formulaSnapshot",
      OLD."snapshotHash"
    ) IS DISTINCT FROM ROW(
      NEW."orderId", NEW."version", NEW."grossAmount", NEW."productAmount",
      NEW."shippingAmount", NEW."carrierDeliveryAmount", NEW."taxAmount",
      NEW."agriculturalCompensationAmount", NEW."platformFeeAmount",
      NEW."platformNetFeeAmount", NEW."platformRetainedAmount",
      NEW."connectorAmount", NEW."connectorPlatformShareAmount",
      NEW."connectorDeliveryAmount", NEW."sellerAmount", NEW."currency",
      NEW."commercialModel", NEW."businessOfRecord", NEW."formulaSnapshot",
      NEW."snapshotHash"
    ) THEN
      RAISE EXCEPTION 'Locked settlement financial terms cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
