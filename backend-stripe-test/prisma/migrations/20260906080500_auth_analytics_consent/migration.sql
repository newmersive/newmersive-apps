ALTER TABLE "User"
ADD COLUMN "analyticsConsent" BOOLEAN,
ADD COLUMN "analyticsConsentVersion" TEXT,
ADD COLUMN "analyticsConsentUpdatedAt" TIMESTAMP(3);
