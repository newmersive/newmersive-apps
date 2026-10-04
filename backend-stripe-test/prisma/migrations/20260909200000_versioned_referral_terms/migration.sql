-- Preserve historic policy rows and their hashes. Only new publications supply this field.
ALTER TABLE "AllwainEconomicPolicy" ADD COLUMN "referralPoolBps" INTEGER
  CHECK ("referralPoolBps" BETWEEN 0 AND 10000);

ALTER TABLE "AllwainRecurringPlan"
  ADD COLUMN "referralSnapshot" JSONB,
  ADD COLUMN "referralSnapshotHash" TEXT,
  ADD CONSTRAINT "AllwainRecurringPlan_referral_pair" CHECK (
    ("referralSnapshot" IS NULL AND "referralSnapshotHash" IS NULL) OR
    ("referralSnapshot" IS NOT NULL AND "referralSnapshotHash" IS NOT NULL AND "referralSnapshotHash" ~ '^[a-f0-9]{64}$')
  );

CREATE FUNCTION allwain_guard_recurring_referral_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."referralSnapshot" IS NOT NULL THEN
      RAISE EXCEPTION 'Recurring referral terms are immutable';
    END IF;
    RETURN OLD;
  END IF;
  -- Capture is part of INSERT and its original mandate, never a retrospective update.
  IF NEW."referralSnapshot" IS DISTINCT FROM OLD."referralSnapshot" OR
     NEW."referralSnapshotHash" IS DISTINCT FROM OLD."referralSnapshotHash" OR
     (OLD."referralSnapshot" IS NOT NULL AND ROW(
       NEW."sourceOrderId", NEW."offerId", NEW."buyerUserId", NEW."sellerUserId",
       NEW."mandateVersion", NEW."mandateAcceptedAt", NEW."mandateEvidenceHash", NEW."mandateSnapshotHash"
     ) IS DISTINCT FROM ROW(
       OLD."sourceOrderId", OLD."offerId", OLD."buyerUserId", OLD."sellerUserId",
       OLD."mandateVersion", OLD."mandateAcceptedAt", OLD."mandateEvidenceHash", OLD."mandateSnapshotHash"
     )) THEN
    RAISE EXCEPTION 'Recurring referral terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_recurring_referral_terms_immutable BEFORE UPDATE OR DELETE ON "AllwainRecurringPlan"
  FOR EACH ROW EXECUTE FUNCTION allwain_guard_recurring_referral_terms();
