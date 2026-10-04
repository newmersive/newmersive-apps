-- An original beneficiary transfer remains sequence zero. Later immutable rows
-- represent won-dispute restorations and keep every Stripe transfer addressable.
ALTER TABLE "AllwainTransfer"
  ADD COLUMN "beneficiarySequence" INTEGER NOT NULL DEFAULT 0 CHECK ("beneficiarySequence" >= 0),
  ADD COLUMN "beneficiaryRestorationDisputeId" TEXT,
  ADD COLUMN "restorationOfTransferId" TEXT;

ALTER TABLE "AllwainTransfer"
  ADD CONSTRAINT "AllwainTransfer_beneficiaryRestorationDisputeId_fkey"
    FOREIGN KEY ("beneficiaryRestorationDisputeId") REFERENCES "AllwainDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AllwainTransfer_restorationOfTransferId_fkey"
    FOREIGN KEY ("restorationOfTransferId") REFERENCES "AllwainTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "AllwainTransfer_beneficiaryAllocationId_key";
CREATE UNIQUE INDEX "AllwainTransfer_beneficiaryAllocationId_beneficiarySequence_key"
  ON "AllwainTransfer"("beneficiaryAllocationId", "beneficiarySequence");
CREATE INDEX "AllwainTransfer_beneficiaryRestorationDisputeId_idx"
  ON "AllwainTransfer"("beneficiaryRestorationDisputeId");
CREATE INDEX "AllwainTransfer_restorationOfTransferId_idx"
  ON "AllwainTransfer"("restorationOfTransferId");

-- The existing beneficiary/payment/settlement guards still apply to every
-- tranche. Application order locks choose contiguous sequences; uniqueness
-- prevents concurrent workers from claiming the same allocation and sequence.
CREATE FUNCTION allwain_guard_beneficiary_restoration_tranche() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_order "AllwainOrder"%ROWTYPE;
  original "AllwainTransfer"%ROWTYPE;
  dispute "AllwainDispute"%ROWTYPE;
  allocation "AllwainBeneficiaryAllocation"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."beneficiarySequence" IS DISTINCT FROM OLD."beneficiarySequence" OR
    NEW."beneficiaryRestorationDisputeId" IS DISTINCT FROM OLD."beneficiaryRestorationDisputeId" OR
    NEW."restorationOfTransferId" IS DISTINCT FROM OLD."restorationOfTransferId") THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANCHE_IDENTITY_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."beneficiarySequence" > 0 AND (
    NEW.id IS DISTINCT FROM OLD.id OR
    NEW."orderId" IS DISTINCT FROM OLD."orderId" OR
    NEW."paymentId" IS DISTINCT FROM OLD."paymentId" OR
    NEW."beneficiaryAllocationId" IS DISTINCT FROM OLD."beneficiaryAllocationId" OR
    NEW."recipientUserId" IS DISTINCT FROM OLD."recipientUserId" OR
    NEW."recipientRole" IS DISTINCT FROM OLD."recipientRole" OR
    NEW."stripeAccountId" IS DISTINCT FROM OLD."stripeAccountId" OR
    NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
    NEW."requestSnapshot" IS DISTINCT FROM OLD."requestSnapshot" OR
    NEW."allocationSnapshot" IS DISTINCT FROM OLD."allocationSnapshot" OR
    NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt" OR
    NEW."releaseTrigger" IS DISTINCT FROM OLD."releaseTrigger") THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RESTORATION_REQUEST_IMMUTABLE';
  END IF;

  SELECT * INTO source_order FROM "AllwainOrder" WHERE id = NEW."orderId";
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANSFER_ORDER_MISSING'; END IF;
  IF source_order."beneficiaryExecutionVersion" IS NULL THEN
    IF NEW."beneficiarySequence" <> 0 OR NEW."beneficiaryRestorationDisputeId" IS NOT NULL OR
       NEW."restorationOfTransferId" IS NOT NULL THEN
      RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANCHE_ENGINE_MISMATCH';
    END IF;
    RETURN NEW;
  END IF;
  IF source_order."beneficiaryExecutionVersion" <> 1 OR NEW."beneficiaryAllocationId" IS NULL THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_TRANCHE_ENGINE_MISMATCH';
  END IF;
  IF NEW."beneficiarySequence" = 0 THEN
    IF NEW."beneficiaryRestorationDisputeId" IS NOT NULL OR NEW."restorationOfTransferId" IS NOT NULL THEN
      RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_ORIGINAL_TRANCHE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."restorationOfTransferId" IS NULL OR NEW."beneficiaryRestorationDisputeId" IS NULL OR
     NEW."restorationOfTransferId" = NEW.id THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RESTORATION_SOURCE_INVALID';
  END IF;
  SELECT * INTO original FROM "AllwainTransfer" WHERE id = NEW."restorationOfTransferId";
  IF NOT FOUND OR original."beneficiarySequence" <> 0 OR original."restorationOfTransferId" IS NOT NULL OR
     original."beneficiaryRestorationDisputeId" IS NOT NULL OR original."stripeTransferId" IS NULL OR
     original."beneficiaryAllocationId" IS DISTINCT FROM NEW."beneficiaryAllocationId" OR
     original."orderId" IS DISTINCT FROM NEW."orderId" OR original."paymentId" IS DISTINCT FROM NEW."paymentId" OR
     original."recipientUserId" IS DISTINCT FROM NEW."recipientUserId" OR
     original."recipientRole" IS DISTINCT FROM NEW."recipientRole" OR original.currency IS DISTINCT FROM NEW.currency OR
     original."stripeAccountId" IS NULL OR original."stripeAccountId" IS DISTINCT FROM NEW."stripeAccountId" THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RESTORATION_SOURCE_MISMATCH';
  END IF;
  SELECT * INTO dispute FROM "AllwainDispute" WHERE id = NEW."beneficiaryRestorationDisputeId";
  IF NOT FOUND OR dispute."orderId" IS DISTINCT FROM NEW."orderId" OR
     dispute."paymentId" IS DISTINCT FROM NEW."paymentId" OR dispute.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RESTORATION_DISPUTE_MISMATCH';
  END IF;
  SELECT * INTO allocation FROM "AllwainBeneficiaryAllocation" WHERE id = NEW."beneficiaryAllocationId";
  IF NOT FOUND OR NEW."requestedAt" IS NULL OR NEW."requestSnapshot" IS NULL OR
     jsonb_typeof(NEW."requestSnapshot") IS DISTINCT FROM 'object' OR
     NEW."requestSnapshot"->'amount' IS DISTINCT FROM to_jsonb(NEW.amount) OR
     NEW."requestSnapshot"->>'currency' IS DISTINCT FROM NEW.currency OR
     NEW."requestSnapshot"->>'destination' IS DISTINCT FROM original."stripeAccountId" OR
     NEW."requestSnapshot"->>'transfer_group' IS DISTINCT FROM ('allwain_order_' || NEW."orderId") OR
     NEW."requestSnapshot"->'metadata'->>'scope' IS DISTINCT FROM 'allwain_beneficiary_restoration' OR
     NEW."requestSnapshot"->'metadata'->>'executionVersion' IS DISTINCT FROM '1' OR
     NEW."requestSnapshot"->'metadata'->>'sequence' IS DISTINCT FROM NEW."beneficiarySequence"::TEXT OR
     NEW."requestSnapshot"->'metadata'->>'restorationOfTransferId' IS DISTINCT FROM original.id OR
     NEW."requestSnapshot"->'metadata'->>'disputeId' IS DISTINCT FROM dispute."stripeDisputeId" OR
     NEW."requestSnapshot"->'metadata'->>'allocationId' IS DISTINCT FROM allocation.id OR
     NEW."requestSnapshot"->'metadata'->>'paymentId' IS DISTINCT FROM NEW."paymentId" OR
     NEW."requestSnapshot"->'metadata'->>'orderId' IS DISTINCT FROM NEW."orderId" OR
     NEW."requestSnapshot"->'metadata'->>'beneficiarySnapshotHash' IS DISTINCT FROM allocation."beneficiarySnapshotHash" THEN
    RAISE EXCEPTION 'ALLWAIN_BENEFICIARY_RESTORATION_REQUEST_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_beneficiary_restoration_tranche_guard BEFORE INSERT OR UPDATE ON "AllwainTransfer"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_restoration_tranche();
