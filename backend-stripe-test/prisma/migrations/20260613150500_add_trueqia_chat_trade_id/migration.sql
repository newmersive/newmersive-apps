-- AlterTable
ALTER TABLE "TrueqiaChatMessage" ADD COLUMN "tradeId" TEXT;

-- CreateIndex
CREATE INDEX "TrueqiaChatMessage_tradeId_createdAt_idx" ON "TrueqiaChatMessage"("tradeId", "createdAt");
