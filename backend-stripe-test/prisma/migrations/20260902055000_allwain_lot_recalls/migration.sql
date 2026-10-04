CREATE TABLE "AllwainProductRecall" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reason" TEXT NOT NULL,
    "instructions" TEXT,
    "affectedOrderCount" INTEGER NOT NULL DEFAULT 0,
    "affectedBuyerCount" INTEGER NOT NULL DEFAULT 0,
    "affectedOrderIds" JSONB NOT NULL,
    "affectedBuyerIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllwainProductRecall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainProductRecall_lotId_key" ON "AllwainProductRecall"("lotId");
CREATE INDEX "AllwainProductRecall_sellerUserId_status_createdAt_idx" ON "AllwainProductRecall"("sellerUserId", "status", "createdAt");
CREATE INDEX "AllwainProductRecall_status_createdAt_idx" ON "AllwainProductRecall"("status", "createdAt");

ALTER TABLE "AllwainProductRecall"
ADD CONSTRAINT "AllwainProductRecall_lotId_fkey"
FOREIGN KEY ("lotId") REFERENCES "AllwainProductLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainProductRecall"
ADD CONSTRAINT "AllwainProductRecall_sellerUserId_fkey"
FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AllwainProductRecall"
ADD CONSTRAINT "AllwainProductRecall_issuedByUserId_fkey"
FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
