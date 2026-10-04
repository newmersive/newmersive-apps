-- Technical observation state starts without historical provider evidence.
-- The immutable movements below are created only from newly verified facts.
ALTER TABLE "AllwainDispute"
  ADD COLUMN "accountingRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("accountingRevision" >= 0),
  ADD COLUMN "accountingStateHash" TEXT CHECK ("accountingStateHash" IS NULL OR "accountingStateHash" ~ '^[0-9a-f]{64}$'),
  ADD COLUMN "accountingStatus" TEXT NOT NULL DEFAULT 'unobserved',
  ADD COLUMN "accountingObservedAt" TIMESTAMP(3),
  ADD COLUMN "accountingRetryAfter" TIMESTAMP(3),
  ADD COLUMN "accountingFailureCode" TEXT;
CREATE INDEX "AllwainDispute_accountingRetryAfter_accountingStatus_idx"
  ON "AllwainDispute"("accountingRetryAfter", "accountingStatus");

CREATE TABLE "AllwainDisputeBalanceMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "disputeId" TEXT NOT NULL REFERENCES "AllwainDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "orderId" TEXT NOT NULL REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentId" TEXT NOT NULL REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "stripeAccountId" TEXT NOT NULL CHECK (length("stripeAccountId") BETWEEN 1 AND 255 AND btrim("stripeAccountId") = "stripeAccountId"),
  "stripeBalanceTransactionId" TEXT NOT NULL CHECK (length("stripeBalanceTransactionId") BETWEEN 1 AND 255 AND btrim("stripeBalanceTransactionId") = "stripeBalanceTransactionId"),
  "stripeMode" TEXT NOT NULL DEFAULT 'test' CHECK ("stripeMode" = 'test'),
  "currency" TEXT NOT NULL CHECK ("currency" ~ '^[a-z]{3}$'),
  "amount" INTEGER NOT NULL,
  "fee" INTEGER NOT NULL,
  "net" INTEGER NOT NULL,
  "reportingCategory" TEXT NOT NULL CHECK ("reportingCategory" IN ('dispute', 'dispute_reversal')),
  "sourceSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("sourceSnapshot") = 'object'),
  "snapshotHash" TEXT NOT NULL CHECK ("snapshotHash" ~ '^[0-9a-f]{64}$'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainDisputeBalanceMovement_net_check" CHECK ("amount"::BIGINT - "fee"::BIGINT = "net"::BIGINT),
  CONSTRAINT "AllwainDisputeBalanceMovement_principal_check" CHECK (
    ("reportingCategory" = 'dispute' AND "amount" < 0) OR
    ("reportingCategory" = 'dispute_reversal' AND "amount" > 0)
  )
);
CREATE UNIQUE INDEX "AllwainDisputeBalanceMovement_account_transaction_key"
  ON "AllwainDisputeBalanceMovement"("stripeAccountId", "stripeBalanceTransactionId");
CREATE INDEX "AllwainDisputeBalanceMovement_disputeId_createdAt_idx"
  ON "AllwainDisputeBalanceMovement"("disputeId", "createdAt");
CREATE INDEX "AllwainDisputeBalanceMovement_orderId_createdAt_idx"
  ON "AllwainDisputeBalanceMovement"("orderId", "createdAt");
CREATE INDEX "AllwainDisputeBalanceMovement_paymentId_createdAt_idx"
  ON "AllwainDisputeBalanceMovement"("paymentId", "createdAt");

CREATE FUNCTION allwain_guard_dispute_balance_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dispute "AllwainDispute"%ROWTYPE;
  payment "AllwainPayment"%ROWTYPE;
  source_order "AllwainOrder"%ROWTYPE;
  source_created NUMERIC;
  source_available_on NUMERIC;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'ALLWAIN_DISPUTE_BALANCE_MOVEMENT_IMMUTABLE';
  END IF;
  SELECT * INTO dispute FROM "AllwainDispute" WHERE id = NEW."disputeId";
  IF NOT FOUND OR dispute."orderId" IS DISTINCT FROM NEW."orderId" OR
     dispute."paymentId" IS DISTINCT FROM NEW."paymentId" OR dispute.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'ALLWAIN_DISPUTE_BALANCE_MOVEMENT_DISPUTE_MISMATCH';
  END IF;
  SELECT * INTO payment FROM "AllwainPayment" WHERE id = NEW."paymentId";
  IF NOT FOUND OR payment."orderId" IS DISTINCT FROM NEW."orderId" OR payment.currency IS DISTINCT FROM NEW.currency OR
     payment."stripeChargeId" IS NULL OR payment."stripePaymentIntentId" IS NULL OR
     dispute."stripeChargeId" IS DISTINCT FROM payment."stripeChargeId" THEN
    RAISE EXCEPTION 'ALLWAIN_DISPUTE_BALANCE_MOVEMENT_PAYMENT_MISMATCH';
  END IF;
  SELECT * INTO source_order FROM "AllwainOrder" WHERE id = NEW."orderId";
  IF NOT FOUND OR source_order.currency IS DISTINCT FROM NEW.currency OR
     source_order."beneficiaryExecutionVersion" IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'ALLWAIN_DISPUTE_BALANCE_MOVEMENT_ORDER_MISMATCH';
  END IF;
  IF NEW."sourceSnapshot"->>'stripeAccountId' IS DISTINCT FROM NEW."stripeAccountId" OR
     NEW."sourceSnapshot"->>'stripeMode' IS DISTINCT FROM NEW."stripeMode" OR
     NEW."sourceSnapshot"->>'stripeDisputeId' IS DISTINCT FROM dispute."stripeDisputeId" OR
     NEW."sourceSnapshot"->>'stripeChargeId' IS DISTINCT FROM payment."stripeChargeId" OR
     NEW."sourceSnapshot"->>'stripePaymentIntentId' IS DISTINCT FROM payment."stripePaymentIntentId" OR
     NEW."sourceSnapshot"->>'stripeBalanceTransactionId' IS DISTINCT FROM NEW."stripeBalanceTransactionId" OR
     NEW."sourceSnapshot"->>'currency' IS DISTINCT FROM NEW.currency OR
     NEW."sourceSnapshot"->'amount' IS DISTINCT FROM to_jsonb(NEW.amount) OR
     NEW."sourceSnapshot"->'fee' IS DISTINCT FROM to_jsonb(NEW.fee) OR
     NEW."sourceSnapshot"->'net' IS DISTINCT FROM to_jsonb(NEW.net) OR
     NEW."sourceSnapshot"->>'reportingCategory' IS DISTINCT FROM NEW."reportingCategory" OR
     jsonb_typeof(NEW."sourceSnapshot"->'feeDetails') IS DISTINCT FROM 'array' OR
     jsonb_typeof(NEW."sourceSnapshot"->'created') IS DISTINCT FROM 'number' OR
     jsonb_typeof(NEW."sourceSnapshot"->'availableOn') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'ALLWAIN_DISPUTE_BALANCE_MOVEMENT_SNAPSHOT_MISMATCH';
  END IF;
  source_created := (NEW."sourceSnapshot"->>'created')::NUMERIC;
  source_available_on := (NEW."sourceSnapshot"->>'availableOn')::NUMERIC;
  IF source_created <= 0 OR trunc(source_created) <> source_created OR
     source_available_on <= 0 OR trunc(source_available_on) <> source_available_on THEN
    RAISE EXCEPTION 'ALLWAIN_DISPUTE_BALANCE_MOVEMENT_SNAPSHOT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_dispute_balance_movement_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "AllwainDisputeBalanceMovement"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_dispute_balance_movement();

-- A nullable link preserves historical ledger entries without reconstructing
-- evidence. New linked entries must describe their exact immutable movement.
ALTER TABLE "AllwainLedgerEntry" ADD COLUMN "disputeBalanceMovementId" TEXT;
ALTER TABLE "AllwainLedgerEntry" ADD CONSTRAINT "AllwainLedgerEntry_disputeBalanceMovementId_fkey"
  FOREIGN KEY ("disputeBalanceMovementId") REFERENCES "AllwainDisputeBalanceMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AllwainLedgerEntry_disputeBalanceMovementId_idx"
  ON "AllwainLedgerEntry"("disputeBalanceMovementId");

CREATE FUNCTION allwain_guard_dispute_balance_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement "AllwainDisputeBalanceMovement"%ROWTYPE;
BEGIN
  IF NEW."disputeBalanceMovementId" IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO movement FROM "AllwainDisputeBalanceMovement" WHERE id = NEW."disputeBalanceMovementId";
  IF NOT FOUND OR NEW."orderId" IS DISTINCT FROM movement."orderId" OR
     NEW."paymentId" IS DISTINCT FROM movement."paymentId" OR NEW.currency IS DISTINCT FROM movement.currency OR
     NEW."referenceType" IS DISTINCT FROM 'dispute_balance' OR
     NEW."referenceId" IS DISTINCT FROM movement."stripeBalanceTransactionId" THEN
    RAISE EXCEPTION 'ALLWAIN_DISPUTE_BALANCE_LEDGER_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_dispute_balance_ledger_guard BEFORE INSERT ON "AllwainLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_dispute_balance_ledger();
