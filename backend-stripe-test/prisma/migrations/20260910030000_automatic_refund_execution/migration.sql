-- New first detections only. No historical backfill or commercial refund rows.
CREATE TABLE "AllwainAutomaticRefundExecution" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "AllwainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentId" TEXT NOT NULL REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "validPaymentId" TEXT REFERENCES "AllwainPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "detectionAuditEventId" TEXT NOT NULL REFERENCES "AllwainAuditEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reason" TEXT NOT NULL CHECK (reason IN ('duplicate','late')),
  "stripeMode" TEXT NOT NULL DEFAULT 'test' CHECK ("stripeMode" = 'test'),
  "amount" INTEGER NOT NULL CHECK (amount > 0),
  "currency" TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  "stripePaymentIntentId" TEXT NOT NULL CHECK ("stripePaymentIntentId" ~ '^pi_[A-Za-z0-9_]+$'),
  "stripeChargeId" TEXT NOT NULL CHECK ("stripeChargeId" ~ '^ch_[A-Za-z0-9_]+$'),
  "sourceSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("sourceSnapshot") = 'object'),
  "sourceSnapshotHash" TEXT NOT NULL CHECK ("sourceSnapshotHash" ~ '^[a-f0-9]{64}$'),
  "requestSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("requestSnapshot") = 'object'),
  "requestHash" TEXT NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  "idempotencyKey" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  "status" TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','submitting','reconciliation_required','provider_observed')),
  "executionToken" TEXT, "executionLeaseUntil" TIMESTAMP(3), "nextRetryAt" TIMESTAMP(3),
  "stripeRefundId" TEXT CHECK ("stripeRefundId" IS NULL OR "stripeRefundId" ~ '^re_[A-Za-z0-9_]+$'),
  "providerStatus" TEXT CHECK ("providerStatus" IS NULL OR "providerStatus" IN ('pending','requires_action','succeeded','failed','canceled')),
  "providerSnapshot" JSONB, "providerSnapshotHash" TEXT,
  "observationRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("observationRevision" >= 0),
  "confirmedReturnedAmount" INTEGER NOT NULL DEFAULT 0 CHECK ("confirmedReturnedAmount" IN (0, amount)),
  "observedAt" TIMESTAMP(3), "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK (("requestedAt" IS NULL AND attempts = 0) OR ("requestedAt" IS NOT NULL AND attempts > 0)),
  CHECK (("executionToken" IS NULL) = ("executionLeaseUntil" IS NULL)),
  CHECK (("providerSnapshot" IS NULL AND "providerSnapshotHash" IS NULL AND "providerStatus" IS NULL AND "observedAt" IS NULL AND "observationRevision" = 0 AND "confirmedReturnedAmount" = 0) OR
    ("providerSnapshot" IS NOT NULL AND "providerSnapshotHash" IS NOT NULL AND "providerSnapshotHash" ~ '^[a-f0-9]{64}$' AND "providerStatus" IS NOT NULL AND "observedAt" IS NOT NULL
     AND "observationRevision" > 0 AND "stripeRefundId" IS NOT NULL AND "requestedAt" IS NOT NULL)),
  CHECK (status <> 'provider_observed' OR "providerSnapshot" IS NOT NULL),
  CHECK (status <> 'prepared' OR (attempts = 0 AND "stripeRefundId" IS NULL AND "observationRevision" = 0)),
  CHECK ("validPaymentId" IS NULL OR "validPaymentId" <> "paymentId")
);
CREATE UNIQUE INDEX "AllwainAutomaticRefundExecution_paymentId_key" ON "AllwainAutomaticRefundExecution"("paymentId");
CREATE UNIQUE INDEX "AllwainAutomaticRefundExecution_detectionAuditEventId_key" ON "AllwainAutomaticRefundExecution"("detectionAuditEventId");
CREATE UNIQUE INDEX "AllwainAutomaticRefundExecution_stripePaymentIntentId_key" ON "AllwainAutomaticRefundExecution"("stripePaymentIntentId");
CREATE UNIQUE INDEX "AllwainAutomaticRefundExecution_stripeChargeId_key" ON "AllwainAutomaticRefundExecution"("stripeChargeId");
CREATE UNIQUE INDEX "AllwainAutomaticRefundExecution_idempotencyKey_key" ON "AllwainAutomaticRefundExecution"("idempotencyKey");
CREATE UNIQUE INDEX "AllwainAutomaticRefundExecution_stripeRefundId_key" ON "AllwainAutomaticRefundExecution"("stripeRefundId");
CREATE INDEX "AllwainAutomaticRefundExecution_status_executionLeaseUntil_idx" ON "AllwainAutomaticRefundExecution"("status","executionLeaseUntil");
CREATE INDEX "AllwainAutomaticRefundExecution_nextRetryAt_status_idx" ON "AllwainAutomaticRefundExecution"("nextRetryAt","status");
CREATE INDEX "AllwainAutomaticRefundExecution_orderId_createdAt_idx" ON "AllwainAutomaticRefundExecution"("orderId","createdAt");

CREATE TABLE "AllwainAutomaticRefundObservation" (
  "id" TEXT PRIMARY KEY,
  "executionId" TEXT NOT NULL REFERENCES "AllwainAutomaticRefundExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL CHECK (revision > 0),
  "stripeRefundId" TEXT NOT NULL CHECK ("stripeRefundId" ~ '^re_[A-Za-z0-9_]+$'),
  "providerStatus" TEXT NOT NULL CHECK ("providerStatus" IN ('pending','requires_action','succeeded','failed','canceled')),
  "confirmedReturnedAmount" INTEGER NOT NULL CHECK ("confirmedReturnedAmount" >= 0),
  "providerSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("providerSnapshot") = 'object'),
  "snapshotHash" TEXT NOT NULL CHECK ("snapshotHash" ~ '^[a-f0-9]{64}$'),
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AllwainAutomaticRefundObservation_executionId_revision_key" ON "AllwainAutomaticRefundObservation"("executionId","revision");

-- Both markers expire at transaction end. No old duplicate row/audit can grant permission.
CREATE FUNCTION allwain_track_new_automatic_refund_detection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'duplicate_payment' AND OLD.status NOT IN ('duplicate_payment','duplicate_refunded','duplicate_refund_review') AND
     OLD."paidAt" IS NULL AND OLD."stripeRefundId" IS NULL AND OLD."refundedAmount" = 0 AND
     coalesce(OLD."failureCode", '') NOT IN ('ORDER_ALREADY_PAID','ORDER_NO_LONGER_PAYABLE') AND
     coalesce(OLD."failureCode", '') NOT LIKE 'AUTOMATIC\_REFUND\_%' THEN
    PERFORM set_config('allwain.automatic_refund_payment_detections',
      (coalesce(nullif(current_setting('allwain.automatic_refund_payment_detections', true), ''), '[]')::jsonb || jsonb_build_array(NEW.id))::text, true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_new_automatic_refund_detection AFTER UPDATE ON "AllwainPayment"
  FOR EACH ROW EXECUTE FUNCTION allwain_track_new_automatic_refund_detection();
CREATE FUNCTION allwain_track_new_automatic_refund_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."eventType" = 'payment.duplicate_or_late_charge_detected' AND NEW.source = 'automatic_refund_execution' THEN
    PERFORM set_config('allwain.automatic_refund_audit_inserts',
      (coalesce(nullif(current_setting('allwain.automatic_refund_audit_inserts', true), ''), '[]')::jsonb || jsonb_build_array(NEW.id))::text, true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_new_automatic_refund_audit AFTER INSERT ON "AllwainAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION allwain_track_new_automatic_refund_audit();

CREATE FUNCTION allwain_guard_automatic_refund_execution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment "AllwainPayment"%ROWTYPE;
  source_order "AllwainOrder"%ROWTYPE;
  detection "AllwainAuditEvent"%ROWTYPE;
  expected_request JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'AUTOMATIC_REFUND_EXECUTION_IMMUTABLE'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['requestedAt','attempts','status','executionToken','executionLeaseUntil','nextRetryAt','stripeRefundId',
      'providerStatus','providerSnapshot','providerSnapshotHash','observationRevision','confirmedReturnedAmount','observedAt','failureCode','updatedAt']) IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['requestedAt','attempts','status','executionToken','executionLeaseUntil','nextRetryAt','stripeRefundId',
      'providerStatus','providerSnapshot','providerSnapshotHash','observationRevision','confirmedReturnedAmount','observedAt','failureCode','updatedAt']) OR
      (OLD."requestedAt" IS NOT NULL AND NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt") OR
      (OLD."stripeRefundId" IS NOT NULL AND NEW."stripeRefundId" IS DISTINCT FROM OLD."stripeRefundId") OR
      NEW.attempts < OLD.attempts OR NEW.attempts > OLD.attempts + 1 OR
      NEW."observationRevision" < OLD."observationRevision" OR NEW."observationRevision" > OLD."observationRevision" + 1 OR
      (OLD."providerSnapshot" IS NOT NULL AND NEW."providerSnapshot" IS NULL) OR
      (OLD."observedAt" IS NOT NULL AND (NEW."observedAt" IS NULL OR NEW."observedAt" < OLD."observedAt")) THEN
      RAISE EXCEPTION 'AUTOMATIC_REFUND_EXECUTION_IMMUTABLE';
    END IF;
    IF NEW.attempts > OLD.attempts AND (
      NEW.status <> 'submitting' OR NEW."executionToken" IS NULL OR NEW."executionToken" IS DISTINCT FROM OLD."executionToken" OR
      OLD."executionLeaseUntil" IS NULL OR OLD."executionLeaseUntil" <= (clock_timestamp() AT TIME ZONE 'UTC') OR
      NEW."executionLeaseUntil" <= (clock_timestamp() AT TIME ZONE 'UTC') OR OLD."stripeRefundId" IS NOT NULL OR OLD."providerSnapshot" IS NOT NULL OR
      NEW."stripeRefundId" IS NOT NULL OR NEW."providerSnapshot" IS NOT NULL OR NEW."requestedAt" IS NULL OR
      (OLD."requestedAt" IS NOT NULL AND (clock_timestamp() AT TIME ZONE 'UTC') - OLD."requestedAt" >= interval '23 hours')) THEN
      RAISE EXCEPTION 'AUTOMATIC_REFUND_POST_NOT_CLAIMED';
    END IF;
    IF NEW."providerSnapshot" IS DISTINCT FROM OLD."providerSnapshot" AND NEW."observationRevision" <> OLD."observationRevision" + 1 THEN
      RAISE EXCEPTION 'AUTOMATIC_REFUND_OBSERVATION_REVISION_CONFLICT';
    END IF;
  END IF;
  SELECT * INTO payment FROM "AllwainPayment" WHERE id = NEW."paymentId";
  SELECT * INTO source_order FROM "AllwainOrder" WHERE id = NEW."orderId";
  IF payment.id IS NULL OR source_order.id IS NULL OR payment."orderId" IS DISTINCT FROM NEW."orderId" OR payment.provider IS DISTINCT FROM 'stripe' OR
     payment.kind NOT IN ('payment','recurring_charge','deferred_charge') OR payment."paidAt" IS NOT NULL OR payment.amount IS DISTINCT FROM NEW.amount OR
     payment.currency IS DISTINCT FROM NEW.currency OR payment."stripePaymentIntentId" IS DISTINCT FROM NEW."stripePaymentIntentId" OR
     payment."stripeChargeId" IS DISTINCT FROM NEW."stripeChargeId" THEN RAISE EXCEPTION 'AUTOMATIC_REFUND_SOURCE_MISMATCH'; END IF;
  IF payment."stripeTransferId" IS NOT NULL OR payment."sellerTransferId" IS NOT NULL OR payment."connectorTransferId" IS NOT NULL OR
     payment."stripeConnectorTransferId" IS NOT NULL OR EXISTS (SELECT 1 FROM "AllwainTransfer" transfer WHERE transfer."paymentId" = payment.id) OR
     EXISTS (SELECT 1 FROM "AllwainLedgerEntry" entry WHERE entry."paymentId" = payment.id OR
       (entry."orderId" = NEW."orderId" AND entry."referenceId" IN (payment.id, NEW."stripePaymentIntentId", NEW."stripeChargeId"))) THEN
    RAISE EXCEPTION 'AUTOMATIC_REFUND_COMMERCIAL_EFFECTS_REVIEW_REQUIRED';
  END IF;
  expected_request := jsonb_build_object('payment_intent',NEW."stripePaymentIntentId",'amount',NEW.amount,
    'metadata',jsonb_build_object('scope','allwain_duplicate_payment','orderId',NEW."orderId",'paymentId',NEW."paymentId"));
  IF NEW."requestSnapshot" IS DISTINCT FROM expected_request OR NEW."idempotencyKey" IS DISTINCT FROM ('allwain-duplicate-refund-' || NEW."paymentId") OR
     NEW."sourceSnapshot"->'version' IS DISTINCT FROM '1'::jsonb OR NEW."sourceSnapshot"->>'stripeMode' IS DISTINCT FROM 'test' OR
     NEW."sourceSnapshot"->>'orderId' IS DISTINCT FROM NEW."orderId" OR NEW."sourceSnapshot"->>'paymentId' IS DISTINCT FROM NEW."paymentId" OR
     NEW."sourceSnapshot"->>'contractId' IS DISTINCT FROM source_order."contractId" OR
     NEW."sourceSnapshot"->'intentMetadata'->>'scope' IS DISTINCT FROM 'allwain_order' OR
     NEW."sourceSnapshot"->'intentMetadata'->>'orderId' IS DISTINCT FROM NEW."orderId" OR
     NEW."sourceSnapshot"->'intentMetadata'->>'paymentId' IS DISTINCT FROM NEW."paymentId" OR
     NEW."sourceSnapshot"->'intentMetadata'->>'contractId' IS DISTINCT FROM source_order."contractId" OR
     NEW."sourceSnapshot"->>'stripePaymentIntentId' IS DISTINCT FROM NEW."stripePaymentIntentId" OR NEW."sourceSnapshot"->>'stripeChargeId' IS DISTINCT FROM NEW."stripeChargeId" OR
     NEW."sourceSnapshot"->'amount' IS DISTINCT FROM to_jsonb(NEW.amount) OR NEW."sourceSnapshot"->>'currency' IS DISTINCT FROM NEW.currency OR
     NEW."sourceSnapshot"->>'paymentArchitecture' IS DISTINCT FROM 'separate_charges_and_transfers' OR
     NEW."sourceSnapshot"->>'transferId' IS NOT NULL OR NEW."sourceSnapshot"->>'applicationFeeId' IS NOT NULL OR
     NEW."sourceSnapshot"->>'intentStatus' IS DISTINCT FROM 'succeeded' OR NEW."sourceSnapshot"->'amountReceived' IS DISTINCT FROM to_jsonb(NEW.amount) OR
     NEW."sourceSnapshot"->'chargePaid' IS DISTINCT FROM 'true'::jsonb OR NEW."sourceSnapshot"->'chargeCaptured' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'AUTOMATIC_REFUND_SNAPSHOT_MISMATCH';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO detection FROM "AllwainAuditEvent" WHERE id = NEW."detectionAuditEventId";
    IF NOT (coalesce(nullif(current_setting('allwain.automatic_refund_payment_detections', true), ''), '[]')::jsonb ? NEW."paymentId") OR
       NOT (coalesce(nullif(current_setting('allwain.automatic_refund_audit_inserts', true), ''), '[]')::jsonb ? NEW."detectionAuditEventId") OR
       payment.status IS DISTINCT FROM 'duplicate_payment' OR payment."stripeRefundId" IS NOT NULL OR payment."refundedAmount" <> 0 OR
       NEW.status <> 'prepared' OR NEW."requestedAt" IS NOT NULL OR NEW.attempts <> 0 OR NEW."executionToken" IS NOT NULL OR
       NEW."stripeRefundId" IS NOT NULL OR NEW."providerSnapshot" IS NOT NULL OR NEW."observationRevision" <> 0 OR NEW."nextRetryAt" IS NOT NULL OR
       detection.id IS NULL OR detection."aggregateType" <> 'order' OR detection."aggregateId" IS DISTINCT FROM NEW."orderId" OR
       detection."eventType" IS DISTINCT FROM 'payment.duplicate_or_late_charge_detected' OR detection.source IS DISTINCT FROM 'automatic_refund_execution' OR
       detection.payload->>'paymentId' IS DISTINCT FROM NEW."paymentId" OR detection.payload->>'paymentIntentId' IS DISTINCT FROM NEW."stripePaymentIntentId" OR
       detection.payload->>'chargeId' IS DISTINCT FROM NEW."stripeChargeId" OR detection.payload->>'reason' IS DISTINCT FROM NEW.reason OR
       detection.payload->>'existingPaidPaymentId' IS DISTINCT FROM NEW."validPaymentId" OR
       source_order."paymentArchitecture" IS DISTINCT FROM 'separate_charges_and_transfers' OR payment.kind = 'deferred_charge' OR
       (payment.kind = 'recurring_charge' AND (source_order."paymentStatus" IN ('canceled','expired','refunded') OR source_order."inventoryStatus" = 'released')) OR
       EXISTS (SELECT 1 FROM "AllwainAuditEvent" old_audit WHERE old_audit."aggregateType" = 'order' AND old_audit."aggregateId" = NEW."orderId" AND
         old_audit.id <> detection.id AND old_audit.payload->>'paymentId' = NEW."paymentId" AND
         old_audit."eventType" IN ('payment.duplicate_or_late_charge_detected','payment.duplicate_refunded','payment.duplicate_refund_confirmed',
           'payment.automatic_refund_observed','payment.automatic_refund_review_required')) THEN
      RAISE EXCEPTION 'AUTOMATIC_REFUND_NOT_NEW_DETECTION';
    END IF;
    IF (NEW.reason = 'duplicate' AND NOT EXISTS (SELECT 1 FROM "AllwainPayment" valid WHERE valid.id = NEW."validPaymentId" AND
        valid."orderId" = NEW."orderId" AND valid."paidAt" IS NOT NULL AND valid.id <> NEW."paymentId" AND
        valid.kind IN ('payment','recurring_charge','deferred_charge') AND valid."stripePaymentIntentId" IS DISTINCT FROM NEW."stripePaymentIntentId" AND
        valid."stripeChargeId" IS DISTINCT FROM NEW."stripeChargeId")) OR
       (NEW.reason = 'late' AND (NEW."validPaymentId" IS NOT NULL OR
          (source_order."paymentStatus" NOT IN ('canceled','expired','refunded') AND
           NOT (payment.kind IN ('recurring_charge','deferred_charge') AND source_order."inventoryStatus" = 'released')))) THEN
      RAISE EXCEPTION 'AUTOMATIC_REFUND_NOT_AN_EXTRA_CHARGE';
    END IF;
  END IF;
  IF NEW."stripeRefundId" IS NOT NULL AND ((payment."stripeRefundId" IS NOT NULL AND payment."stripeRefundId" IS DISTINCT FROM NEW."stripeRefundId") OR
     EXISTS (SELECT 1 FROM "AllwainPayment" other WHERE other.id <> payment.id AND other."stripeRefundId" = NEW."stripeRefundId")) THEN
    RAISE EXCEPTION 'AUTOMATIC_REFUND_PROVIDER_ID_CONFLICT';
  END IF;
  IF NEW."providerSnapshot" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AllwainAutomaticRefundObservation" observation WHERE
      observation."executionId" = NEW.id AND observation.revision = NEW."observationRevision" AND observation."stripeRefundId" = NEW."stripeRefundId" AND
      observation."providerStatus" = NEW."providerStatus" AND observation."providerSnapshot" = NEW."providerSnapshot" AND
      observation."snapshotHash" = NEW."providerSnapshotHash" AND observation."confirmedReturnedAmount" = NEW."confirmedReturnedAmount") THEN
    RAISE EXCEPTION 'AUTOMATIC_REFUND_OBSERVATION_MISSING';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_automatic_refund_execution_guard BEFORE INSERT OR UPDATE OR DELETE
  ON "AllwainAutomaticRefundExecution" FOR EACH ROW EXECUTE FUNCTION allwain_guard_automatic_refund_execution();

CREATE FUNCTION allwain_guard_automatic_refund_observation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE execution "AllwainAutomaticRefundExecution"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'AUTOMATIC_REFUND_OBSERVATION_IMMUTABLE'; END IF;
  SELECT * INTO execution FROM "AllwainAutomaticRefundExecution" WHERE id = NEW."executionId" FOR UPDATE;
  IF execution.id IS NULL OR execution."requestedAt" IS NULL OR NEW.revision <> execution."observationRevision" + 1 OR
     (execution."stripeRefundId" IS NOT NULL AND NEW."stripeRefundId" IS DISTINCT FROM execution."stripeRefundId") OR
     NEW."confirmedReturnedAmount" IS DISTINCT FROM (CASE WHEN NEW."providerStatus" = 'succeeded' THEN execution.amount ELSE 0 END) OR
     NEW."providerSnapshot"->>'object' IS DISTINCT FROM 'refund' OR NEW."providerSnapshot"->>'id' IS DISTINCT FROM NEW."stripeRefundId" OR
     NEW."providerSnapshot"->>'status' IS DISTINCT FROM NEW."providerStatus" OR NEW."providerSnapshot"->'amount' IS DISTINCT FROM to_jsonb(execution.amount) OR
     NEW."providerSnapshot"->>'currency' IS DISTINCT FROM execution.currency OR
     NEW."providerSnapshot"->>'transfer_reversal' IS NOT NULL OR NEW."providerSnapshot"->>'source_transfer_reversal' IS NOT NULL OR
     NEW."providerSnapshot"->>'payment_intent' IS DISTINCT FROM execution."stripePaymentIntentId" OR NEW."providerSnapshot"->>'charge' IS DISTINCT FROM execution."stripeChargeId" OR
     NEW."providerSnapshot"->'metadata' IS DISTINCT FROM execution."requestSnapshot"->'metadata' THEN
    RAISE EXCEPTION 'AUTOMATIC_REFUND_OBSERVATION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allwain_automatic_refund_observation_guard BEFORE INSERT OR UPDATE OR DELETE
  ON "AllwainAutomaticRefundObservation" FOR EACH ROW EXECUTE FUNCTION allwain_guard_automatic_refund_observation();
