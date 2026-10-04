-- CreateTable
CREATE TABLE "CourseEntitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "entitlement" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseEntitlement_userId_entitlement_key" ON "CourseEntitlement"("userId", "entitlement");

-- CreateIndex
CREATE INDEX "CourseEntitlement_email_idx" ON "CourseEntitlement"("email");

-- CreateIndex
CREATE INDEX "CourseEntitlement_product_entitlement_idx" ON "CourseEntitlement"("product", "entitlement");
