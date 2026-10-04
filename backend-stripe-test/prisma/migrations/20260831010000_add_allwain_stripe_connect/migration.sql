ALTER TABLE "Contract"
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "subtotalAmount" INTEGER,
  ADD COLUMN "platformFeeBps" INTEGER,
  ADD COLUMN "platformFeeAmount" INTEGER,
  ADD COLUMN "sellerAmount" INTEGER,
  ADD COLUMN "paymentMode" TEXT,
  ADD COLUMN "paymentStatus" TEXT,
  ADD COLUMN "deliveryMethod" TEXT,
  ADD COLUMN "deliveryAddress" JSONB,
  ADD COLUMN "deliveryNotes" TEXT;

UPDATE "Contract"
SET
  "currency" = 'eur',
  "subtotalAmount" = ROUND("totalPrice" * 100)::INTEGER,
  "platformFeeBps" = 1000,
  "platformFeeAmount" = ROUND("totalPrice" * 10)::INTEGER,
  "sellerAmount" = ROUND("totalPrice" * 100)::INTEGER - ROUND("totalPrice" * 10)::INTEGER,
  "paymentMode" = 'immediate',
  "paymentStatus" = CASE
    WHEN "status" = 'accepted' THEN 'legacy_confirmed'
    ELSE 'awaiting_agreement'
  END
WHERE "app" = 'allwain' AND "totalPrice" IS NOT NULL;

CREATE TABLE "AllwainSellerPaymentAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "stripeAccountId" TEXT,
  "country" TEXT NOT NULL DEFAULT 'ES',
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "status" TEXT NOT NULL DEFAULT 'not_started',
  "transfersEnabled" BOOLEAN NOT NULL DEFAULT false,
  "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "requirements" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainSellerPaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllwainBuyerPaymentProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainBuyerPaymentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllwainOrder" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "paymentMode" TEXT NOT NULL DEFAULT 'immediate',
  "status" TEXT NOT NULL DEFAULT 'awaiting_seller',
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPriceAmount" INTEGER NOT NULL,
  "subtotalAmount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "platformFeeBps" INTEGER NOT NULL,
  "platformFeeAmount" INTEGER NOT NULL,
  "sellerAmount" INTEGER NOT NULL,
  "inventoryStatus" TEXT NOT NULL DEFAULT 'reserved',
  "deliveryMethod" TEXT,
  "deliveryAddress" JSONB,
  "deliveryNotes" TEXT,
  "reservationConsentAt" TIMESTAMP(3),
  "reservationExpiresAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllwainPayment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "kind" TEXT NOT NULL DEFAULT 'payment',
  "status" TEXT NOT NULL DEFAULT 'created',
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "platformFeeAmount" INTEGER NOT NULL,
  "sellerAmount" INTEGER NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "stripeSetupIntentId" TEXT,
  "stripeCustomerId" TEXT,
  "stripePaymentMethodId" TEXT,
  "stripeChargeId" TEXT,
  "stripeTransferId" TEXT,
  "checkoutSessionExpiresAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "refundedAmount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllwainOrderStatusEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "actorUserId" TEXT,
  "source" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainOrderStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllwainStripeEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "livemode" BOOLEAN NOT NULL,
  "accountId" TEXT,
  "error" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "AllwainStripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainSellerPaymentAccount_userId_key" ON "AllwainSellerPaymentAccount"("userId");
CREATE UNIQUE INDEX "AllwainSellerPaymentAccount_stripeAccountId_key" ON "AllwainSellerPaymentAccount"("stripeAccountId");
CREATE INDEX "AllwainSellerPaymentAccount_status_updatedAt_idx" ON "AllwainSellerPaymentAccount"("status", "updatedAt");
CREATE UNIQUE INDEX "AllwainBuyerPaymentProfile_userId_key" ON "AllwainBuyerPaymentProfile"("userId");
CREATE UNIQUE INDEX "AllwainBuyerPaymentProfile_stripeCustomerId_key" ON "AllwainBuyerPaymentProfile"("stripeCustomerId");
CREATE UNIQUE INDEX "AllwainOrder_contractId_key" ON "AllwainOrder"("contractId");
CREATE INDEX "AllwainOrder_buyerUserId_createdAt_idx" ON "AllwainOrder"("buyerUserId", "createdAt");
CREATE INDEX "AllwainOrder_sellerUserId_createdAt_idx" ON "AllwainOrder"("sellerUserId", "createdAt");
CREATE INDEX "AllwainOrder_status_createdAt_idx" ON "AllwainOrder"("status", "createdAt");
CREATE INDEX "AllwainOrder_offerId_status_idx" ON "AllwainOrder"("offerId", "status");
CREATE UNIQUE INDEX "AllwainPayment_stripeCheckoutSessionId_key" ON "AllwainPayment"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "AllwainPayment_stripePaymentIntentId_key" ON "AllwainPayment"("stripePaymentIntentId");
CREATE UNIQUE INDEX "AllwainPayment_stripeSetupIntentId_key" ON "AllwainPayment"("stripeSetupIntentId");
CREATE INDEX "AllwainPayment_orderId_createdAt_idx" ON "AllwainPayment"("orderId", "createdAt");
CREATE INDEX "AllwainPayment_status_createdAt_idx" ON "AllwainPayment"("status", "createdAt");
CREATE INDEX "AllwainPayment_stripeCustomerId_idx" ON "AllwainPayment"("stripeCustomerId");
CREATE INDEX "AllwainOrderStatusEvent_orderId_createdAt_idx" ON "AllwainOrderStatusEvent"("orderId", "createdAt");
CREATE INDEX "AllwainOrderStatusEvent_toStatus_createdAt_idx" ON "AllwainOrderStatusEvent"("toStatus", "createdAt");
CREATE UNIQUE INDEX "AllwainStripeEvent_providerEventId_key" ON "AllwainStripeEvent"("providerEventId");
CREATE INDEX "AllwainStripeEvent_status_createdAt_idx" ON "AllwainStripeEvent"("status", "createdAt");
CREATE INDEX "AllwainStripeEvent_type_createdAt_idx" ON "AllwainStripeEvent"("type", "createdAt");
