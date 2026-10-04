ALTER TABLE "AllwainTransfer" ADD COLUMN "allocationSnapshot" JSONB;

CREATE FUNCTION "allwain_transfer_allocation_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."requestSnapshot" IS NOT NULL AND
     NEW."allocationSnapshot" IS DISTINCT FROM OLD."allocationSnapshot" THEN
    RAISE EXCEPTION 'ALLWAIN_TRANSFER_ALLOCATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainTransfer_allocation_immutable"
  BEFORE UPDATE ON "AllwainTransfer"
  FOR EACH ROW EXECUTE FUNCTION "allwain_transfer_allocation_immutable"();

CREATE FUNCTION "allwain_refund_allocation_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."kind" = 'refund' AND OLD."metadata"->'refundAllocation' IS NOT NULL AND (
    NEW."metadata"->'refundAllocation' IS DISTINCT FROM OLD."metadata"->'refundAllocation' OR
    NEW."metadata"->'originalPaymentId' IS DISTINCT FROM OLD."metadata"->'originalPaymentId' OR
    (OLD."stripeRefundId" IS NOT NULL AND NEW."stripeRefundId" IS DISTINCT FROM OLD."stripeRefundId")
  ) THEN
    RAISE EXCEPTION 'ALLWAIN_REFUND_ALLOCATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainPayment_refund_allocation_immutable"
  BEFORE UPDATE ON "AllwainPayment"
  FOR EACH ROW EXECUTE FUNCTION "allwain_refund_allocation_immutable"();
