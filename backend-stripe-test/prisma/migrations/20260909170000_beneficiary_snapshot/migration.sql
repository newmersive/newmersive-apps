ALTER TABLE "AllwainSettlementPlan"
  ADD COLUMN "beneficiarySnapshot" JSONB,
  ADD COLUMN "beneficiarySnapshotHash" TEXT,
  ADD CONSTRAINT "AllwainSettlementPlan_beneficiary_pair" CHECK (
    ("beneficiarySnapshot" IS NULL AND "beneficiarySnapshotHash" IS NULL) OR
    ("beneficiarySnapshot" IS NOT NULL AND "beneficiarySnapshotHash" IS NOT NULL AND "beneficiarySnapshotHash" ~ '^[a-f0-9]{64}$')
  );

CREATE FUNCTION allwain_guard_beneficiary_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."beneficiarySnapshot" IS NOT NULL THEN
      RAISE EXCEPTION 'Allwain beneficiary snapshot is immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."beneficiarySnapshot" IS NOT NULL AND (
    NEW."beneficiarySnapshot" IS DISTINCT FROM OLD."beneficiarySnapshot" OR
    NEW."beneficiarySnapshotHash" IS DISTINCT FROM OLD."beneficiarySnapshotHash" OR
    NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW.version IS DISTINCT FROM OLD.version OR
    NEW."snapshotHash" IS DISTINCT FROM OLD."snapshotHash"
  ) THEN
    RAISE EXCEPTION 'Allwain beneficiary snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_beneficiary_snapshot_immutable
  BEFORE UPDATE OR DELETE ON "AllwainSettlementPlan"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_snapshot();
