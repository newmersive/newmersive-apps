ALTER TABLE "User"
ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastFailedLoginAt" TIMESTAMP(3),
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE INDEX "User_lockedUntil_idx" ON "User"("lockedUntil");
