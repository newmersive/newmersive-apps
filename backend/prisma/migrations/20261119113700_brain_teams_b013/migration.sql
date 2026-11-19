-- B01.3 teams; execute after B01.2 security migration.
CREATE TABLE "BrainResearchTeam" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "challengeId" TEXT,
 "name" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BrainResearchTeam_challengeId_status_idx" ON "BrainResearchTeam"("challengeId","status");
CREATE TABLE "BrainTeamMember" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "teamId" TEXT NOT NULL,
 "profileId" TEXT NOT NULL,
 "role" TEXT NOT NULL DEFAULT 'CONTRIBUTOR',
 "status" TEXT NOT NULL DEFAULT 'INVITED',
 "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "joinedAt" TIMESTAMP(3),
 "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "BrainTeamMember_teamId_profileId_key" ON "BrainTeamMember"("teamId","profileId");
CREATE INDEX "BrainTeamMember_profileId_status_idx" ON "BrainTeamMember"("profileId","status");
ALTER TABLE "BrainTeamMember" ADD CONSTRAINT "BrainTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "BrainResearchTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrainTeamMember" ADD CONSTRAINT "BrainTeamMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BrainProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "BrainResearchTask" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "teamId" TEXT NOT NULL,
 "assigneeId" TEXT,
 "title" TEXT NOT NULL,
 "objective" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PROPOSED',
 "informationLevel" "BrainInformationLevel" NOT NULL DEFAULT 'CONFIDENTIAL',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BrainResearchTask_teamId_status_idx" ON "BrainResearchTask"("teamId","status");
CREATE INDEX "BrainResearchTask_assigneeId_status_idx" ON "BrainResearchTask"("assigneeId","status");
ALTER TABLE "BrainResearchTask" ADD CONSTRAINT "BrainResearchTask_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "BrainResearchTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
