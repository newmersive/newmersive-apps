CREATE TABLE "AllwainAgentControl" (
    "agentKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'standard',
    "operatorInstructions" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllwainAgentControl_pkey" PRIMARY KEY ("agentKey")
);

CREATE INDEX "AllwainAgentControl_enabled_updatedAt_idx"
ON "AllwainAgentControl"("enabled", "updatedAt");

CREATE INDEX "AllwainAgentControl_updatedByUserId_updatedAt_idx"
ON "AllwainAgentControl"("updatedByUserId", "updatedAt");
