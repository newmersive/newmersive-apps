-- No historical requests or POST permissions are reconstructed by this migration.
CREATE TABLE "AllwainRecurringChargeExecution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentId" TEXT NOT NULL REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "occurrenceId" TEXT NOT NULL REFERENCES "AllwainRecurringOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "planId" TEXT NOT NULL REFERENCES "AllwainRecurringPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "stripeMode" TEXT NOT NULL DEFAULT 'test' CHECK ("stripeMode" = 'test'),
  "amount" INTEGER NOT NULL CHECK (amount > 0),
  "currency" TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  "stripeCustomerId" TEXT NOT NULL CHECK ("stripeCustomerId" ~ '^cus_[A-Za-z0-9_]+$'),
  "stripePaymentMethodId" TEXT NOT NULL CHECK ("stripePaymentMethodId" ~ '^pm_[A-Za-z0-9_]+$'),
  "onBehalfOfStripeAccountId" TEXT CHECK ("onBehalfOfStripeAccountId" IS NULL OR "onBehalfOfStripeAccountId" ~ '^acct_[A-Za-z0-9_]+$'),
  "requestSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("requestSnapshot") = 'object'),
  "requestHash" TEXT NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  "idempotencyKey" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','submitting','reconciliation_required','provider_confirmed')),
  "executionToken" TEXT,
  "executionLeaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  "nextRetryAt" TIMESTAMP(3),
  "stripePaymentIntentId" TEXT CHECK ("stripePaymentIntentId" IS NULL OR "stripePaymentIntentId" ~ '^pi_[A-Za-z0-9_]+$'),
  "providerStatus" TEXT,
  "providerSnapshot" JSONB,
  "providerSnapshotHash" TEXT CHECK ("providerSnapshotHash" IS NULL OR "providerSnapshotHash" ~ '^[0-9a-f]{64}$'),
  "observedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK (("executionToken" IS NULL) = ("executionLeaseUntil" IS NULL)),
  CHECK (("requestedAt" IS NULL AND attempts = 0) OR ("requestedAt" IS NOT NULL AND attempts > 0))
);
CREATE UNIQUE INDEX "AllwainRecurringChargeExecution_paymentId_key" ON "AllwainRecurringChargeExecution"("paymentId");
CREATE UNIQUE INDEX "AllwainRecurringChargeExecution_occurrenceId_key" ON "AllwainRecurringChargeExecution"("occurrenceId");
CREATE UNIQUE INDEX "AllwainRecurringChargeExecution_idempotencyKey_key" ON "AllwainRecurringChargeExecution"("idempotencyKey");
CREATE UNIQUE INDEX "AllwainRecurringChargeExecution_stripePaymentIntentId_key" ON "AllwainRecurringChargeExecution"("stripePaymentIntentId");
CREATE INDEX "AllwainRecurringChargeExecution_status_executionLeaseUntil_idx" ON "AllwainRecurringChargeExecution"("status", "executionLeaseUntil");
CREATE INDEX "AllwainRecurringChargeExecution_planId_createdAt_idx" ON "AllwainRecurringChargeExecution"("planId", "createdAt");
CREATE INDEX "AllwainRecurringChargeExecution_orderId_idx" ON "AllwainRecurringChargeExecution"("orderId");

-- Prisma may supply client timestamps. Track actual INSERTs in transaction-local
-- state instead of inferring a new occurrence from wall-clock time or xmin
-- (which would also change when an old occurrence is updated).
CREATE FUNCTION allwain_track_new_recurring_occurrence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('allwain.recurring_occurrence_inserts',
    (coalesce(nullif(current_setting('allwain.recurring_occurrence_inserts', true), ''), '[]')::jsonb || jsonb_build_array(NEW.id))::text,
    true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_new_recurring_occurrence AFTER INSERT ON "AllwainRecurringOccurrence"
  FOR EACH ROW EXECUTE FUNCTION allwain_track_new_recurring_occurrence();

CREATE FUNCTION allwain_guard_recurring_charge_execution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE occurrence "AllwainRecurringOccurrence"%ROWTYPE;
  payment "AllwainPayment"%ROWTYPE;
  source_order "AllwainOrder"%ROWTYPE;
  plan "AllwainRecurringPlan"%ROWTYPE;
  request JSONB;
  metadata JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'RECURRING_CHARGE_EXECUTION_IMMUTABLE'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['status','executionToken','executionLeaseUntil','attempts','nextRetryAt','stripePaymentIntentId',
        'providerStatus','providerSnapshot','providerSnapshotHash','observedAt','failureCode','updatedAt','requestedAt']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','executionToken','executionLeaseUntil','attempts','nextRetryAt','stripePaymentIntentId',
        'providerStatus','providerSnapshot','providerSnapshotHash','observedAt','failureCode','updatedAt','requestedAt']) OR
       (OLD."requestedAt" IS NOT NULL AND NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt") OR
       (OLD."stripePaymentIntentId" IS NOT NULL AND NEW."stripePaymentIntentId" IS DISTINCT FROM OLD."stripePaymentIntentId") OR
       NEW.attempts < OLD.attempts OR NEW.attempts > OLD.attempts + 1 THEN
      RAISE EXCEPTION 'RECURRING_CHARGE_EXECUTION_IMMUTABLE';
    END IF;
  END IF;
  SELECT * INTO occurrence FROM "AllwainRecurringOccurrence" WHERE id = NEW."occurrenceId";
  SELECT * INTO payment FROM "AllwainPayment" WHERE id = NEW."paymentId";
  SELECT * INTO source_order FROM "AllwainOrder" WHERE id = NEW."orderId";
  SELECT * INTO plan FROM "AllwainRecurringPlan" WHERE id = NEW."planId";
  IF occurrence.id IS NULL OR payment.id IS NULL OR source_order.id IS NULL OR plan.id IS NULL OR
     occurrence."planId" IS DISTINCT FROM plan.id OR occurrence."orderId" IS DISTINCT FROM source_order.id OR
     occurrence."paymentId" IS DISTINCT FROM payment.id OR payment."orderId" IS DISTINCT FROM source_order.id OR
     source_order."recurringPlanId" IS DISTINCT FROM plan.id OR source_order."recurringSequence" IS DISTINCT FROM occurrence.sequence OR
     occurrence.sequence < 1 OR payment.kind IS DISTINCT FROM 'recurring_charge' OR payment.provider IS DISTINCT FROM 'stripe' OR
     payment.amount IS DISTINCT FROM NEW.amount OR source_order."totalAmount" IS DISTINCT FROM NEW.amount OR
     payment.currency IS DISTINCT FROM NEW.currency OR source_order.currency IS DISTINCT FROM NEW.currency OR plan.currency IS DISTINCT FROM NEW.currency OR
     payment."stripeCustomerId" IS DISTINCT FROM NEW."stripeCustomerId" OR payment."stripePaymentMethodId" IS DISTINCT FROM NEW."stripePaymentMethodId" OR
     payment."onBehalfOfStripeAccountId" IS DISTINCT FROM NEW."onBehalfOfStripeAccountId" OR
     payment."commercialModel" IS DISTINCT FROM source_order."commercialModel" OR payment."businessOfRecord" IS DISTINCT FROM source_order."businessOfRecord" OR
     (payment."commercialModel" = 'platform_direct' AND NEW."onBehalfOfStripeAccountId" IS NOT NULL) OR
     (payment."commercialModel" <> 'platform_direct' AND NEW."onBehalfOfStripeAccountId" IS NULL) OR
     source_order."buyerUserId" IS DISTINCT FROM plan."buyerUserId" OR source_order."sellerUserId" IS DISTINCT FROM plan."sellerUserId" THEN
    RAISE EXCEPTION 'RECURRING_CHARGE_EXECUTION_IDENTITY_MISMATCH';
  END IF;
  request := NEW."requestSnapshot"; metadata := request->'metadata';
  IF request->'amount' IS DISTINCT FROM to_jsonb(NEW.amount) OR request->>'currency' IS DISTINCT FROM NEW.currency OR
     request->>'customer' IS DISTINCT FROM NEW."stripeCustomerId" OR request->>'payment_method' IS DISTINCT FROM NEW."stripePaymentMethodId" OR
     request->>'on_behalf_of' IS DISTINCT FROM NEW."onBehalfOfStripeAccountId" OR
     request->'off_session' IS DISTINCT FROM 'true'::jsonb OR request->'confirm' IS DISTINCT FROM 'true'::jsonb OR
     request->>'transfer_group' IS DISTINCT FROM ('allwain_order_' || NEW."orderId") OR
     request ? 'transfer_data' OR request ? 'application_fee_amount' OR
     jsonb_typeof(metadata) IS DISTINCT FROM 'object' OR metadata->>'scope' IS DISTINCT FROM 'allwain_order' OR
     metadata->>'orderId' IS DISTINCT FROM NEW."orderId" OR metadata->>'paymentId' IS DISTINCT FROM NEW."paymentId" OR
     metadata->>'contractId' IS DISTINCT FROM source_order."contractId" OR metadata->>'recurringPlanId' IS DISTINCT FROM plan.id OR
     metadata->>'recurringOccurrenceId' IS DISTINCT FROM occurrence.id OR metadata->>'recurringSequence' IS DISTINCT FROM occurrence.sequence::text OR
     metadata->>'mandateVersion' IS DISTINCT FROM payment.metadata->>'mandateVersion' OR
     metadata->>'mandateEvidenceHash' IS DISTINCT FROM payment.metadata->>'mandateEvidenceHash' OR
     coalesce(metadata->>'mandateEvidenceHash', '') !~ '^[0-9a-f]{64}$' OR
     metadata->>'commercialModel' IS DISTINCT FROM payment."commercialModel" OR metadata->>'businessOfRecord' IS DISTINCT FROM payment."businessOfRecord" OR
     metadata->>'settlementPlanVersion' IS DISTINCT FROM coalesce(payment."settlementPlanVersion"::text,'') OR
     metadata->>'settlementSnapshotHash' IS DISTINCT FROM coalesce(payment."settlementSnapshotHash",'') OR
     NEW."idempotencyKey" IS DISTINCT FROM ('allwain-recurring-' || occurrence.id) THEN
    RAISE EXCEPTION 'RECURRING_CHARGE_EXECUTION_SNAPSHOT_MISMATCH';
  END IF;
  IF TG_OP = 'INSERT' AND (
     NOT (coalesce(nullif(current_setting('allwain.recurring_occurrence_inserts', true), ''), '[]')::jsonb ? NEW."occurrenceId") OR
     occurrence.status IS DISTINCT FROM 'processing' OR payment."stripePaymentIntentId" IS NOT NULL OR occurrence."stripePaymentIntentId" IS NOT NULL OR
     NEW."requestedAt" IS NOT NULL OR NEW.attempts <> 0 OR NEW.status <> 'prepared' OR
     NEW."stripePaymentIntentId" IS NOT NULL OR NEW."providerSnapshot" IS NOT NULL OR NEW."providerStatus" IS NOT NULL OR
     NEW."observedAt" IS NOT NULL OR NEW."providerSnapshotHash" IS NOT NULL OR NEW."executionToken" IS NOT NULL OR
     coalesce(source_order."inventoryStatus", '') NOT IN ('reserved', 'not_managed') OR source_order."reservationExpiresAt" <= CURRENT_TIMESTAMP OR
     source_order."reservationExpiresAt" IS NULL OR payment."paidAt" IS NOT NULL OR
     plan.status IS DISTINCT FROM 'active' OR plan."mandateAcceptedAt" IS NULL OR NEW.amount > plan."maximumChargeAmount" OR
     plan."stripeCustomerId" IS DISTINCT FROM NEW."stripeCustomerId" OR plan."stripePaymentMethodId" IS DISTINCT FROM NEW."stripePaymentMethodId" OR
     metadata->>'mandateVersion' IS DISTINCT FROM plan."mandateVersion" OR metadata->>'mandateEvidenceHash' IS DISTINCT FROM plan."mandateEvidenceHash") THEN
    RAISE EXCEPTION 'RECURRING_CHARGE_EXECUTION_NOT_NEW_CONSENTED_OCCURRENCE';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."onBehalfOfStripeAccountId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AllwainSellerPaymentAccount" WHERE "userId" = plan."sellerUserId" AND
      "stripeAccountId" = NEW."onBehalfOfStripeAccountId" AND "chargesEnabled" AND "transfersEnabled" AND "payoutsEnabled"
  ) THEN RAISE EXCEPTION 'RECURRING_CHARGE_EXECUTION_SELLER_ACCOUNT_MISMATCH'; END IF;
  IF NEW."stripePaymentIntentId" IS NOT NULL AND (
     (payment."stripePaymentIntentId" IS NOT NULL AND payment."stripePaymentIntentId" IS DISTINCT FROM NEW."stripePaymentIntentId") OR
     (occurrence."stripePaymentIntentId" IS NOT NULL AND occurrence."stripePaymentIntentId" IS DISTINCT FROM NEW."stripePaymentIntentId")) THEN
    RAISE EXCEPTION 'RECURRING_CHARGE_EXECUTION_PROVIDER_ID_CONFLICT';
  END IF;
  IF NEW."providerSnapshot" IS NOT NULL AND (
     NEW."stripePaymentIntentId" IS NULL OR NEW."providerStatus" IS NULL OR NEW."providerSnapshotHash" IS NULL OR NEW."observedAt" IS NULL OR
     NEW."providerSnapshot"->>'id' IS DISTINCT FROM NEW."stripePaymentIntentId" OR
     NEW."providerSnapshot"->>'status' IS DISTINCT FROM NEW."providerStatus" OR NEW."providerSnapshot"->'livemode' IS DISTINCT FROM 'false'::jsonb OR
     NEW."providerSnapshot"->>'object' IS DISTINCT FROM 'payment_intent' OR
     NEW."providerStatus" NOT IN ('succeeded','processing','requires_action','requires_payment_method','requires_confirmation','canceled') OR
     jsonb_typeof(NEW."providerSnapshot"->'amount_received') IS DISTINCT FROM 'number' OR
     (NEW."providerStatus" = 'succeeded' AND NEW."providerSnapshot"->'amount_received' IS DISTINCT FROM to_jsonb(NEW.amount)) OR
     (NEW."providerStatus" = 'canceled' AND NEW."providerSnapshot"->'amount_received' IS DISTINCT FROM '0'::jsonb) OR
     NEW."providerSnapshot"->'amount' IS DISTINCT FROM to_jsonb(NEW.amount) OR NEW."providerSnapshot"->>'currency' IS DISTINCT FROM NEW.currency OR
     NEW."providerSnapshot"->>'customer' IS DISTINCT FROM NEW."stripeCustomerId" OR NEW."providerSnapshot"->>'payment_method' IS DISTINCT FROM NEW."stripePaymentMethodId" OR
     NEW."providerSnapshot"->>'on_behalf_of' IS DISTINCT FROM NEW."onBehalfOfStripeAccountId" OR
     NEW."providerSnapshot"->>'transfer_group' IS DISTINCT FROM request->>'transfer_group' OR
     NEW."providerSnapshot"->'metadata' IS DISTINCT FROM metadata) THEN
    RAISE EXCEPTION 'RECURRING_CHARGE_EXECUTION_PROVIDER_SNAPSHOT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_recurring_charge_execution_guard BEFORE INSERT OR UPDATE OR DELETE
  ON "AllwainRecurringChargeExecution" FOR EACH ROW EXECUTE FUNCTION allwain_guard_recurring_charge_execution();
