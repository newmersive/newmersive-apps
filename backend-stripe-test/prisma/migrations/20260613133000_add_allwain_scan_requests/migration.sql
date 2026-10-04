-- CreateTable
CREATE TABLE "AllwainScanRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "extracted" JSONB NOT NULL,
    "product" JSONB,
    "offers" JSONB NOT NULL,
    "imageMeta" JSONB,
    "ai" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllwainScanRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllwainScanRequest_userId_createdAt_idx" ON "AllwainScanRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AllwainScanRequest_status_createdAt_idx" ON "AllwainScanRequest"("status", "createdAt");
