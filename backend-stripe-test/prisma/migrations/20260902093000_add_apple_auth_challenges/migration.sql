CREATE TABLE "AuthLoginChallenge" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "challengeHash" TEXT NOT NULL,
  "sourceApp" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthLoginChallenge_challengeHash_key"
  ON "AuthLoginChallenge"("challengeHash");
CREATE INDEX "AuthLoginChallenge_provider_sourceApp_expiresAt_idx"
  ON "AuthLoginChallenge"("provider", "sourceApp", "expiresAt");
