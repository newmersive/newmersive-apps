-- Separate the connector's network incentive from the price of a Km0 delivery.
-- Existing orders retain their original commercial terms: historical connector
-- amounts are treated as network incentives and receive no delivery surcharge.

ALTER TABLE "Contract"
  ADD COLUMN "shippingAmount" INTEGER,
  ADD COLUMN "platformNetFeeAmount" INTEGER,
  ADD COLUMN "connectorFeeAmount" INTEGER,
  ADD COLUMN "connectorPlatformShareAmount" INTEGER,
  ADD COLUMN "connectorDeliveryAmount" INTEGER,
  ADD COLUMN "deliveryPricingSnapshot" JSONB;

UPDATE "Contract"
SET
  "shippingAmount" = COALESCE("shippingAmount", 0),
  "connectorFeeAmount" = COALESCE("connectorFeeAmount", 0),
  "connectorPlatformShareAmount" = COALESCE("connectorPlatformShareAmount", "connectorFeeAmount", 0),
  "connectorDeliveryAmount" = COALESCE("connectorDeliveryAmount", 0),
  "platformNetFeeAmount" = COALESCE(
    "platformNetFeeAmount",
    GREATEST(COALESCE("platformFeeAmount", 0) - COALESCE("connectorFeeAmount", 0), 0)
  )
WHERE "app" = 'allwain';

ALTER TABLE "AllwainRecurringPlan"
  ADD COLUMN "shippingAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "connectorPlatformShareAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "connectorDeliveryAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AllwainOrder"
  DROP CONSTRAINT IF EXISTS "AllwainOrder_allocation_identity_check",
  ADD COLUMN "connectorPlatformShareAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "connectorDeliveryAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryPricingSnapshot" JSONB;

UPDATE "AllwainOrder"
SET
  "connectorPlatformShareAmount" = "connectorFeeAmount",
  "connectorDeliveryAmount" = 0;

ALTER TABLE "AllwainPayment"
  DROP CONSTRAINT IF EXISTS "AllwainPayment_allocation_identity_check",
  ADD COLUMN "connectorPlatformShareAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "connectorDeliveryAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "AllwainPayment"
SET
  "connectorPlatformShareAmount" = "connectorFeeAmount",
  "connectorDeliveryAmount" = 0;

ALTER TABLE "AllwainDeliveryAssignment"
  ADD COLUMN "networkBonusAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "AllwainDeliveryAssignment"
SET
  "networkBonusAmount" = "feeAmount",
  "feeAmount" = 0;

ALTER TABLE "AllwainSettlementPlan"
  DROP CONSTRAINT IF EXISTS "AllwainSettlementPlan_allocation_identity_check",
  ADD COLUMN "connectorPlatformShareAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "connectorDeliveryAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "platformNetFeeAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "AllwainSettlementPlan"
SET
  "connectorPlatformShareAmount" = "connectorAmount",
  "connectorDeliveryAmount" = 0,
  "platformNetFeeAmount" = "platformFeeAmount" - "connectorAmount";

ALTER TABLE "AllwainRecurringPlan"
  ADD CONSTRAINT "AllwainRecurringPlan_delivery_amounts_check"
  CHECK (
    "shippingAmount" >= 0 AND
    "connectorPlatformShareAmount" >= 0 AND
    "connectorDeliveryAmount" >= 0 AND
    "connectorDeliveryAmount" <= "shippingAmount" AND
    "maximumChargeAmount" >= "shippingAmount"
  );

ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_delivery_amounts_check"
  CHECK (
    "connectorPlatformShareAmount" >= 0 AND
    "connectorDeliveryAmount" >= 0 AND
    "connectorDeliveryAmount" <= "shippingAmount"
  ),
  ADD CONSTRAINT "AllwainOrder_allocation_identity_check"
  CHECK (
    "connectorFeeAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
    "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount" AND
    "totalAmount" = "sellerAmount" + "platformNetFeeAmount" + "connectorFeeAmount"
  );

ALTER TABLE "AllwainPayment"
  ADD CONSTRAINT "AllwainPayment_delivery_amounts_check"
  CHECK (
    "connectorPlatformShareAmount" >= 0 AND
    "connectorDeliveryAmount" >= 0
  ),
  ADD CONSTRAINT "AllwainPayment_allocation_identity_check"
  CHECK (
    "kind" NOT IN ('payment', 'recurring_charge') OR
    (
      "connectorFeeAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
      "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount" AND
      "amount" = "sellerAmount" + "platformNetFeeAmount" + "connectorFeeAmount"
    )
  );

ALTER TABLE "AllwainDeliveryAssignment"
  ADD CONSTRAINT "AllwainDeliveryAssignment_fee_components_check"
  CHECK ("feeAmount" >= 0 AND "networkBonusAmount" >= 0);

ALTER TABLE "AllwainSettlementPlan"
  ADD CONSTRAINT "AllwainSettlementPlan_delivery_amounts_check"
  CHECK (
    "connectorPlatformShareAmount" >= 0 AND
    "connectorDeliveryAmount" >= 0 AND
    "platformNetFeeAmount" >= 0 AND
    "connectorDeliveryAmount" <= "shippingAmount"
  ),
  ADD CONSTRAINT "AllwainSettlementPlan_allocation_identity_check"
  CHECK (
    "connectorAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
    "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount" AND
    "grossAmount" = "sellerAmount" + "platformNetFeeAmount" + "connectorAmount"
  );

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
      OLD."taxAmount", OLD."agriculturalCompensationAmount", OLD."totalAmount",
      OLD."currency", OLD."platformFeeBps", OLD."platformFeeAmount",
      OLD."platformNetFeeAmount", OLD."connectorFeeAmount",
      OLD."connectorPlatformShareAmount", OLD."connectorDeliveryAmount",
      OLD."sellerAmount", OLD."deliveryPricingSnapshot",
      OLD."paymentArchitecture", OLD."businessOfRecord",
      OLD."processorFeePayer", OLD."legalSellerUserId"
    ) IS DISTINCT FROM ROW(
      NEW."contractId", NEW."offerId", NEW."buyerUserId", NEW."sellerUserId",
      NEW."paymentMode", NEW."preorderChargeDeadlineAt", NEW."quantity", NEW."unit",
      NEW."unitPriceAmount", NEW."subtotalAmount", NEW."shippingAmount",
      NEW."taxAmount", NEW."agriculturalCompensationAmount", NEW."totalAmount",
      NEW."currency", NEW."platformFeeBps", NEW."platformFeeAmount",
      NEW."platformNetFeeAmount", NEW."connectorFeeAmount",
      NEW."connectorPlatformShareAmount", NEW."connectorDeliveryAmount",
      NEW."sellerAmount", NEW."deliveryPricingSnapshot",
      NEW."paymentArchitecture", NEW."businessOfRecord",
      NEW."processorFeePayer", NEW."legalSellerUserId"
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
    OLD."sellerAmount", OLD."connectorFeeAmount",
    OLD."connectorPlatformShareAmount", OLD."connectorDeliveryAmount",
    OLD."settlementPlanId", OLD."settlementPlanVersion", OLD."settlementSnapshotHash",
    OLD."onBehalfOfStripeAccountId", OLD."processorFeePayer"
  ) IS DISTINCT FROM ROW(
    NEW."orderId", NEW."provider", NEW."kind", NEW."operationKey", NEW."amount",
    NEW."currency", NEW."platformFeeAmount", NEW."platformNetFeeAmount",
    NEW."sellerAmount", NEW."connectorFeeAmount",
    NEW."connectorPlatformShareAmount", NEW."connectorDeliveryAmount",
    NEW."settlementPlanId", NEW."settlementPlanVersion", NEW."settlementSnapshotHash",
    NEW."onBehalfOfStripeAccountId", NEW."processorFeePayer"
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
      OLD."shippingAmount", OLD."taxAmount", OLD."agriculturalCompensationAmount",
      OLD."platformFeeAmount", OLD."platformNetFeeAmount", OLD."connectorAmount",
      OLD."connectorPlatformShareAmount", OLD."connectorDeliveryAmount",
      OLD."sellerAmount", OLD."currency", OLD."formulaSnapshot", OLD."snapshotHash"
    ) IS DISTINCT FROM ROW(
      NEW."orderId", NEW."version", NEW."grossAmount", NEW."productAmount",
      NEW."shippingAmount", NEW."taxAmount", NEW."agriculturalCompensationAmount",
      NEW."platformFeeAmount", NEW."platformNetFeeAmount", NEW."connectorAmount",
      NEW."connectorPlatformShareAmount", NEW."connectorDeliveryAmount",
      NEW."sellerAmount", NEW."currency", NEW."formulaSnapshot", NEW."snapshotHash"
    ) THEN
      RAISE EXCEPTION 'Locked settlement financial terms cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
