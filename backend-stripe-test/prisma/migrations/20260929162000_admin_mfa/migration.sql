-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN IF NOT EXISTS "adminMfaVerifiedUntil" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "adminMfaVersion" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminMfa" (
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT,
    "pendingCiphertext" TEXT,
    "pendingFamilyId" TEXT,
    "pendingExpiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastUsedStep" INTEGER NOT NULL DEFAULT -1,
    "recoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "failedWindowStartedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMfa_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminMfa_userId_fkey' AND conrelid = '"AdminMfa"'::regclass) THEN ALTER TABLE "AdminMfa" ADD CONSTRAINT "AdminMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
