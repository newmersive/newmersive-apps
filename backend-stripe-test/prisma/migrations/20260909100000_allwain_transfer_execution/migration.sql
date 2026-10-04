ALTER TABLE "AllwainTransfer"
  ADD COLUMN "requestSnapshot" JSONB,
  ADD COLUMN "requestedAt" TIMESTAMP(3),
  ADD COLUMN "executionToken" TEXT,
  ADD COLUMN "executionLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AllwainTransfer_status_executionLeaseUntil_idx"
  ON "AllwainTransfer" ("status", "executionLeaseUntil");

CREATE FUNCTION "allwain_transfer_execution_immutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."requestSnapshot" IS NOT NULL THEN
      RAISE EXCEPTION 'ALLWAIN_TRANSFER_EXECUTION_CANNOT_BE_DELETED';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."requestSnapshot" IS NOT NULL AND (
    NEW."requestSnapshot" IS DISTINCT FROM OLD."requestSnapshot" OR
    NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt" OR
    NEW."orderId" IS DISTINCT FROM OLD."orderId" OR
    NEW."paymentId" IS DISTINCT FROM OLD."paymentId" OR
    NEW."recipientUserId" IS DISTINCT FROM OLD."recipientUserId" OR
    NEW."recipientRole" IS DISTINCT FROM OLD."recipientRole" OR
    NEW."stripeAccountId" IS DISTINCT FROM OLD."stripeAccountId" OR
    NEW."amount" IS DISTINCT FROM OLD."amount" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
  ) THEN
    RAISE EXCEPTION 'ALLWAIN_TRANSFER_REQUEST_IMMUTABLE';
  END IF;
  IF OLD."stripeTransferId" IS NOT NULL AND NEW."stripeTransferId" IS DISTINCT FROM OLD."stripeTransferId" THEN
    RAISE EXCEPTION 'ALLWAIN_TRANSFER_PROVIDER_ID_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainTransfer_execution_immutable"
  BEFORE UPDATE OR DELETE ON "AllwainTransfer"
  FOR EACH ROW EXECUTE FUNCTION "allwain_transfer_execution_immutable"();
