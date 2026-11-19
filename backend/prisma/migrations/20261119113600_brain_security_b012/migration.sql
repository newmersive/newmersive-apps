-- B01.2 draft migration. Apply only after validation in a disposable PostgreSQL environment.
CREATE TYPE "BrainInformationLevel" AS ENUM ('PUBLIC', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET_ABSOLUTE');

ALTER TABLE "BrainChallenge" ADD COLUMN "informationLevel" "BrainInformationLevel" NOT NULL DEFAULT 'CONFIDENTIAL';
ALTER TABLE "BrainContribution" ADD COLUMN "informationLevel" "BrainInformationLevel" NOT NULL DEFAULT 'CONFIDENTIAL';

CREATE TABLE "BrainPublication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "level" "BrainInformationLevel" NOT NULL DEFAULT 'RESTRICTED',
  "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BrainPublication_storageKey_key" ON "BrainPublication"("storageKey");
CREATE INDEX "BrainPublication_projectKey_level_approvalStatus_idx" ON "BrainPublication"("projectKey", "level", "approvalStatus");

CREATE TABLE "BrainAccessGrant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicationId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "BrainAccessGrant_publicationId_profileId_key" ON "BrainAccessGrant"("publicationId", "profileId");
CREATE INDEX "BrainAccessGrant_profileId_revokedAt_expiresAt_idx" ON "BrainAccessGrant"("profileId", "revokedAt", "expiresAt");
ALTER TABLE "BrainAccessGrant" ADD CONSTRAINT "BrainAccessGrant_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "BrainPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BrainSecurityAuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BrainSecurityAuditEvent_resourceType_resourceId_createdAt_idx" ON "BrainSecurityAuditEvent"("resourceType", "resourceId", "createdAt");
