ALTER TABLE "User"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

UPDATE "User"
SET "emailVerifiedAt" = identities."verifiedAt"
FROM (
  SELECT "userId", MIN("createdAt") AS "verifiedAt"
  FROM "AuthIdentity"
  WHERE "emailVerified" = true
  GROUP BY "userId"
) AS identities
WHERE "User"."id" = identities."userId";

UPDATE "User"
SET "passwordChangedAt" = "createdAt"
WHERE "passwordHash" IS NOT NULL;

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "sourceApp" TEXT NOT NULL,
  "userAgentHash" TEXT,
  "ipHash" TEXT,
  "tokenVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "rotatedFromId" TEXT,

  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key"
ON "AuthSession"("refreshTokenHash");

CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx"
ON "AuthSession"("userId", "revokedAt", "expiresAt");

CREATE INDEX "AuthSession_familyId_revokedAt_idx"
ON "AuthSession"("familyId", "revokedAt");

CREATE INDEX "AuthSession_expiresAt_idx"
ON "AuthSession"("expiresAt");

CREATE INDEX "User_status_deletedAt_idx"
ON "User"("status", "deletedAt");

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
