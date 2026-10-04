-- Persist the platform/connector split. The current runtime policy assigns
-- 2% of Allwain's fee to the connector; historical values remain auditable.
ALTER TABLE "AllwainOrder"
  ADD COLUMN "platformNetFeeAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sellerTransferId" TEXT,
  ADD COLUMN "connectorTransferId" TEXT,
  ADD COLUMN "sellerTransferStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "connectorTransferStatus" TEXT NOT NULL DEFAULT 'not_required';

ALTER TABLE "AllwainPayment"
  ADD COLUMN "platformNetFeeAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sellerTransferId" TEXT,
  ADD COLUMN "connectorTransferId" TEXT,
  ADD COLUMN "sellerTransferStatus" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN "connectorTransferStatus" TEXT NOT NULL DEFAULT 'not_required';

ALTER TABLE "AllwainOrder"
  ALTER COLUMN "paymentArchitecture" SET DEFAULT 'separate_charges_and_transfers';

ALTER TABLE "AllwainDeliveryAssignment"
  ALTER COLUMN "feeAmount" SET DEFAULT 0;

UPDATE "AllwainOrder"
SET "platformNetFeeAmount" = GREATEST("platformFeeAmount" - "connectorFeeAmount", 0);

UPDATE "AllwainPayment"
SET "platformNetFeeAmount" = GREATEST("platformFeeAmount" - "connectorFeeAmount", 0);

UPDATE "AllwainOrder"
SET "paymentArchitecture" = 'separate_charges_and_transfers'
WHERE "paymentStatus" NOT IN ('paid', 'partially_refunded', 'refunded', 'disputed');
