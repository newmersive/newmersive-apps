BEGIN;

ALTER TABLE "AllwainOrder"
  ADD COLUMN "operationalArchivedAt" TIMESTAMP(3),
  ADD COLUMN "operationalArchiveReason" TEXT,
  ADD COLUMN "operationalArchiveBatch" TEXT;

CREATE INDEX "AllwainOrder_operationalArchivedAt_createdAt_idx"
  ON "AllwainOrder"("operationalArchivedAt", "createdAt");

ALTER TABLE "Contract"
  ADD COLUMN "operationalArchivedAt" TIMESTAMP(3),
  ADD COLUMN "operationalArchiveReason" TEXT,
  ADD COLUMN "operationalArchiveBatch" TEXT;

CREATE INDEX "Contract_app_operationalArchivedAt_createdAt_idx"
  ON "Contract"("app", "operationalArchivedAt", "createdAt");

ALTER TABLE "AllwainScanRequest"
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public';

CREATE INDEX "AllwainScanRequest_visibility_status_createdAt_idx"
  ON "AllwainScanRequest"("visibility", "status", "createdAt");

ALTER TABLE "Product"
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public';

CREATE INDEX "Product_visibility_category_idx"
  ON "Product"("visibility", "category");

ALTER TABLE "AllwainNotification"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "AllwainNotification_userId_archivedAt_createdAt_idx"
  ON "AllwainNotification"("userId", "archivedAt", "createdAt");

-- Operational metadata updates must not revalidate unrelated legacy preorder
-- rows. The mandate remains mandatory whenever its own payment fields change.
DROP TRIGGER "AllwainOrder_validate_preorder_mandate" ON "AllwainOrder";

CREATE TRIGGER "AllwainOrder_validate_preorder_mandate_insert"
BEFORE INSERT ON "AllwainOrder"
FOR EACH ROW EXECUTE FUNCTION allwain_validate_preorder_mandate();

CREATE TRIGGER "AllwainOrder_validate_preorder_mandate_update"
BEFORE UPDATE OF
  "paymentMode",
  "paymentStatus",
  "preorderChargeDeadlineAt",
  "preorderMandateVersion",
  "preorderMandateAcceptedAt",
  "preorderMandateEvidenceHash"
ON "AllwainOrder"
FOR EACH ROW EXECUTE FUNCTION allwain_validate_preorder_mandate();

COMMIT;
