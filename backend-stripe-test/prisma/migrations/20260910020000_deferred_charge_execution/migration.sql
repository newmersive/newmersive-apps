-- No historical backfill; real deferred payment + execution are INSERTed in one order transaction.
CREATE TABLE "AllwainDeferredChargeExecution" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentId" TEXT NOT NULL REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "setupPaymentId" TEXT NOT NULL REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "mandateConsentId" TEXT NOT NULL REFERENCES "AllwainConsentEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "settlementPlanId" TEXT NOT NULL REFERENCES "AllwainSettlementPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "stripeMode" TEXT NOT NULL DEFAULT 'test' CHECK ("stripeMode" = 'test'),
  "amount" INTEGER NOT NULL CHECK (amount > 0),
  "currency" TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  "stripeCustomerId" TEXT NOT NULL CHECK ("stripeCustomerId" ~ '^cus_[A-Za-z0-9_]+$'),
  "stripePaymentMethodId" TEXT NOT NULL CHECK ("stripePaymentMethodId" ~ '^pm_[A-Za-z0-9_]+$'),
  "onBehalfOfStripeAccountId" TEXT CHECK ("onBehalfOfStripeAccountId" IS NULL OR "onBehalfOfStripeAccountId" ~ '^acct_[A-Za-z0-9_]+$'),
  "requestSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("requestSnapshot") = 'object'),
  "requestHash" TEXT NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  "setupIntentSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("setupIntentSnapshot") = 'object'),
  "setupIntentSnapshotHash" TEXT NOT NULL CHECK ("setupIntentSnapshotHash" ~ '^[0-9a-f]{64}$'),
  "idempotencyKey" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','submitting','reconciliation_required','provider_confirmed')),
  "executionToken" TEXT,
  "executionLeaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  "nextRetryAt" TIMESTAMP(3),
  "stripePaymentIntentId" TEXT CHECK ("stripePaymentIntentId" IS NULL OR "stripePaymentIntentId" ~ '^pi_[A-Za-z0-9_]+$'),
  "providerStatus" TEXT CHECK ("providerStatus" IS NULL OR "providerStatus" IN ('succeeded','processing','requires_action','requires_payment_method','requires_confirmation','canceled')),
  "providerSnapshot" JSONB,
  "providerSnapshotHash" TEXT CHECK ("providerSnapshotHash" IS NULL OR "providerSnapshotHash" ~ '^[0-9a-f]{64}$'),
  "observedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK (("executionToken" IS NULL) = ("executionLeaseUntil" IS NULL)),
  CHECK (("requestedAt" IS NULL AND attempts = 0) OR ("requestedAt" IS NOT NULL AND attempts > 0)),
  CHECK (("providerStatus" IS NULL AND "providerSnapshot" IS NULL AND "providerSnapshotHash" IS NULL AND "observedAt" IS NULL) OR
         ("providerStatus" IS NOT NULL AND "providerSnapshot" IS NOT NULL AND "providerSnapshotHash" IS NOT NULL AND "observedAt" IS NOT NULL
          AND "stripePaymentIntentId" IS NOT NULL AND "requestedAt" IS NOT NULL)),
  CHECK (status <> 'provider_confirmed' OR "providerSnapshot" IS NOT NULL),
  CHECK (status <> 'prepared' OR (attempts = 0 AND "providerSnapshot" IS NULL)),
  CHECK ("paymentId" <> "setupPaymentId")
);
CREATE UNIQUE INDEX "AllwainDeferredChargeExecution_paymentId_key" ON "AllwainDeferredChargeExecution"("paymentId");
CREATE UNIQUE INDEX "AllwainDeferredChargeExecution_idempotencyKey_key" ON "AllwainDeferredChargeExecution"("idempotencyKey");
CREATE UNIQUE INDEX "AllwainDeferredChargeExecution_stripePaymentIntentId_key" ON "AllwainDeferredChargeExecution"("stripePaymentIntentId");
CREATE INDEX "AllwainDeferredChargeExecution_status_executionLeaseUntil_idx" ON "AllwainDeferredChargeExecution"("status", "executionLeaseUntil");
CREATE INDEX "AllwainDeferredChargeExecution_nextRetryAt_status_idx" ON "AllwainDeferredChargeExecution"("nextRetryAt", "status");
CREATE INDEX "AllwainDeferredChargeExecution_orderId_createdAt_idx" ON "AllwainDeferredChargeExecution"("orderId", "createdAt");

-- Same transaction-local INSERT evidence pattern as recurring migration 71.
-- UPDATE of a historical payment, timestamps and xmin cannot grant preparation permission.
CREATE FUNCTION allwain_track_new_deferred_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'deferred_charge' THEN
    PERFORM set_config('allwain.deferred_payment_inserts',
      (coalesce(nullif(current_setting('allwain.deferred_payment_inserts', true), ''), '[]')::jsonb || jsonb_build_array(NEW.id))::text, true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_new_deferred_payment AFTER INSERT ON "AllwainPayment"
  FOR EACH ROW EXECUTE FUNCTION allwain_track_new_deferred_payment();

CREATE FUNCTION allwain_guard_deferred_charge_execution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  payment "AllwainPayment"%ROWTYPE;
  setup_payment "AllwainPayment"%ROWTYPE;
  source_order "AllwainOrder"%ROWTYPE;
  mandate "AllwainConsentEvidence"%ROWTYPE;
  settlement "AllwainSettlementPlan"%ROWTYPE;
  mandate_snapshot JSONB;
  expected_request JSONB;
  expected_metadata JSONB;
  expected_setup_metadata JSONB;
  deadline_text TEXT;
  posting BOOLEAN := false;
  observed_amount NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_IMMUTABLE'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['status','executionToken','executionLeaseUntil','attempts','nextRetryAt','stripePaymentIntentId',
        'providerStatus','providerSnapshot','providerSnapshotHash','observedAt','failureCode','updatedAt','requestedAt']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','executionToken','executionLeaseUntil','attempts','nextRetryAt','stripePaymentIntentId',
        'providerStatus','providerSnapshot','providerSnapshotHash','observedAt','failureCode','updatedAt','requestedAt']) OR
       (OLD."requestedAt" IS NOT NULL AND NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt") OR
       (OLD."stripePaymentIntentId" IS NOT NULL AND NEW."stripePaymentIntentId" IS DISTINCT FROM OLD."stripePaymentIntentId") OR
       NEW.attempts < OLD.attempts OR NEW.attempts > OLD.attempts + 1 OR
       (OLD."providerSnapshot" IS NOT NULL AND NEW."providerSnapshot" IS NULL) OR
       (OLD."observedAt" IS NOT NULL AND (NEW."observedAt" IS NULL OR NEW."observedAt" < OLD."observedAt")) OR
       (OLD."providerStatus" IN ('succeeded','canceled') AND NEW."providerStatus" IS DISTINCT FROM OLD."providerStatus") THEN
      RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_IMMUTABLE';
    END IF;
    posting := NEW.attempts = OLD.attempts + 1;
    IF posting AND (NEW.status <> 'submitting' OR NEW."executionToken" IS NULL OR
        NEW."executionToken" IS DISTINCT FROM OLD."executionToken" OR
        OLD."executionLeaseUntil" IS NULL OR OLD."executionLeaseUntil" <= (clock_timestamp() AT TIME ZONE 'UTC') OR
        NEW."executionLeaseUntil" <= (clock_timestamp() AT TIME ZONE 'UTC') OR
        NEW."stripePaymentIntentId" IS NOT NULL OR NEW."providerSnapshot" IS NOT NULL OR
        NEW."requestedAt" > (clock_timestamp() AT TIME ZONE 'UTC') + interval '1 second' OR
        (OLD."requestedAt" IS NOT NULL AND (clock_timestamp() AT TIME ZONE 'UTC') - OLD."requestedAt" >= interval '23 hours')) THEN
      RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_POST_NOT_CLAIMED';
    END IF;
  END IF;

  SELECT * INTO payment FROM "AllwainPayment" WHERE id = NEW."paymentId";
  SELECT * INTO setup_payment FROM "AllwainPayment" WHERE id = NEW."setupPaymentId";
  SELECT * INTO source_order FROM "AllwainOrder" WHERE id = NEW."orderId";
  SELECT * INTO mandate FROM "AllwainConsentEvidence" WHERE id = NEW."mandateConsentId";
  SELECT * INTO settlement FROM "AllwainSettlementPlan" WHERE id = NEW."settlementPlanId";
  -- Observation after submission relies on the immutable request; a changed/closed
  -- setup or revoked mandate must not prevent recovery of an already emitted PI.
  expected_request := NEW."requestSnapshot";
  expected_metadata := expected_request->'metadata';
  IF payment.id IS NULL OR source_order.id IS NULL OR payment."orderId" IS DISTINCT FROM NEW."orderId" OR
     payment.kind IS DISTINCT FROM 'deferred_charge' OR payment.provider IS DISTINCT FROM 'stripe' OR
     payment.amount IS DISTINCT FROM NEW.amount OR source_order."totalAmount" IS DISTINCT FROM NEW.amount OR
     payment.currency IS DISTINCT FROM NEW.currency OR source_order.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_IDENTITY_MISMATCH';
  END IF;
  IF TG_OP = 'INSERT' OR posting THEN
  IF payment.id IS NULL OR setup_payment.id IS NULL OR source_order.id IS NULL OR mandate.id IS NULL OR settlement.id IS NULL OR
     source_order."paymentMode" IS DISTINCT FROM 'preorder' OR payment."orderId" IS DISTINCT FROM source_order.id OR
     payment.kind IS DISTINCT FROM 'deferred_charge' OR payment.provider IS DISTINCT FROM 'stripe' OR
     payment."operationKey" IS NULL OR left(payment."operationKey", length('allwain:deferred_charge:' || source_order.id || ':'))
       IS DISTINCT FROM ('allwain:deferred_charge:' || source_order.id || ':') OR
     setup_payment."orderId" IS DISTINCT FROM source_order.id OR setup_payment.kind IS DISTINCT FROM 'setup' OR setup_payment.provider IS DISTINCT FROM 'stripe' OR
     setup_payment."settlementPlanVersion" IS DISTINCT FROM settlement.version OR setup_payment."settlementSnapshotHash" IS DISTINCT FROM settlement."snapshotHash" OR
     setup_payment."commercialModel" IS DISTINCT FROM source_order."commercialModel" OR setup_payment."businessOfRecord" IS DISTINCT FROM source_order."businessOfRecord" OR
     setup_payment."onBehalfOfStripeAccountId" IS DISTINCT FROM NEW."onBehalfOfStripeAccountId" OR
     coalesce(setup_payment."stripeSetupIntentId", '') !~ '^seti_[A-Za-z0-9_]+$' OR
     coalesce(setup_payment."stripeCheckoutSessionId", '') !~ '^cs_[A-Za-z0-9_]+$' OR
     payment.amount IS DISTINCT FROM NEW.amount OR source_order."totalAmount" IS DISTINCT FROM NEW.amount OR
     payment.currency IS DISTINCT FROM NEW.currency OR source_order.currency IS DISTINCT FROM NEW.currency OR
     payment."stripeCustomerId" IS DISTINCT FROM NEW."stripeCustomerId" OR setup_payment."stripeCustomerId" IS DISTINCT FROM NEW."stripeCustomerId" OR
     payment."stripePaymentMethodId" IS DISTINCT FROM NEW."stripePaymentMethodId" OR setup_payment."stripePaymentMethodId" IS DISTINCT FROM NEW."stripePaymentMethodId" OR
     payment."onBehalfOfStripeAccountId" IS DISTINCT FROM NEW."onBehalfOfStripeAccountId" OR
     source_order."settlementMerchantAccountId" IS DISTINCT FROM NEW."onBehalfOfStripeAccountId" OR
     payment."commercialModel" IS DISTINCT FROM source_order."commercialModel" OR payment."businessOfRecord" IS DISTINCT FROM source_order."businessOfRecord" OR
     (payment."commercialModel" = 'platform_direct' AND NEW."onBehalfOfStripeAccountId" IS NOT NULL) OR
     (payment."commercialModel" <> 'platform_direct' AND NEW."onBehalfOfStripeAccountId" IS NULL) OR
     settlement.id IS DISTINCT FROM payment."settlementPlanId" OR settlement."orderId" IS DISTINCT FROM source_order.id OR
     settlement.version IS DISTINCT FROM payment."settlementPlanVersion" OR settlement.version IS DISTINCT FROM source_order."settlementPlanVersion" OR
     settlement."snapshotHash" IS DISTINCT FROM payment."settlementSnapshotHash" OR settlement."snapshotHash" IS DISTINCT FROM source_order."settlementSnapshotHash" OR
     coalesce(settlement."snapshotHash", '') !~ '^[a-f0-9]{64}$' OR settlement."grossAmount" IS DISTINCT FROM NEW.amount OR settlement.currency IS DISTINCT FROM NEW.currency OR
     settlement."commercialModel" IS DISTINCT FROM payment."commercialModel" OR settlement."businessOfRecord" IS DISTINCT FROM payment."businessOfRecord" THEN
    RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_IDENTITY_MISMATCH';
  END IF;
  deadline_text := to_char(source_order."preorderChargeDeadlineAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  mandate_snapshot := mandate.evidence->'mandate';
  IF mandate."orderId" IS DISTINCT FROM source_order.id OR mandate."userId" IS DISTINCT FROM source_order."buyerUserId" OR
     mandate."consentType" IS DISTINCT FROM 'preorder_off_session_mandate' OR
     mandate."documentVersion" IS DISTINCT FROM source_order."preorderMandateVersion" OR source_order."preorderMandateAcceptedAt" IS NULL OR
     coalesce(mandate."evidenceHash", '') !~ '^[a-f0-9]{64}$' OR mandate."evidenceHash" IS DISTINCT FROM source_order."preorderMandateEvidenceHash" OR
     jsonb_typeof(mandate_snapshot) IS DISTINCT FROM 'object' OR
     mandate_snapshot->>'version' IS DISTINCT FROM mandate."documentVersion" OR
     mandate_snapshot->>'orderId' IS DISTINCT FROM source_order.id OR mandate_snapshot->>'contractId' IS DISTINCT FROM source_order."contractId" OR
     mandate_snapshot->>'offerId' IS DISTINCT FROM source_order."offerId" OR mandate_snapshot->>'buyerUserId' IS DISTINCT FROM source_order."buyerUserId" OR
     mandate_snapshot->>'sellerUserId' IS DISTINCT FROM source_order."sellerUserId" OR
     mandate_snapshot->>'chargeType' IS DISTINCT FROM 'one_time_off_session' OR mandate_snapshot->>'paymentProcessor' IS DISTINCT FROM 'stripe' OR
     mandate_snapshot->>'paymentMethodStorage' IS DISTINCT FROM 'stripe' OR mandate_snapshot->'maximumChargeAmount' IS DISTINCT FROM to_jsonb(NEW.amount) OR
     mandate_snapshot->>'currency' IS DISTINCT FROM NEW.currency OR source_order."preorderChargeDeadlineAt" IS NULL OR
     mandate_snapshot->>'chargeDeadlineAt' IS DISTINCT FROM deadline_text OR
     mandate_snapshot->'settlementPlanVersion' IS DISTINCT FROM to_jsonb(settlement.version) OR
     mandate_snapshot->>'settlementSnapshotHash' IS DISTINCT FROM settlement."snapshotHash" OR
     payment.metadata->>'preorderMandateVersion' IS DISTINCT FROM mandate."documentVersion" OR
     payment.metadata->>'preorderMandateEvidenceHash' IS DISTINCT FROM mandate."evidenceHash" OR
     payment.metadata->>'preorderChargeDeadlineAt' IS DISTINCT FROM deadline_text THEN
    RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_MANDATE_MISMATCH';
  END IF;
  expected_metadata := jsonb_build_object('scope','allwain_order','orderId',source_order.id,'contractId',source_order."contractId",'paymentId',payment.id,
    'deferredChargeExecutionVersion','1','setupPaymentId',setup_payment.id,'mandateConsentId',mandate.id,
    'preorderMandateVersion',mandate."documentVersion",'preorderMandateEvidenceHash',mandate."evidenceHash",'preorderChargeDeadlineAt',deadline_text,
    'settlementPlanId',settlement.id,'settlementPlanVersion',settlement.version::text,'settlementSnapshotHash',settlement."snapshotHash",
    'commercialModel',payment."commercialModel",'businessOfRecord',payment."businessOfRecord");
  expected_request := jsonb_strip_nulls(jsonb_build_object('amount',NEW.amount,'currency',NEW.currency,'customer',NEW."stripeCustomerId",
    'payment_method',NEW."stripePaymentMethodId",'off_session',true,'confirm',true,'on_behalf_of',NEW."onBehalfOfStripeAccountId",
    'transfer_group','allwain_order_' || source_order.id,'metadata',expected_metadata));
  expected_setup_metadata := jsonb_build_object('scope','allwain_order','orderId',source_order.id,'contractId',source_order."contractId",'paymentId',setup_payment.id,
    'buyerUserId',source_order."buyerUserId",'sellerUserId',source_order."sellerUserId",
    'settlementPlanVersion',settlement.version::text,'settlementSnapshotHash',settlement."snapshotHash",
    'commercialModel',payment."commercialModel",'businessOfRecord',payment."businessOfRecord",
    'preorderMandateVersion',mandate."documentVersion",'preorderMandateEvidenceHash',mandate."evidenceHash",'preorderChargeDeadlineAt',deadline_text);
  IF NEW."requestSnapshot" IS DISTINCT FROM expected_request OR NEW."idempotencyKey" IS DISTINCT FROM ('allwain-deferred-' || payment.id) OR
     NEW."setupIntentSnapshot" IS DISTINCT FROM jsonb_build_object('object','setup_intent','id',setup_payment."stripeSetupIntentId",
       'status','succeeded','livemode',false,'usage','off_session','customer',NEW."stripeCustomerId",'payment_method',NEW."stripePaymentMethodId",
       'on_behalf_of',NEW."onBehalfOfStripeAccountId",'metadata',expected_setup_metadata) THEN
    RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_SNAPSHOT_MISMATCH';
  END IF;
  END IF;

  IF TG_OP = 'INSERT' AND (
     NOT (coalesce(nullif(current_setting('allwain.deferred_payment_inserts', true), ''), '[]')::jsonb ? NEW."paymentId") OR
     payment.status IS DISTINCT FROM 'processing' OR payment."stripePaymentIntentId" IS NOT NULL OR payment."paidAt" IS NOT NULL OR
     NEW."requestedAt" IS NOT NULL OR NEW.attempts <> 0 OR NEW.status <> 'prepared' OR NEW."stripePaymentIntentId" IS NOT NULL OR
     NEW."providerSnapshot" IS NOT NULL OR NEW."providerStatus" IS NOT NULL OR NEW."observedAt" IS NOT NULL OR
     NEW."providerSnapshotHash" IS NOT NULL OR NEW."executionToken" IS NOT NULL OR NEW."nextRetryAt" IS NOT NULL OR NEW."failureCode" IS NOT NULL OR
     NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = NEW."actorUserId" AND (u.id = source_order."sellerUserId" OR u.role = 'admin'))
  ) THEN RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_NOT_NEW_REQUESTED_PAYMENT'; END IF;

  IF TG_OP = 'INSERT' OR posting THEN
    IF source_order."operationalArchivedAt" IS NOT NULL OR source_order."paymentStatus" NOT IN ('payment_method_saved','payment_processing') OR
       source_order."inventoryStatus" NOT IN ('reserved','not_managed') OR
       source_order."preorderChargeDeadlineAt" <= (clock_timestamp() AT TIME ZONE 'UTC') OR
       (source_order."reservationExpiresAt" IS NOT NULL AND source_order."reservationExpiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')) OR
       payment."paidAt" IS NOT NULL OR payment."stripePaymentIntentId" IS NOT NULL OR payment.status NOT IN ('processing','payment_processing') OR
       setup_payment.status IS DISTINCT FROM 'payment_method_saved' OR mandate.granted IS DISTINCT FROM true OR
       source_order."commercialTermsAcceptedAt" IS NULL OR settlement.status IS DISTINCT FROM 'checkout_locked' OR
       NOT EXISTS (SELECT 1 FROM "AllwainTaxDetermination" t WHERE t."orderId" = source_order.id AND t.status = 'determined') OR
       NOT EXISTS (SELECT 1 FROM "AllwainConsentEvidence" c WHERE c."orderId" = source_order.id AND c."userId" = source_order."buyerUserId" AND
         c."consentType" = 'marketplace_purchase_terms' AND c."documentVersion" = source_order."commercialTermsVersion" AND c.granted AND c."evidenceHash" IS NOT NULL) OR
       (NEW."onBehalfOfStripeAccountId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AllwainSellerPaymentAccount" s
         WHERE s."userId" = source_order."sellerUserId" AND s."stripeAccountId" = NEW."onBehalfOfStripeAccountId" AND
         s."chargesEnabled" AND s."transfersEnabled" AND s."payoutsEnabled")) THEN
      RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_POST_RESTRICTED';
    END IF;
    IF EXISTS (SELECT 1 FROM "AllwainPayment" other WHERE other."orderId" = source_order.id AND other.id <> payment.id
      AND other.kind IN ('payment','recurring_charge','deferred_charge')) THEN
      RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_OTHER_PAYMENT_UNRESOLVED';
    END IF;
  END IF;

  IF NEW."stripePaymentIntentId" IS NOT NULL AND payment."stripePaymentIntentId" IS DISTINCT FROM NEW."stripePaymentIntentId" THEN
    RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_PROVIDER_ID_CONFLICT';
  END IF;
  IF NEW."providerSnapshot" IS NOT NULL THEN
    IF jsonb_typeof(NEW."providerSnapshot") IS DISTINCT FROM 'object' OR
       NEW."providerSnapshot"->>'object' IS DISTINCT FROM 'payment_intent' OR
       NEW."providerSnapshot"->>'id' IS DISTINCT FROM NEW."stripePaymentIntentId" OR
       NEW."providerSnapshot"->>'status' IS DISTINCT FROM NEW."providerStatus" OR
       NEW."providerSnapshot"->'livemode' IS DISTINCT FROM 'false'::jsonb OR
       NEW."providerSnapshot"->'amount' IS DISTINCT FROM to_jsonb(NEW.amount) OR
       NEW."providerSnapshot"->>'currency' IS DISTINCT FROM NEW.currency OR
       NEW."providerSnapshot"->>'customer' IS DISTINCT FROM NEW."stripeCustomerId" OR
       NEW."providerSnapshot"->>'payment_method' IS DISTINCT FROM NEW."stripePaymentMethodId" OR
       NEW."providerSnapshot"->>'on_behalf_of' IS DISTINCT FROM NEW."onBehalfOfStripeAccountId" OR
       NEW."providerSnapshot"->>'transfer_group' IS DISTINCT FROM expected_request->>'transfer_group' OR
       NEW."providerSnapshot"->'metadata' IS DISTINCT FROM expected_metadata OR
       NEW."providerSnapshot" ? 'transfer_data' OR NEW."providerSnapshot" ? 'application_fee_amount' OR
       jsonb_typeof(NEW."providerSnapshot"->'amount_received') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_PROVIDER_SNAPSHOT_MISMATCH';
    END IF;
    observed_amount := (NEW."providerSnapshot"->>'amount_received')::numeric;
    IF observed_amount < 0 OR observed_amount > NEW.amount OR observed_amount <> trunc(observed_amount) OR
       (NEW."providerStatus" = 'succeeded' AND observed_amount <> NEW.amount) OR
       (NEW."providerStatus" = 'canceled' AND observed_amount <> 0) OR
       (payment."paidAt" IS NOT NULL AND NEW."providerStatus" <> 'succeeded') THEN
      RAISE EXCEPTION 'DEFERRED_CHARGE_EXECUTION_PROVIDER_SNAPSHOT_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_deferred_charge_execution_guard BEFORE INSERT OR UPDATE OR DELETE
  ON "AllwainDeferredChargeExecution" FOR EACH ROW EXECUTE FUNCTION allwain_guard_deferred_charge_execution();
