-- Planning records only. No transfer, payout allocation or ledger backfill.
CREATE TABLE "AllwainBeneficiaryAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "settlementPlanId" TEXT NOT NULL REFERENCES "AllwainSettlementPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "beneficiarySnapshotHash" TEXT NOT NULL CHECK ("beneficiarySnapshotHash" ~ '^[a-f0-9]{64}$'),
  "position" INTEGER NOT NULL CHECK ("position" >= 0),
  "key" TEXT NOT NULL CHECK (length("key") BETWEEN 1 AND 220),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('referral', 'local_delivery', 'seller', 'carrier', 'platform')),
  "recipientUserId" TEXT CHECK (length("recipientUserId") BETWEEN 1 AND 200 AND btrim("recipientUserId") = "recipientUserId"),
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "currency" TEXT NOT NULL CHECK ("currency" ~ '^[a-z]{3}$'),
  "sources" JSONB NOT NULL CHECK (jsonb_typeof("sources") = 'array'),
  "execution" TEXT NOT NULL DEFAULT 'not_enabled' CHECK ("execution" = 'not_enabled'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AllwainBeneficiaryAllocation_settlementPlanId_key_key"
  ON "AllwainBeneficiaryAllocation"("settlementPlanId", "key");
CREATE UNIQUE INDEX "AllwainBeneficiaryAllocation_settlementPlanId_position_key"
  ON "AllwainBeneficiaryAllocation"("settlementPlanId", "position");

CREATE FUNCTION allwain_guard_beneficiary_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "AllwainSettlementPlan"%ROWTYPE; share JSONB;
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Allwain beneficiary allocations are immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM "AllwainSettlementPlan" WHERE id = NEW."settlementPlanId" FOR UPDATE;
  IF NOT FOUND OR parent."beneficiarySnapshot"->'version' IS DISTINCT FROM '2'::JSONB OR
     parent."beneficiarySnapshot"->>'status' IS DISTINCT FROM 'planned' OR
     parent."beneficiarySnapshot"->>'execution' IS DISTINCT FROM 'not_enabled' OR
     parent."beneficiarySnapshotHash" IS DISTINCT FROM NEW."beneficiarySnapshotHash" OR
     parent.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'Allwain beneficiary allocation source is invalid';
  END IF;
  share := parent."beneficiarySnapshot"->'plan'->'shares'->NEW.position;
  IF share IS DISTINCT FROM jsonb_build_object('key', NEW.key, 'kind', NEW.kind,
    'recipientUserId', NEW."recipientUserId", 'amount', NEW.amount, 'sources', NEW.sources) THEN
    RAISE EXCEPTION 'Allwain beneficiary allocation must match its captured share';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_beneficiary_allocation_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "AllwainBeneficiaryAllocation"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_beneficiary_allocation();

CREATE FUNCTION allwain_assert_beneficiary_allocation_set(settlement_id TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE parent "AllwainSettlementPlan"%ROWTYPE; item_count BIGINT; total BIGINT; shares JSONB;
BEGIN
  SELECT * INTO parent FROM "AllwainSettlementPlan" WHERE id = settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allwain beneficiary allocation source is missing'; END IF;
  SELECT count(*), coalesce(sum(amount), 0) INTO item_count, total
    FROM "AllwainBeneficiaryAllocation" WHERE "settlementPlanId" = settlement_id;
  IF parent."beneficiarySnapshot"->'version' IS DISTINCT FROM '2'::JSONB OR
     parent."beneficiarySnapshot"->>'status' IS DISTINCT FROM 'planned' THEN
    IF item_count <> 0 THEN RAISE EXCEPTION 'Allwain beneficiary allocations require a planned V2 snapshot'; END IF;
    RETURN;
  END IF;
  shares := parent."beneficiarySnapshot"->'plan'->'shares';
  IF parent."beneficiarySnapshot"->>'execution' IS DISTINCT FROM 'not_enabled' OR
     parent."beneficiarySnapshot"->'plan'->>'execution' IS DISTINCT FROM 'not_enabled' OR
     parent."beneficiarySnapshot"->'plan'->'version' IS DISTINCT FROM '1'::JSONB OR
     parent."beneficiarySnapshot"->'plan'->'currency' IS DISTINCT FROM to_jsonb(parent.currency) OR
     parent."beneficiarySnapshot"->'plan'->'grossAmount' IS DISTINCT FROM to_jsonb(parent."grossAmount") OR
     jsonb_typeof(shares) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Allwain beneficiary allocation plan is invalid';
  END IF;
  IF item_count = 0 OR item_count <> jsonb_array_length(shares) OR total <> parent."grossAmount" THEN
    RAISE EXCEPTION 'Allwain beneficiary allocations must match the complete snapshot';
  END IF;
END;
$$;
CREATE FUNCTION allwain_check_beneficiary_allocation_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'AllwainSettlementPlan' THEN
    -- Existing V2 snapshots may be materialized on retry. An unrelated operational
    -- update must not silently demand a retrospective allocation of old captures.
    IF TG_OP = 'UPDATE' AND NEW."beneficiarySnapshot" IS NOT DISTINCT FROM OLD."beneficiarySnapshot" AND
      NEW."beneficiarySnapshotHash" IS NOT DISTINCT FROM OLD."beneficiarySnapshotHash" THEN RETURN NULL; END IF;
    PERFORM allwain_assert_beneficiary_allocation_set(NEW.id);
  ELSE
    PERFORM allwain_assert_beneficiary_allocation_set(NEW."settlementPlanId");
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER allwain_beneficiary_allocation_complete
  AFTER INSERT ON "AllwainBeneficiaryAllocation" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION allwain_check_beneficiary_allocation_set();
CREATE CONSTRAINT TRIGGER allwain_beneficiary_capture_complete
  AFTER INSERT OR UPDATE ON "AllwainSettlementPlan" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION allwain_check_beneficiary_allocation_set();
