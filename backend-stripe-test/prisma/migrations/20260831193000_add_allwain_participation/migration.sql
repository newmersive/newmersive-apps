-- One Allwain identity can participate as buyer, seller and connector.
-- The legacy User.role remains in place during the compatibility window.
ALTER TABLE "User"
  ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "AuthIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerSubject" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "profile" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthIdentity_provider_providerSubject_key"
  ON "AuthIdentity"("provider", "providerSubject");
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key"
  ON "AuthIdentity"("userId", "provider");
CREATE INDEX "AuthIdentity_email_idx" ON "AuthIdentity"("email");

CREATE TABLE "AllwainBuyerProfile" (
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainBuyerProfile_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "AllwainBuyerProfile_status_updatedAt_idx"
  ON "AllwainBuyerProfile"("status", "updatedAt");

CREATE TABLE "AllwainSellerProfile" (
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_activated',
  "sellerType" TEXT,
  "displayName" TEXT,
  "activatedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "restrictedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainSellerProfile_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "AllwainSellerProfile_status_updatedAt_idx"
  ON "AllwainSellerProfile"("status", "updatedAt");

CREATE TABLE "AllwainConnectorProfile" (
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_activated',
  "available" BOOLEAN NOT NULL DEFAULT false,
  "radiusKm" INTEGER NOT NULL DEFAULT 5,
  "locationLabel" TEXT,
  "locationLatApprox" DOUBLE PRECISION,
  "locationLngApprox" DOUBLE PRECISION,
  "activatedAt" TIMESTAMP(3),
  "restrictedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainConnectorProfile_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "AllwainConnectorProfile_status_available_radiusKm_idx"
  ON "AllwainConnectorProfile"("status", "available", "radiusKm");

INSERT INTO "AllwainBuyerProfile" ("userId", "status", "createdAt", "updatedAt")
SELECT "id", 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "AllwainSellerProfile"
  ("userId", "status", "sellerType", "displayName", "activatedAt", "createdAt", "updatedAt")
SELECT
  "id",
  CASE WHEN "role" IN ('company', 'admin') THEN 'active' ELSE 'not_activated' END,
  CASE WHEN "role" = 'company' THEN 'business' WHEN "role" = 'admin' THEN 'admin' ELSE NULL END,
  CASE WHEN "role" IN ('company', 'admin') THEN "name" ELSE NULL END,
  CASE WHEN "role" IN ('company', 'admin') THEN CURRENT_TIMESTAMP ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "AllwainConnectorProfile"
  ("userId", "status", "available", "radiusKm", "createdAt", "updatedAt")
SELECT "id", 'not_activated', false, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId") DO NOTHING;

ALTER TABLE "ReferralStat"
  ALTER COLUMN "totalSavedByInvited" SET DEFAULT 0,
  ALTER COLUMN "commissionEarned" SET DEFAULT 0,
  ALTER COLUMN "monthlyHistory" SET DEFAULT '[]'::jsonb,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'registered',
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "ReferralStat_userId_invitedUserId_key"
  ON "ReferralStat"("userId", "invitedUserId");
CREATE INDEX "ReferralStat_userId_createdAt_idx"
  ON "ReferralStat"("userId", "createdAt");
CREATE INDEX "ReferralStat_invitedUserId_idx"
  ON "ReferralStat"("invitedUserId");

INSERT INTO "ReferralStat"
  ("id", "userId", "invitedUserId", "totalSavedByInvited", "commissionEarned",
   "monthlyHistory", "source", "status", "createdAt", "updatedAt")
SELECT
  'network-' || md5(invited."id" || ':' || sponsor."id"),
  sponsor."id",
  invited."id",
  0,
  0,
  '[]'::jsonb,
  'registration_code',
  'registered',
  invited."createdAt",
  CURRENT_TIMESTAMP
FROM "User" invited
JOIN "User" sponsor ON sponsor."sponsorCode" = invited."referredByCode"
WHERE invited."referredByCode" IS NOT NULL
ON CONFLICT ("userId", "invitedUserId") DO NOTHING;

ALTER TABLE "AllwainOrder"
  ADD COLUMN "connectorUserId" TEXT,
  ADD COLUMN "connectorFeeAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paymentArchitecture" TEXT NOT NULL DEFAULT 'destination';

CREATE INDEX "AllwainOrder_connectorUserId_createdAt_idx"
  ON "AllwainOrder"("connectorUserId", "createdAt");

ALTER TABLE "AllwainPayment"
  ADD COLUMN "connectorFeeAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripeConnectorTransferId" TEXT;

CREATE UNIQUE INDEX "AllwainPayment_stripeConnectorTransferId_key"
  ON "AllwainPayment"("stripeConnectorTransferId");

CREATE TABLE "AllwainDeliveryAssignment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "connectorUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "feeAmount" INTEGER NOT NULL DEFAULT 300,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "pickupZone" TEXT,
  "deliveryZone" TEXT,
  "maxDistanceKm" DOUBLE PRECISION,
  "acceptedAt" TIMESTAMP(3),
  "pickedUpAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainDeliveryAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainDeliveryAssignment_orderId_key"
  ON "AllwainDeliveryAssignment"("orderId");
CREATE INDEX "AllwainDeliveryAssignment_connectorUserId_status_createdAt_idx"
  ON "AllwainDeliveryAssignment"("connectorUserId", "status", "createdAt");
CREATE INDEX "AllwainDeliveryAssignment_status_createdAt_idx"
  ON "AllwainDeliveryAssignment"("status", "createdAt");
