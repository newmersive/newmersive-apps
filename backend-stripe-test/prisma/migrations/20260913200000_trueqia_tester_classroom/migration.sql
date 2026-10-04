-- Trueqia classroom records are separate from live offers, trades, tokens and Allwain.
CREATE TABLE "TrueqiaTesterAction" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "programId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL, "actionId" TEXT NOT NULL, "platform" TEXT NOT NULL,
  "appVersion" TEXT, "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrueqiaTesterAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TrueqiaTesterAction_userId_programId_stepId_actionId_key" ON "TrueqiaTesterAction" ("userId", "programId", "stepId", "actionId");
CREATE TABLE "TrueqiaTesterIncident" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "programId" TEXT NOT NULL,
  "clientReference" TEXT NOT NULL, "contentHash" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrueqiaTesterIncident_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TrueqiaTesterIncident_userId_programId_clientReference_key" ON "TrueqiaTesterIncident" ("userId", "programId", "clientReference");
CREATE INDEX "TrueqiaTesterIncident_userId_programId_createdAt_idx" ON "TrueqiaTesterIncident" ("userId", "programId", "createdAt");
