ALTER TABLE "Contract"
  ADD COLUMN "quantity" DOUBLE PRECISION,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "unitPrice" DOUBLE PRECISION,
  ADD COLUMN "totalPrice" DOUBLE PRECISION,
  ADD COLUMN "inventoryStatus" TEXT;

CREATE INDEX "Contract_offerId_status_idx" ON "Contract"("offerId", "status");
