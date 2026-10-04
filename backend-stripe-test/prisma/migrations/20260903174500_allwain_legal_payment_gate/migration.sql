ALTER TABLE "AllwainSellerPaymentAccount"
  ADD COLUMN "merchantStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "chargesEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Contract"
  ADD COLUMN "preorderChargeDeadlineAt" TIMESTAMP(3);

ALTER TABLE "AllwainOrder"
  ADD COLUMN "commercialTermsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "commercialTermsSnapshotHash" TEXT,
  ADD COLUMN "shippingAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "agriculturalCompensationAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "businessOfRecord" TEXT NOT NULL DEFAULT 'seller',
  ADD COLUMN "processorFeePayer" TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN "settlementMerchantAccountId" TEXT,
  ADD COLUMN "settlementPlanVersion" INTEGER,
  ADD COLUMN "settlementSnapshotHash" TEXT,
  ADD COLUMN "preorderChargeDeadlineAt" TIMESTAMP(3),
  ADD COLUMN "preorderMandateVersion" TEXT,
  ADD COLUMN "preorderMandateAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "preorderMandateEvidenceHash" TEXT;

UPDATE "AllwainOrder"
SET "totalAmount" = "subtotalAmount"
WHERE "totalAmount" = 0;

-- Legacy orders created before the connector-share split may have kept the
-- derived platform net at zero. Recompute only that derived value; the
-- historical gross, seller amount and configured fee remain untouched.
UPDATE "AllwainOrder"
SET "platformNetFeeAmount" = "platformFeeAmount" - "connectorFeeAmount"
WHERE "platformNetFeeAmount" <> "platformFeeAmount" - "connectorFeeAmount";

ALTER TABLE "AllwainPayment"
  ADD COLUMN "settlementPlanId" TEXT,
  ADD COLUMN "settlementPlanVersion" INTEGER,
  ADD COLUMN "settlementSnapshotHash" TEXT,
  ADD COLUMN "onBehalfOfStripeAccountId" TEXT,
  ADD COLUMN "processorFeePayer" TEXT NOT NULL DEFAULT 'platform';

ALTER TABLE "AllwainTaxDetermination"
  ADD COLUMN "professionalApprovalReference" TEXT,
  ADD COLUMN "documentPlan" JSONB;

ALTER TABLE "AllwainFiscalProfile"
  ADD COLUMN "documentMandateVersion" TEXT,
  ADD COLUMN "documentMandateAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "documentMandateEvidenceHash" TEXT,
  ADD COLUMN "documentMandateRevokedAt" TIMESTAMP(3);

ALTER TABLE "AllwainSettlementPlan"
  ADD COLUMN "snapshotHash" TEXT,
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "professionalApprovalReference" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "AllwainFiscalDocument"
  ADD COLUMN "signatureRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "signatureStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN "signedByUserId" TEXT,
  ADD COLUMN "signedAt" TIMESTAMP(3),
  ADD COLUMN "signatureEvidence" JSONB,
  ADD COLUMN "signatureHash" TEXT;

ALTER TABLE "AllwainConsentEvidence"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "evidenceHash" TEXT;

CREATE UNIQUE INDEX "AllwainConsentEvidence_idempotencyKey_key"
  ON "AllwainConsentEvidence"("idempotencyKey");

ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_legal_amounts_check"
  CHECK (
    "quantity" > 0 AND
    "unitPriceAmount" >= 0 AND
    "subtotalAmount" >= 0 AND
    "shippingAmount" >= 0 AND
    "taxAmount" >= 0 AND
    "agriculturalCompensationAmount" >= 0 AND
    "totalAmount" >= 0 AND
    "platformFeeAmount" >= 0 AND
    "platformNetFeeAmount" >= 0 AND
    "sellerAmount" >= 0 AND
    "connectorFeeAmount" >= 0 AND
    "refundedAmount" >= 0 AND
    "refundedAmount" <= "totalAmount"
  ),
  ADD CONSTRAINT "AllwainOrder_business_of_record_check"
  CHECK ("businessOfRecord" IN ('seller')),
  ADD CONSTRAINT "AllwainOrder_processor_fee_payer_check"
  CHECK ("processorFeePayer" IN ('platform')),
  ADD CONSTRAINT "AllwainOrder_preorder_mandate_check"
  CHECK (
    "preorderMandateAcceptedAt" IS NULL OR
    (
      "paymentMode" = 'preorder' AND
      "preorderChargeDeadlineAt" IS NOT NULL AND
      "preorderChargeDeadlineAt" > "preorderMandateAcceptedAt" AND
      "preorderMandateVersion" IS NOT NULL AND
      "preorderMandateEvidenceHash" IS NOT NULL
    )
  );

ALTER TABLE "AllwainPayment"
  ADD CONSTRAINT "AllwainPayment_processor_fee_payer_check"
  CHECK ("processorFeePayer" IN ('platform')),
  ADD CONSTRAINT "AllwainPayment_legal_amounts_check"
  CHECK (
    "amount" >= 0 AND
    "platformFeeAmount" >= 0 AND
    "platformNetFeeAmount" >= 0 AND
    "sellerAmount" >= 0 AND
    "connectorFeeAmount" >= 0 AND
    "refundedAmount" >= 0 AND
    ("kind" <> 'payment' OR "refundedAmount" <= "amount") AND
    ("processorFeeAmount" IS NULL OR "processorFeeAmount" >= 0)
  );

ALTER TABLE "AllwainFiscalDocument"
  ADD CONSTRAINT "AllwainFiscalDocument_signature_status_check"
  CHECK ("signatureStatus" IN ('not_required', 'pending', 'signed', 'rejected')),
  ADD CONSTRAINT "AllwainFiscalDocument_signed_evidence_check"
  CHECK (
    "signatureStatus" <> 'signed' OR
    (
      "signatureRequired" = true AND
      "signedByUserId" IS NOT NULL AND
      "signedAt" IS NOT NULL AND
      "signatureHash" IS NOT NULL
    )
  );

ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_allocation_identity_check"
  CHECK (
    "platformFeeAmount" = "platformNetFeeAmount" + "connectorFeeAmount" AND
    "totalAmount" = "sellerAmount" + "platformNetFeeAmount" + "connectorFeeAmount"
  ),
  ADD CONSTRAINT "AllwainOrder_settlement_version_check"
  CHECK ("settlementPlanVersion" IS NULL OR "settlementPlanVersion" > 0);

ALTER TABLE "AllwainPayment"
  ADD CONSTRAINT "AllwainPayment_allocation_identity_check"
  CHECK (
    "kind" <> 'payment' OR
    (
      "platformFeeAmount" = "platformNetFeeAmount" + "connectorFeeAmount" AND
      "amount" = "sellerAmount" + "platformNetFeeAmount" + "connectorFeeAmount"
    )
  ),
  ADD CONSTRAINT "AllwainPayment_settlement_version_check"
  CHECK ("settlementPlanVersion" IS NULL OR "settlementPlanVersion" > 0),
  ADD CONSTRAINT "AllwainPayment_settlementPlanId_fkey"
  FOREIGN KEY ("settlementPlanId") REFERENCES "AllwainSettlementPlan"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainSettlementPlan"
  ADD CONSTRAINT "AllwainSettlementPlan_allocation_identity_check"
  CHECK (
    "platformFeeAmount" >= "connectorAmount" AND
    "grossAmount" = "sellerAmount" + "platformFeeAmount"
  );

CREATE INDEX "AllwainOrder_settlementSnapshotHash_idx"
  ON "AllwainOrder"("settlementSnapshotHash");
CREATE INDEX "AllwainOrder_paymentMode_preorderChargeDeadlineAt_idx"
  ON "AllwainOrder"("paymentMode", "preorderChargeDeadlineAt");
CREATE INDEX "AllwainPayment_settlementPlanId_idx"
  ON "AllwainPayment"("settlementPlanId");
CREATE INDEX "AllwainFiscalDocument_signatureStatus_createdAt_idx"
  ON "AllwainFiscalDocument"("signatureStatus", "createdAt");

-- Financial journals and consent evidence are append-only. Idempotent no-op
-- updates remain valid so repeated provider events can be processed safely.
CREATE OR REPLACE FUNCTION allwain_reject_append_only_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
  END IF;
  IF OLD IS DISTINCT FROM NEW THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainLedgerEntry_append_only"
BEFORE UPDATE OR DELETE ON "AllwainLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION allwain_reject_append_only_mutation();

CREATE TRIGGER "AllwainConsentEvidence_append_only"
BEFORE UPDATE OR DELETE ON "AllwainConsentEvidence"
FOR EACH ROW EXECUTE FUNCTION allwain_reject_append_only_mutation();

CREATE TRIGGER "AllwainOrderStatusEvent_append_only"
BEFORE UPDATE OR DELETE ON "AllwainOrderStatusEvent"
FOR EACH ROW EXECUTE FUNCTION allwain_reject_append_only_mutation();

CREATE TRIGGER "AllwainPayoutAllocation_append_only"
BEFORE UPDATE OR DELETE ON "AllwainPayoutAllocation"
FOR EACH ROW EXECUTE FUNCTION allwain_reject_append_only_mutation();

CREATE TRIGGER "AllwainOrderLotAllocation_append_only"
BEFORE UPDATE OR DELETE ON "AllwainOrderLotAllocation"
FOR EACH ROW EXECUTE FUNCTION allwain_reject_append_only_mutation();

-- Once accepted by the buyer, the commercial core is immutable. Operational
-- statuses, Stripe-confirmed addresses and connector allocation versions can
-- still evolve through their own audited workflows.
CREATE OR REPLACE FUNCTION allwain_protect_order_commercial_core()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AllwainOrder history cannot be deleted';
  END IF;
  IF OLD."commercialTermsAcceptedAt" IS NOT NULL OR
     NEW."commercialTermsAcceptedAt" IS NOT NULL OR
     OLD."settlementStatus" IN ('checkout_locked', 'locked', 'settled', 'partially_refunded', 'refunded') THEN
    IF ROW(
      OLD."contractId", OLD."offerId", OLD."buyerUserId", OLD."sellerUserId",
      OLD."paymentMode", OLD."preorderChargeDeadlineAt", OLD."quantity", OLD."unit",
      OLD."unitPriceAmount", OLD."subtotalAmount", OLD."shippingAmount",
      OLD."taxAmount", OLD."agriculturalCompensationAmount", OLD."totalAmount",
      OLD."currency", OLD."platformFeeBps", OLD."platformFeeAmount",
      OLD."sellerAmount", OLD."paymentArchitecture", OLD."businessOfRecord",
      OLD."processorFeePayer", OLD."legalSellerUserId"
    ) IS DISTINCT FROM ROW(
      NEW."contractId", NEW."offerId", NEW."buyerUserId", NEW."sellerUserId",
      NEW."paymentMode", NEW."preorderChargeDeadlineAt", NEW."quantity", NEW."unit",
      NEW."unitPriceAmount", NEW."subtotalAmount", NEW."shippingAmount",
      NEW."taxAmount", NEW."agriculturalCompensationAmount", NEW."totalAmount",
      NEW."currency", NEW."platformFeeBps", NEW."platformFeeAmount",
      NEW."sellerAmount", NEW."paymentArchitecture", NEW."businessOfRecord",
      NEW."processorFeePayer", NEW."legalSellerUserId"
    ) THEN
      RAISE EXCEPTION 'Accepted order commercial terms cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainOrder_protect_commercial_core"
BEFORE UPDATE OR DELETE ON "AllwainOrder"
FOR EACH ROW EXECUTE FUNCTION allwain_protect_order_commercial_core();

-- A payment row is an accounting fact. Provider identifiers may be filled
-- once as Stripe creates them, but neither ownership nor allocation can be
-- replaced afterwards.
CREATE OR REPLACE FUNCTION allwain_protect_payment_core()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AllwainPayment history cannot be deleted';
  END IF;
  IF ROW(
    OLD."orderId", OLD."provider", OLD."kind", OLD."operationKey", OLD."amount",
    OLD."currency", OLD."platformFeeAmount", OLD."platformNetFeeAmount",
    OLD."sellerAmount", OLD."connectorFeeAmount", OLD."settlementPlanId",
    OLD."settlementPlanVersion", OLD."settlementSnapshotHash",
    OLD."onBehalfOfStripeAccountId", OLD."processorFeePayer"
  ) IS DISTINCT FROM ROW(
    NEW."orderId", NEW."provider", NEW."kind", NEW."operationKey", NEW."amount",
    NEW."currency", NEW."platformFeeAmount", NEW."platformNetFeeAmount",
    NEW."sellerAmount", NEW."connectorFeeAmount", NEW."settlementPlanId",
    NEW."settlementPlanVersion", NEW."settlementSnapshotHash",
    NEW."onBehalfOfStripeAccountId", NEW."processorFeePayer"
  ) THEN
    RAISE EXCEPTION 'AllwainPayment financial core cannot be changed';
  END IF;
  IF
    (OLD."stripeCheckoutSessionId" IS NOT NULL AND OLD."stripeCheckoutSessionId" IS DISTINCT FROM NEW."stripeCheckoutSessionId") OR
    (OLD."stripePaymentIntentId" IS NOT NULL AND OLD."stripePaymentIntentId" IS DISTINCT FROM NEW."stripePaymentIntentId") OR
    (OLD."stripeSetupIntentId" IS NOT NULL AND OLD."stripeSetupIntentId" IS DISTINCT FROM NEW."stripeSetupIntentId") OR
    (OLD."stripeCustomerId" IS NOT NULL AND OLD."stripeCustomerId" IS DISTINCT FROM NEW."stripeCustomerId") OR
    (OLD."stripePaymentMethodId" IS NOT NULL AND OLD."stripePaymentMethodId" IS DISTINCT FROM NEW."stripePaymentMethodId") OR
    (OLD."stripeChargeId" IS NOT NULL AND OLD."stripeChargeId" IS DISTINCT FROM NEW."stripeChargeId")
  THEN
    RAISE EXCEPTION 'Stripe payment identifiers cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainPayment_protect_core"
BEFORE UPDATE OR DELETE ON "AllwainPayment"
FOR EACH ROW EXECUTE FUNCTION allwain_protect_payment_core();

CREATE OR REPLACE FUNCTION allwain_protect_tax_determination()
RETURNS trigger AS $$
DECLARE
  terms_accepted_at timestamp(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AllwainTaxDetermination history cannot be deleted';
  END IF;
  SELECT "commercialTermsAcceptedAt"
    INTO terms_accepted_at
    FROM "AllwainOrder"
   WHERE "id" = OLD."orderId";
  IF terms_accepted_at IS NOT NULL AND OLD IS DISTINCT FROM NEW THEN
    RAISE EXCEPTION 'Accepted order tax determination cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainTaxDetermination_protect_after_terms"
BEFORE UPDATE OR DELETE ON "AllwainTaxDetermination"
FOR EACH ROW EXECUTE FUNCTION allwain_protect_tax_determination();

CREATE OR REPLACE FUNCTION allwain_validate_preorder_mandate()
RETURNS trigger AS $$
BEGIN
  IF NEW."paymentMode" = 'preorder' AND NEW."paymentStatus" IN (
    'checkout_open', 'payment_method_saved', 'payment_processing', 'paid'
  ) THEN
    IF NEW."preorderChargeDeadlineAt" IS NULL OR
       NEW."preorderMandateVersion" IS NULL OR
       NEW."preorderMandateAcceptedAt" IS NULL OR
       NEW."preorderMandateEvidenceHash" IS NULL THEN
      RAISE EXCEPTION 'Preorder cannot advance without a durable charge mandate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainOrder_validate_preorder_mandate"
BEFORE INSERT OR UPDATE ON "AllwainOrder"
FOR EACH ROW EXECUTE FUNCTION allwain_validate_preorder_mandate();

-- A buyer's accepted terms freeze the exact parties and product that formed
-- the deal. Later corrections must create a new order, never rewrite history.
CREATE OR REPLACE FUNCTION allwain_freeze_order_evidence()
RETURNS trigger AS $$
DECLARE
  target_order_id text;
  terms_accepted_at timestamp(3);
  settlement_state text;
BEGIN
  target_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."orderId" ELSE NEW."orderId" END;
  SELECT "commercialTermsAcceptedAt", "settlementStatus"
    INTO terms_accepted_at, settlement_state
    FROM "AllwainOrder"
   WHERE "id" = target_order_id;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% evidence cannot be deleted', TG_TABLE_NAME;
  END IF;
  IF terms_accepted_at IS NOT NULL OR settlement_state IN (
    'checkout_locked', 'locked', 'settled', 'partially_refunded', 'refunded'
  ) THEN
    IF TG_OP = 'INSERT' OR OLD IS DISTINCT FROM NEW THEN
      RAISE EXCEPTION '% evidence is frozen for order %', TG_TABLE_NAME, target_order_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainPartySnapshot_freeze_after_terms"
BEFORE INSERT OR UPDATE OR DELETE ON "AllwainPartySnapshot"
FOR EACH ROW EXECUTE FUNCTION allwain_freeze_order_evidence();

CREATE TRIGGER "AllwainOrderLine_freeze_after_terms"
BEFORE INSERT OR UPDATE OR DELETE ON "AllwainOrderLine"
FOR EACH ROW EXECUTE FUNCTION allwain_freeze_order_evidence();

-- Settlement versions may move through operational states and receive the
-- processor's actual fee, but their approved money split and formula cannot
-- change once checkout is locked.
CREATE OR REPLACE FUNCTION allwain_protect_locked_settlement()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AllwainSettlementPlan history cannot be deleted';
  END IF;
  IF OLD."status" IN ('checkout_locked', 'locked', 'settled', 'partially_refunded', 'refunded')
     OR NEW."status" IN ('checkout_locked', 'locked', 'settled', 'partially_refunded', 'refunded') THEN
    IF ROW(
      OLD."orderId", OLD."version", OLD."grossAmount", OLD."productAmount",
      OLD."shippingAmount", OLD."taxAmount", OLD."agriculturalCompensationAmount",
      OLD."platformFeeAmount", OLD."connectorAmount", OLD."sellerAmount",
      OLD."currency", OLD."formulaSnapshot", OLD."snapshotHash"
    ) IS DISTINCT FROM ROW(
      NEW."orderId", NEW."version", NEW."grossAmount", NEW."productAmount",
      NEW."shippingAmount", NEW."taxAmount", NEW."agriculturalCompensationAmount",
      NEW."platformFeeAmount", NEW."connectorAmount", NEW."sellerAmount",
      NEW."currency", NEW."formulaSnapshot", NEW."snapshotHash"
    ) THEN
      RAISE EXCEPTION 'Locked settlement financial terms cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainSettlementPlan_protect_locked"
BEFORE UPDATE OR DELETE ON "AllwainSettlementPlan"
FOR EACH ROW EXECUTE FUNCTION allwain_protect_locked_settlement();

-- Issued document content is immutable. Signature evidence, storage location,
-- status and void metadata can evolve without replacing the issued document.
CREATE OR REPLACE FUNCTION allwain_protect_issued_document()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AllwainFiscalDocument history cannot be deleted';
  END IF;
  IF OLD."issuedAt" IS NOT NULL OR OLD."status" = 'issued' THEN
    IF ROW(
      OLD."orderId", OLD."documentType", OLD."issuerUserId", OLD."recipientUserId",
      OLD."documentNumber", OLD."series", OLD."sourceReference", OLD."currency",
      OLD."subtotalAmount", OLD."taxAmount", OLD."totalAmount", OLD."templateVersion",
      OLD."contentSnapshot", OLD."contentHash", OLD."mimeType", OLD."replacesDocumentId",
      OLD."issuedAt"
    ) IS DISTINCT FROM ROW(
      NEW."orderId", NEW."documentType", NEW."issuerUserId", NEW."recipientUserId",
      NEW."documentNumber", NEW."series", NEW."sourceReference", NEW."currency",
      NEW."subtotalAmount", NEW."taxAmount", NEW."totalAmount", NEW."templateVersion",
      NEW."contentSnapshot", NEW."contentHash", NEW."mimeType", NEW."replacesDocumentId",
      NEW."issuedAt"
    ) THEN
      RAISE EXCEPTION 'Issued fiscal document content cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainFiscalDocument_protect_issued"
BEFORE UPDATE OR DELETE ON "AllwainFiscalDocument"
FOR EACH ROW EXECUTE FUNCTION allwain_protect_issued_document();
