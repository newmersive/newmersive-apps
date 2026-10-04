-- Select the execution engine at acceptance. Historical NULL is deliberately not backfilled.
ALTER TABLE "Contract" ADD COLUMN "beneficiaryExecutionVersion" INTEGER
  CHECK ("beneficiaryExecutionVersion" IS NULL OR "beneficiaryExecutionVersion" = 1);
ALTER TABLE "AllwainOrder" ADD COLUMN "beneficiaryExecutionVersion" INTEGER
  CHECK ("beneficiaryExecutionVersion" IS NULL OR "beneficiaryExecutionVersion" = 1);
ALTER TABLE "AllwainRecurringPlan" ADD COLUMN "beneficiaryExecutionVersion" INTEGER
  CHECK ("beneficiaryExecutionVersion" IS NULL OR "beneficiaryExecutionVersion" = 1);

CREATE FUNCTION allwain_guard_beneficiary_execution_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_version INTEGER; source_found BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."beneficiaryExecutionVersion" IS DISTINCT FROM OLD."beneficiaryExecutionVersion" THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_EXECUTION_VERSION_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME = 'Contract' THEN
    IF NEW."beneficiaryExecutionVersion" IS NOT NULL AND NEW.app <> 'allwain' THEN
      RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_EXECUTION_CONTRACT_INVALID';
    END IF;
  ELSIF TG_TABLE_NAME = 'AllwainOrder' THEN
    SELECT "beneficiaryExecutionVersion" INTO source_version FROM "Contract" WHERE id = NEW."contractId";
    source_found := FOUND;
    IF (source_found AND source_version IS DISTINCT FROM NEW."beneficiaryExecutionVersion") OR
       (NOT source_found AND NEW."beneficiaryExecutionVersion" IS NOT NULL) THEN
      RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_EXECUTION_CONTRACT_MISMATCH';
    END IF;
    IF NEW."recurringPlanId" IS NOT NULL THEN
      SELECT "beneficiaryExecutionVersion" INTO source_version FROM "AllwainRecurringPlan" WHERE id = NEW."recurringPlanId";
      source_found := FOUND;
      IF (source_found AND source_version IS DISTINCT FROM NEW."beneficiaryExecutionVersion") OR
         (NOT source_found AND NEW."beneficiaryExecutionVersion" IS NOT NULL) THEN
        RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_EXECUTION_RECURRENCE_MISMATCH';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."beneficiaryExecutionVersion" IS NOT NULL AND (
      NEW."contractId" IS DISTINCT FROM OLD."contractId" OR
      (OLD."recurringPlanId" IS NOT NULL AND (NEW."recurringPlanId" IS DISTINCT FROM OLD."recurringPlanId" OR
        NEW."recurringSequence" IS DISTINCT FROM OLD."recurringSequence"))) THEN
      RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_EXECUTION_SOURCE_IMMUTABLE';
    END IF;
  ELSIF TG_TABLE_NAME = 'AllwainRecurringPlan' THEN
    SELECT "beneficiaryExecutionVersion" INTO source_version FROM "AllwainOrder" WHERE id = NEW."sourceOrderId";
    source_found := FOUND;
    IF (source_found AND source_version IS DISTINCT FROM NEW."beneficiaryExecutionVersion") OR
       (NOT source_found AND NEW."beneficiaryExecutionVersion" IS NOT NULL) THEN
      RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_EXECUTION_SOURCE_MISMATCH';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."beneficiaryExecutionVersion" IS NOT NULL AND
      NEW."sourceOrderId" IS DISTINCT FROM OLD."sourceOrderId" THEN
      RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_EXECUTION_SOURCE_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_contract_beneficiary_execution_version
  BEFORE INSERT OR UPDATE ON "Contract" FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_execution_version();
CREATE TRIGGER allwain_order_beneficiary_execution_version
  BEFORE INSERT OR UPDATE ON "AllwainOrder" FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_execution_version();
CREATE TRIGGER allwain_recurring_beneficiary_execution_version
  BEFORE INSERT OR UPDATE ON "AllwainRecurringPlan" FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_execution_version();

-- Planning snapshots and allocation rows retain their original not_enabled evidence.
-- The separate immutable order version authorizes which future engine may use them.
ALTER TABLE "AllwainTransfer" ADD COLUMN "beneficiaryAllocationId" TEXT;
ALTER TABLE "AllwainTransfer" ADD CONSTRAINT "AllwainTransfer_beneficiaryAllocationId_fkey"
  FOREIGN KEY ("beneficiaryAllocationId") REFERENCES "AllwainBeneficiaryAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "AllwainTransfer_beneficiaryAllocationId_key" ON "AllwainTransfer"("beneficiaryAllocationId");

CREATE FUNCTION allwain_guard_beneficiary_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_order "AllwainOrder"%ROWTYPE; allocation "AllwainBeneficiaryAllocation"%ROWTYPE;
  settlement "AllwainSettlementPlan"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."beneficiaryAllocationId" IS DISTINCT FROM OLD."beneficiaryAllocationId" THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANSFER_ALLOCATION_IMMUTABLE';
  END IF;
  SELECT * INTO source_order FROM "AllwainOrder" WHERE id = NEW."orderId";
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANSFER_ORDER_MISSING'; END IF;
  IF source_order."beneficiaryExecutionVersion" IS NULL THEN
    IF NEW."beneficiaryAllocationId" IS NOT NULL THEN RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANSFER_ENGINE_MISMATCH'; END IF;
    RETURN NEW;
  END IF;
  IF source_order."beneficiaryExecutionVersion" <> 1 OR NEW."beneficiaryAllocationId" IS NULL THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANSFER_ENGINE_MISMATCH';
  END IF;
  SELECT * INTO allocation FROM "AllwainBeneficiaryAllocation" WHERE id = NEW."beneficiaryAllocationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANSFER_ALLOCATION_MISSING'; END IF;
  SELECT * INTO settlement FROM "AllwainSettlementPlan" WHERE id = allocation."settlementPlanId";
  IF NOT FOUND OR settlement."orderId" IS DISTINCT FROM NEW."orderId" OR
     settlement."snapshotHash" IS DISTINCT FROM source_order."settlementSnapshotHash" OR
     settlement.version IS DISTINCT FROM source_order."settlementPlanVersion" OR
     settlement."formulaSnapshot"->'beneficiaryExecutionVersion' IS DISTINCT FROM '1'::JSONB OR
     settlement."beneficiarySnapshotHash" IS DISTINCT FROM allocation."beneficiarySnapshotHash" OR
     allocation."recipientUserId" IS DISTINCT FROM NEW."recipientUserId" OR
     allocation.kind IS DISTINCT FROM NEW."recipientRole" OR allocation.kind NOT IN ('seller', 'referral', 'local_delivery') OR
     allocation.currency IS DISTINCT FROM NEW.currency OR NEW.currency IS DISTINCT FROM source_order.currency OR
     NEW.amount <= 0 OR NEW.amount > allocation.amount THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANSFER_ALLOCATION_MISMATCH';
  END IF;
  IF NEW."paymentId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "AllwainPayment" WHERE id = NEW."paymentId" AND "orderId" = NEW."orderId" AND
      kind IN ('payment', 'deferred_charge', 'recurring_charge') AND currency = NEW.currency AND
      "settlementPlanId" = settlement.id AND "settlementPlanVersion" = settlement.version AND
      "settlementSnapshotHash" = settlement."snapshotHash"
  ) THEN RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANSFER_PAYMENT_MISMATCH'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_beneficiary_transfer_guard BEFORE INSERT OR UPDATE ON "AllwainTransfer"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_transfer();

CREATE TABLE "AllwainBeneficiaryRecovery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "transferId" TEXT NOT NULL REFERENCES "AllwainTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reason" TEXT NOT NULL CHECK ("reason" IN ('refund', 'dispute')),
  "referenceId" TEXT NOT NULL CHECK (length("referenceId") BETWEEN 1 AND 220 AND btrim("referenceId") = "referenceId"),
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "idempotencyKey" TEXT NOT NULL,
  "requestSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("requestSnapshot") = 'object'),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stripeReversalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "executionToken" TEXT,
  "executionLeaseUntil" TIMESTAMP(3),
  "failureCode" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AllwainBeneficiaryRecovery_idempotencyKey_key" ON "AllwainBeneficiaryRecovery"("idempotencyKey");
CREATE UNIQUE INDEX "AllwainBeneficiaryRecovery_stripeReversalId_key" ON "AllwainBeneficiaryRecovery"("stripeReversalId");
CREATE UNIQUE INDEX "AllwainBeneficiaryRecovery_transferId_reason_referenceId_key"
  ON "AllwainBeneficiaryRecovery"("transferId", "reason", "referenceId");
CREATE INDEX "AllwainBeneficiaryRecovery_status_executionLeaseUntil_idx"
  ON "AllwainBeneficiaryRecovery"("status", "executionLeaseUntil");

CREATE FUNCTION allwain_guard_beneficiary_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE transfer "AllwainTransfer"%ROWTYPE; allocation "AllwainBeneficiaryAllocation"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RECOVERY_IMMUTABLE'; END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW."transferId" IS DISTINCT FROM OLD."transferId" OR
    NEW.reason IS DISTINCT FROM OLD.reason OR NEW."referenceId" IS DISTINCT FROM OLD."referenceId" OR
    NEW.amount IS DISTINCT FROM OLD.amount OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
    NEW."requestSnapshot" IS DISTINCT FROM OLD."requestSnapshot" OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt") THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RECOVERY_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."stripeReversalId" IS NOT NULL AND
    NEW."stripeReversalId" IS DISTINCT FROM OLD."stripeReversalId" THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RECOVERY_PROVIDER_ID_IMMUTABLE';
  END IF;
  SELECT * INTO transfer FROM "AllwainTransfer" WHERE id = NEW."transferId";
  IF NOT FOUND OR transfer."beneficiaryAllocationId" IS NULL OR transfer."stripeTransferId" IS NULL OR NEW.amount > transfer.amount THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RECOVERY_TRANSFER_INVALID';
  END IF;
  SELECT * INTO allocation FROM "AllwainBeneficiaryAllocation" WHERE id = transfer."beneficiaryAllocationId";
  IF NOT FOUND OR NEW."requestSnapshot"->'amount' IS DISTINCT FROM to_jsonb(NEW.amount) OR
    NEW."requestSnapshot"->>'transferId' IS DISTINCT FROM transfer."stripeTransferId" OR
    NEW."requestSnapshot"->'metadata'->>'allocationId' IS DISTINCT FROM allocation.id OR
    NEW."requestSnapshot"->'metadata'->>'paymentId' IS DISTINCT FROM transfer."paymentId" OR
    NEW."requestSnapshot"->'metadata'->>'orderId' IS DISTINCT FROM transfer."orderId" OR
    NEW."requestSnapshot"->'metadata'->>'referenceId' IS DISTINCT FROM NEW."referenceId" OR
    NEW."requestSnapshot"->'metadata'->>'beneficiarySnapshotHash' IS DISTINCT FROM allocation."beneficiarySnapshotHash" OR
    NEW."requestSnapshot"->'metadata'->>'scope' IS DISTINCT FROM ('allwain_beneficiary_' || NEW.reason) THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RECOVERY_REQUEST_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_beneficiary_recovery_guard BEFORE INSERT OR UPDATE OR DELETE ON "AllwainBeneficiaryRecovery"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_recovery();
