-- B01.1 baseline. Must run before 20261119113600_brain_security_b012.
CREATE TABLE "BrainProfile" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT,
 "displayName" TEXT NOT NULL,
 "contactEmail" TEXT NOT NULL,
 "participantType" TEXT NOT NULL,
 "capabilities" JSONB,
 "organization" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "BrainProfile_userId_key" ON "BrainProfile"("userId");
CREATE INDEX "BrainProfile_contactEmail_idx" ON "BrainProfile"("contactEmail");
CREATE TABLE "BrainChallenge" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "projectKey" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "summary" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
 "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BrainChallenge_projectKey_status_visibility_idx" ON "BrainChallenge"("projectKey", "status", "visibility");
CREATE TABLE "BrainContribution" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "profileId" TEXT NOT NULL,
 "challengeId" TEXT,
 "title" TEXT NOT NULL,
 "description" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BrainContribution_profileId_createdAt_idx" ON "BrainContribution"("profileId", "createdAt");
CREATE INDEX "BrainContribution_challengeId_status_idx" ON "BrainContribution"("challengeId", "status");
ALTER TABLE "BrainContribution" ADD CONSTRAINT "BrainContribution_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BrainProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrainContribution" ADD CONSTRAINT "BrainContribution_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "BrainChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "BrainReview" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "contributionId" TEXT NOT NULL,
 "reviewerUserId" TEXT NOT NULL,
 "decision" TEXT NOT NULL,
 "rationale" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BrainReview_contributionId_createdAt_idx" ON "BrainReview"("contributionId", "createdAt");
ALTER TABLE "BrainReview" ADD CONSTRAINT "BrainReview_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "BrainContribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
