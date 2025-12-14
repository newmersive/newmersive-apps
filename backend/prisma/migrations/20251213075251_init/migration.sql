-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sponsorCode" TEXT,
    "referredByCode" TEXT,
    "avatarUrl" TEXT,
    "tokens" INTEGER,
    "allwainBalance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "tokens" INTEGER,
    "price" DOUBLE PRECISION,
    "productId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ean" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "priceTokens" INTEGER,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL,
    "message" TEXT,
    "offerId" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadGlobal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "sourceApp" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "LeadGlobal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "basePdfId" TEXT,
    "generatedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "minUnitsPerClient" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "participants" JSONB NOT NULL,

    CONSTRAINT "OrderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "totalSavedByInvited" DOUBLE PRECISION NOT NULL,
    "commissionEarned" DOUBLE PRECISION NOT NULL,
    "monthlyHistory" JSONB NOT NULL,

    CONSTRAINT "ReferralStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllwainSavingTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllwainSavingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_sponsorCode_key" ON "User"("sponsorCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_ean_key" ON "Product"("ean");
