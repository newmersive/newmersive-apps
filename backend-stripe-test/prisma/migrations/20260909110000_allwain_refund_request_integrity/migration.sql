CREATE FUNCTION "allwain_refund_request_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."kind" = 'refund' AND OLD."metadata"->'stripeRefundRequest' IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'ALLWAIN_REFUND_REQUEST_CANNOT_BE_DELETED';
    END IF;
    IF NEW."metadata"->'stripeRefundRequest' IS DISTINCT FROM OLD."metadata"->'stripeRefundRequest' OR
       NEW."metadata"->'originalPaymentId' IS DISTINCT FROM OLD."metadata"->'originalPaymentId' OR
       NEW."metadata"->'requestedAmount' IS DISTINCT FROM OLD."metadata"->'requestedAmount' OR
       NEW."metadata"->'refundAllocation' IS DISTINCT FROM OLD."metadata"->'refundAllocation' OR
       NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR
       NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."currency" IS DISTINCT FROM OLD."currency" OR
       NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."operationKey" IS DISTINCT FROM OLD."operationKey" THEN
      RAISE EXCEPTION 'ALLWAIN_REFUND_REQUEST_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainPayment_refund_request_immutable"
  BEFORE UPDATE OR DELETE ON "AllwainPayment"
  FOR EACH ROW EXECUTE FUNCTION "allwain_refund_request_immutable"();
