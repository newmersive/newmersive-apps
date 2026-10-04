-- Payment and fulfilment are separate dimensions. This prevents late Stripe
-- events from moving a delivered order backwards through the user workflow.
ALTER TABLE "AllwainOrder"
  ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "disputeStatus" TEXT,
  ADD COLUMN "transferStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "readyAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3);

UPDATE "AllwainOrder"
SET "paymentStatus" = CASE
  WHEN "status" IN ('paid', 'preparing', 'ready', 'dispatched', 'delivered', 'completed') THEN 'paid'
  WHEN "status" IN ('refund_pending', 'partially_refunded', 'refunded', 'disputed') THEN "status"
  WHEN "status" = 'legacy_confirmed' THEN 'legacy_confirmed'
  WHEN "status" = 'payment_method_saved' THEN 'payment_method_saved'
  WHEN "status" IN ('checkout_open', 'payment_processing', 'payment_failed', 'payment_canceled', 'requires_customer_action') THEN "status"
  WHEN "status" = 'canceled' THEN 'canceled'
  ELSE 'awaiting_payment'
END,
"fulfillmentStatus" = CASE
  WHEN "status" IN ('preparing', 'ready', 'dispatched', 'delivered', 'completed') THEN "status"
  WHEN "status" IN ('paid', 'partially_refunded', 'refund_pending') THEN 'pending'
  ELSE 'not_started'
END,
"transferStatus" = CASE
  WHEN "status" IN ('paid', 'preparing', 'ready', 'dispatched', 'delivered', 'completed', 'partially_refunded', 'refund_pending', 'refunded') THEN 'unknown'
  ELSE 'not_started'
END;

CREATE INDEX "AllwainOrder_paymentStatus_createdAt_idx"
  ON "AllwainOrder"("paymentStatus", "createdAt");
CREATE INDEX "AllwainOrder_fulfillmentStatus_createdAt_idx"
  ON "AllwainOrder"("fulfillmentStatus", "createdAt");
CREATE INDEX "AllwainOrder_disputeStatus_createdAt_idx"
  ON "AllwainOrder"("disputeStatus", "createdAt");

ALTER TABLE "AllwainPayment"
  ADD COLUMN "operationKey" TEXT,
  ADD COLUMN "stripeRefundId" TEXT,
  ADD COLUMN "transferStatus" TEXT NOT NULL DEFAULT 'not_started';

CREATE UNIQUE INDEX "AllwainPayment_operationKey_key" ON "AllwainPayment"("operationKey");
CREATE UNIQUE INDEX "AllwainPayment_stripeRefundId_key" ON "AllwainPayment"("stripeRefundId");

CREATE TABLE "AllwainDispute" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT,
  "stripeDisputeId" TEXT NOT NULL,
  "stripeChargeId" TEXT,
  "status" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT,
  "evidenceDueAt" TIMESTAMP(3),
  "balanceTransactionId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "AllwainDispute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainDispute_stripeDisputeId_key" ON "AllwainDispute"("stripeDisputeId");
CREATE INDEX "AllwainDispute_orderId_createdAt_idx" ON "AllwainDispute"("orderId", "createdAt");
CREATE INDEX "AllwainDispute_status_createdAt_idx" ON "AllwainDispute"("status", "createdAt");

CREATE TABLE "AllwainSellerPayout" (
  "id" TEXT NOT NULL,
  "sellerUserId" TEXT,
  "stripeAccountId" TEXT NOT NULL,
  "stripePayoutId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "arrivalAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "destinationSummary" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainSellerPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainSellerPayout_stripePayoutId_key" ON "AllwainSellerPayout"("stripePayoutId");
CREATE INDEX "AllwainSellerPayout_sellerUserId_createdAt_idx" ON "AllwainSellerPayout"("sellerUserId", "createdAt");
CREATE INDEX "AllwainSellerPayout_stripeAccountId_createdAt_idx" ON "AllwainSellerPayout"("stripeAccountId", "createdAt");
CREATE INDEX "AllwainSellerPayout_status_createdAt_idx" ON "AllwainSellerPayout"("status", "createdAt");

CREATE TABLE "AllwainAuditEvent" (
  "id" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "orderId" TEXT,
  "sequence" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorRole" TEXT,
  "source" TEXT NOT NULL,
  "requestId" TEXT,
  "providerEventId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  "previousHash" TEXT,
  "eventHash" TEXT NOT NULL,
  "hashAlgorithm" TEXT NOT NULL DEFAULT 'hmac-sha256',
  CONSTRAINT "AllwainAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainAuditEvent_eventHash_key" ON "AllwainAuditEvent"("eventHash");
CREATE UNIQUE INDEX "AllwainAuditEvent_aggregateType_aggregateId_sequence_key"
  ON "AllwainAuditEvent"("aggregateType", "aggregateId", "sequence");
CREATE INDEX "AllwainAuditEvent_orderId_occurredAt_idx" ON "AllwainAuditEvent"("orderId", "occurredAt");
CREATE INDEX "AllwainAuditEvent_aggregateType_aggregateId_occurredAt_idx"
  ON "AllwainAuditEvent"("aggregateType", "aggregateId", "occurredAt");
CREATE INDEX "AllwainAuditEvent_eventType_occurredAt_idx" ON "AllwainAuditEvent"("eventType", "occurredAt");
CREATE INDEX "AllwainAuditEvent_providerEventId_idx" ON "AllwainAuditEvent"("providerEventId");

-- The application role can append audit entries but cannot rewrite history.
CREATE OR REPLACE FUNCTION allwain_reject_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AllwainAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainAuditEvent_immutable_update"
BEFORE UPDATE ON "AllwainAuditEvent"
FOR EACH ROW EXECUTE FUNCTION allwain_reject_audit_mutation();

CREATE TRIGGER "AllwainAuditEvent_immutable_delete"
BEFORE DELETE ON "AllwainAuditEvent"
FOR EACH ROW EXECUTE FUNCTION allwain_reject_audit_mutation();
