ALTER TABLE "AuthSession"
  ADD COLUMN "adminMfaVersion" INTEGER,
  ADD COLUMN "adminMfaVerifiedUntil" TIMESTAMP(3);

CREATE TABLE "AdminMfa" (
  "userId" TEXT NOT NULL,
  "secretCiphertext" TEXT,
  "pendingCiphertext" TEXT,
  "pendingFamilyId" TEXT,
  "pendingExpiresAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "lastUsedStep" INTEGER NOT NULL DEFAULT -1,
  "recoveryCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "failedWindowStartedAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "enrolledAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminMfa_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "AdminMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
