-- Sendcloud carrier quotes and shipments are stored separately from Km0 fees.
-- A selected quote becomes immutable commercial evidence on the order.

ALTER TABLE "AllwainSellerProfile"
  ADD COLUMN "shippingPostalCode" TEXT,
  ADD COLUMN "shippingCity" TEXT,
  ADD COLUMN "shippingCountryCode" TEXT DEFAULT 'ES',
  ADD COLUMN "shippingPhone" TEXT;

ALTER TABLE "Contract"
  ADD COLUMN "carrierDeliveryAmount" INTEGER,
  ADD COLUMN "carrierQuoteId" TEXT;

ALTER TABLE "AllwainRecurringPlan"
  DROP CONSTRAINT IF EXISTS "AllwainRecurringPlan_delivery_amounts_check",
  ADD COLUMN "carrierDeliveryAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AllwainOrder"
  DROP CONSTRAINT IF EXISTS "AllwainOrder_delivery_amounts_check",
  DROP CONSTRAINT IF EXISTS "AllwainOrder_allocation_identity_check",
  ADD COLUMN "carrierDeliveryAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "carrierQuoteId" TEXT;

ALTER TABLE "AllwainPayment"
  DROP CONSTRAINT IF EXISTS "AllwainPayment_delivery_amounts_check",
  DROP CONSTRAINT IF EXISTS "AllwainPayment_allocation_identity_check",
  ADD COLUMN "carrierDeliveryAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AllwainSettlementPlan"
  DROP CONSTRAINT IF EXISTS "AllwainSettlementPlan_delivery_amounts_check",
  DROP CONSTRAINT IF EXISTS "AllwainSettlementPlan_allocation_identity_check",
  ADD COLUMN "carrierDeliveryAmount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AllwainCarrierQuote" (
  "id" TEXT NOT NULL,
  "quoteRequestId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'sendcloud',
  "status" TEXT NOT NULL DEFAULT 'quoted',
  "shippingOptionCode" TEXT NOT NULL,
  "providerContractId" INTEGER,
  "carrierCode" TEXT,
  "carrierName" TEXT,
  "serviceName" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "originAddressHash" TEXT NOT NULL,
  "destinationAddressHash" TEXT NOT NULL,
  "parcelHash" TEXT NOT NULL,
  "requirements" JSONB,
  "requestSnapshot" JSONB NOT NULL,
  "providerSnapshot" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "selectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainCarrierQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainCarrierQuote_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "AllwainCarrierQuote_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "AllwainShipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "quoteId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'sendcloud',
  "status" TEXT NOT NULL DEFAULT 'creating',
  "externalShipmentId" TEXT,
  "externalParcelId" TEXT,
  "externalReferenceId" TEXT NOT NULL,
  "shippingOptionCode" TEXT NOT NULL,
  "providerContractId" INTEGER,
  "carrierCode" TEXT,
  "carrierName" TEXT,
  "serviceName" TEXT,
  "trackingNumber" TEXT,
  "trackingUrl" TEXT,
  "quotedAmount" INTEGER NOT NULL,
  "actualCostAmount" INTEGER,
  "currency" TEXT NOT NULL,
  "announcedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastEventAt" TIMESTAMP(3),
  "providerPayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainShipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainShipment_quoted_amount_check" CHECK ("quotedAmount" >= 0),
  CONSTRAINT "AllwainShipment_actual_cost_check" CHECK ("actualCostAmount" IS NULL OR "actualCostAmount" >= 0)
);

CREATE TABLE "AllwainCarrierEvent" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'sendcloud',
  "shipmentId" TEXT,
  "orderId" TEXT,
  "action" TEXT NOT NULL,
  "externalParcelId" TEXT,
  "statusCode" TEXT,
  "statusMessage" TEXT,
  "payloadHash" TEXT NOT NULL,
  "sanitizedPayload" JSONB,
  "occurredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "AllwainCarrierEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contract_carrierQuoteId_idx" ON "Contract"("carrierQuoteId");
CREATE UNIQUE INDEX "AllwainOrder_carrierQuoteId_key" ON "AllwainOrder"("carrierQuoteId");
CREATE INDEX "AllwainCarrierQuote_buyerUserId_offerId_status_expiresAt_idx" ON "AllwainCarrierQuote"("buyerUserId", "offerId", "status", "expiresAt");
CREATE INDEX "AllwainCarrierQuote_requestFingerprint_status_expiresAt_idx" ON "AllwainCarrierQuote"("requestFingerprint", "status", "expiresAt");
CREATE INDEX "AllwainCarrierQuote_sellerUserId_createdAt_idx" ON "AllwainCarrierQuote"("sellerUserId", "createdAt");
CREATE INDEX "AllwainCarrierQuote_quoteRequestId_idx" ON "AllwainCarrierQuote"("quoteRequestId");
CREATE UNIQUE INDEX "AllwainShipment_orderId_key" ON "AllwainShipment"("orderId");
CREATE UNIQUE INDEX "AllwainShipment_externalShipmentId_key" ON "AllwainShipment"("externalShipmentId");
CREATE UNIQUE INDEX "AllwainShipment_externalReferenceId_key" ON "AllwainShipment"("externalReferenceId");
CREATE INDEX "AllwainShipment_quoteId_idx" ON "AllwainShipment"("quoteId");
CREATE INDEX "AllwainShipment_externalParcelId_idx" ON "AllwainShipment"("externalParcelId");
CREATE INDEX "AllwainShipment_status_updatedAt_idx" ON "AllwainShipment"("status", "updatedAt");
CREATE UNIQUE INDEX "AllwainCarrierEvent_eventKey_key" ON "AllwainCarrierEvent"("eventKey");
CREATE INDEX "AllwainCarrierEvent_shipmentId_receivedAt_idx" ON "AllwainCarrierEvent"("shipmentId", "receivedAt");
CREATE INDEX "AllwainCarrierEvent_orderId_receivedAt_idx" ON "AllwainCarrierEvent"("orderId", "receivedAt");
CREATE INDEX "AllwainCarrierEvent_externalParcelId_idx" ON "AllwainCarrierEvent"("externalParcelId");

ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_carrierQuoteId_fkey"
  FOREIGN KEY ("carrierQuoteId") REFERENCES "AllwainCarrierQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainShipment"
  ADD CONSTRAINT "AllwainShipment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AllwainShipment_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "AllwainCarrierQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainCarrierEvent"
  ADD CONSTRAINT "AllwainCarrierEvent_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "AllwainShipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainRecurringPlan"
  ADD CONSTRAINT "AllwainRecurringPlan_delivery_amounts_check"
  CHECK (
    "shippingAmount" >= 0 AND
    "connectorPlatformShareAmount" >= 0 AND
    "connectorDeliveryAmount" >= 0 AND
    "carrierDeliveryAmount" >= 0 AND
    "connectorDeliveryAmount" + "carrierDeliveryAmount" <= "shippingAmount" AND
    "maximumChargeAmount" >= "shippingAmount"
  );

ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_delivery_amounts_check"
  CHECK (
    "connectorPlatformShareAmount" >= 0 AND
    "connectorDeliveryAmount" >= 0 AND
    "carrierDeliveryAmount" >= 0 AND
    "connectorDeliveryAmount" + "carrierDeliveryAmount" <= "shippingAmount"
  ),
  ADD CONSTRAINT "AllwainOrder_allocation_identity_check"
  CHECK (
    "connectorFeeAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
    "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount" AND
    "totalAmount" = "sellerAmount" + "platformNetFeeAmount" + "connectorFeeAmount" + "carrierDeliveryAmount"
  );

ALTER TABLE "AllwainPayment"
  ADD CONSTRAINT "AllwainPayment_delivery_amounts_check"
  CHECK (
    "connectorPlatformShareAmount" >= 0 AND
    "connectorDeliveryAmount" >= 0 AND
    "carrierDeliveryAmount" >= 0
  ),
  ADD CONSTRAINT "AllwainPayment_allocation_identity_check"
  CHECK (
    "kind" NOT IN ('payment', 'recurring_charge') OR
    (
      "connectorFeeAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
      "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount" AND
      "amount" = "sellerAmount" + "platformNetFeeAmount" + "connectorFeeAmount" + "carrierDeliveryAmount"
    )
  );

ALTER TABLE "AllwainSettlementPlan"
  ADD CONSTRAINT "AllwainSettlementPlan_delivery_amounts_check"
  CHECK (
    "connectorPlatformShareAmount" >= 0 AND
    "connectorDeliveryAmount" >= 0 AND
    "carrierDeliveryAmount" >= 0 AND
    "platformNetFeeAmount" >= 0 AND
    "connectorDeliveryAmount" + "carrierDeliveryAmount" <= "shippingAmount"
  ),
  ADD CONSTRAINT "AllwainSettlementPlan_allocation_identity_check"
  CHECK (
    "connectorAmount" = "connectorPlatformShareAmount" + "connectorDeliveryAmount" AND
    "platformFeeAmount" = "platformNetFeeAmount" + "connectorPlatformShareAmount" AND
    "grossAmount" = "sellerAmount" + "platformNetFeeAmount" + "connectorAmount" + "carrierDeliveryAmount"
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
      OLD."carrierDeliveryAmount", OLD."carrierQuoteId",
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
      NEW."carrierDeliveryAmount", NEW."carrierQuoteId",
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
    OLD."carrierDeliveryAmount", OLD."settlementPlanId", OLD."settlementPlanVersion",
    OLD."settlementSnapshotHash", OLD."onBehalfOfStripeAccountId", OLD."processorFeePayer"
  ) IS DISTINCT FROM ROW(
    NEW."orderId", NEW."provider", NEW."kind", NEW."operationKey", NEW."amount",
    NEW."currency", NEW."platformFeeAmount", NEW."platformNetFeeAmount",
    NEW."sellerAmount", NEW."connectorFeeAmount",
    NEW."connectorPlatformShareAmount", NEW."connectorDeliveryAmount",
    NEW."carrierDeliveryAmount", NEW."settlementPlanId", NEW."settlementPlanVersion",
    NEW."settlementSnapshotHash", NEW."onBehalfOfStripeAccountId", NEW."processorFeePayer"
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
      OLD."platformNetFeeAmount", OLD."connectorAmount",
      OLD."connectorPlatformShareAmount", OLD."connectorDeliveryAmount",
      OLD."sellerAmount", OLD."currency", OLD."formulaSnapshot", OLD."snapshotHash"
    ) IS DISTINCT FROM ROW(
      NEW."orderId", NEW."version", NEW."grossAmount", NEW."productAmount",
      NEW."shippingAmount", NEW."carrierDeliveryAmount", NEW."taxAmount",
      NEW."agriculturalCompensationAmount", NEW."platformFeeAmount",
      NEW."platformNetFeeAmount", NEW."connectorAmount",
      NEW."connectorPlatformShareAmount", NEW."connectorDeliveryAmount",
      NEW."sellerAmount", NEW."currency", NEW."formulaSnapshot", NEW."snapshotHash"
    ) THEN
      RAISE EXCEPTION 'Locked settlement financial terms cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
