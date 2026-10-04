-- Capture may exist in ready state before checkout_locked. Its financial basis
-- must already be immutable, including for previews that require review.
CREATE FUNCTION allwain_guard_beneficiary_economic_basis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."beneficiarySnapshot" IS NOT NULL AND (
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW."grossAmount" IS DISTINCT FROM OLD."grossAmount" OR
    NEW."sellerAmount" IS DISTINCT FROM OLD."sellerAmount" OR
    NEW."platformFeeAmount" IS DISTINCT FROM OLD."platformFeeAmount" OR
    NEW."platformRetainedAmount" IS DISTINCT FROM OLD."platformRetainedAmount" OR
    NEW."connectorPlatformShareAmount" IS DISTINCT FROM OLD."connectorPlatformShareAmount" OR
    NEW."connectorDeliveryAmount" IS DISTINCT FROM OLD."connectorDeliveryAmount" OR
    NEW."carrierDeliveryAmount" IS DISTINCT FROM OLD."carrierDeliveryAmount"
  ) THEN
    RAISE EXCEPTION 'Allwain beneficiary economic basis is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_beneficiary_economic_basis_immutable
  BEFORE UPDATE ON "AllwainSettlementPlan"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_economic_basis();
