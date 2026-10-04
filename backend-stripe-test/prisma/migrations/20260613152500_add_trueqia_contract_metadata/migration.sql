-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "offerId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "tradeId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "requesterUserId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "providerUserId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "offerTitle" TEXT;
ALTER TABLE "Contract" ADD COLUMN "requesterName" TEXT;
ALTER TABLE "Contract" ADD COLUMN "providerName" TEXT;
ALTER TABLE "Contract" ADD COLUMN "tokens" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "notes" TEXT;
ALTER TABLE "Contract" ADD COLUMN "description" TEXT;

-- CreateIndex
CREATE INDEX "Contract_requesterUserId_createdAt_idx" ON "Contract"("requesterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Contract_providerUserId_createdAt_idx" ON "Contract"("providerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Contract_tradeId_createdAt_idx" ON "Contract"("tradeId", "createdAt");
