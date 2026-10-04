CREATE TABLE "AllwainSupportTicket" (
  "id" TEXT NOT NULL,
  "requesterUserId" TEXT,
  "requesterEmail" TEXT NOT NULL,
  "requesterName" TEXT,
  "subject" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'other',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "riskLevel" TEXT NOT NULL DEFAULT 'low',
  "status" TEXT NOT NULL DEFAULT 'open',
  "source" TEXT NOT NULL DEFAULT 'email',
  "assignedAdminUserId" TEXT,
  "aiSummary" TEXT,
  "aiTriage" JSONB,
  "automationDisposition" TEXT NOT NULL DEFAULT 'human_review',
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "autoResolvedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainSupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllwainSupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "authorUserId" TEXT,
  "fromEmail" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT,
  "bodyText" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "inReplyTo" TEXT,
  "references" JSONB,
  "status" TEXT NOT NULL DEFAULT 'received',
  "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "AllwainSupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllwainSupportSyncRun" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'imap',
  "discovered" INTEGER NOT NULL DEFAULT 0,
  "imported" INTEGER NOT NULL DEFAULT 0,
  "autoReplied" INTEGER NOT NULL DEFAULT 0,
  "ignored" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllwainSupportSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllwainSupportControl" (
  "id" TEXT NOT NULL DEFAULT 'primary',
  "automationPaused" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainSupportControl_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllwainSupportMessage_providerMessageId_key"
  ON "AllwainSupportMessage"("providerMessageId");
CREATE INDEX "AllwainSupportTicket_status_priority_lastMessageAt_idx"
  ON "AllwainSupportTicket"("status", "priority", "lastMessageAt");
CREATE INDEX "AllwainSupportTicket_requesterUserId_createdAt_idx"
  ON "AllwainSupportTicket"("requesterUserId", "createdAt");
CREATE INDEX "AllwainSupportTicket_requesterEmail_createdAt_idx"
  ON "AllwainSupportTicket"("requesterEmail", "createdAt");
CREATE INDEX "AllwainSupportTicket_assignedAdminUserId_status_idx"
  ON "AllwainSupportTicket"("assignedAdminUserId", "status");
CREATE INDEX "AllwainSupportMessage_ticketId_createdAt_idx"
  ON "AllwainSupportMessage"("ticketId", "createdAt");
CREATE INDEX "AllwainSupportMessage_direction_status_createdAt_idx"
  ON "AllwainSupportMessage"("direction", "status", "createdAt");
CREATE INDEX "AllwainSupportMessage_fromEmail_createdAt_idx"
  ON "AllwainSupportMessage"("fromEmail", "createdAt");
CREATE INDEX "AllwainSupportSyncRun_status_createdAt_idx"
  ON "AllwainSupportSyncRun"("status", "createdAt");
CREATE INDEX "AllwainSupportSyncRun_completedAt_idx"
  ON "AllwainSupportSyncRun"("completedAt");

ALTER TABLE "AllwainSupportTicket"
  ADD CONSTRAINT "AllwainSupportTicket_requesterUserId_fkey"
  FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainSupportTicket"
  ADD CONSTRAINT "AllwainSupportTicket_assignedAdminUserId_fkey"
  FOREIGN KEY ("assignedAdminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainSupportMessage"
  ADD CONSTRAINT "AllwainSupportMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "AllwainSupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainSupportMessage"
  ADD CONSTRAINT "AllwainSupportMessage_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainSupportControl"
  ADD CONSTRAINT "AllwainSupportControl_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AllwainSupportControl" (
  "id", "automationPaused", "createdAt", "updatedAt"
) VALUES (
  'primary', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

CREATE OR REPLACE FUNCTION allwain_support_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION allwain_support_ticket_no_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AllwainSupportTicket history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainSupportMessage_append_only_update"
BEFORE UPDATE ON "AllwainSupportMessage"
FOR EACH ROW EXECUTE FUNCTION allwain_support_append_only();

CREATE TRIGGER "AllwainSupportMessage_append_only_delete"
BEFORE DELETE ON "AllwainSupportMessage"
FOR EACH ROW EXECUTE FUNCTION allwain_support_append_only();

CREATE TRIGGER "AllwainSupportSyncRun_append_only_update"
BEFORE UPDATE ON "AllwainSupportSyncRun"
FOR EACH ROW EXECUTE FUNCTION allwain_support_append_only();

CREATE TRIGGER "AllwainSupportSyncRun_append_only_delete"
BEFORE DELETE ON "AllwainSupportSyncRun"
FOR EACH ROW EXECUTE FUNCTION allwain_support_append_only();

CREATE TRIGGER "AllwainSupportTicket_no_delete"
BEFORE DELETE ON "AllwainSupportTicket"
FOR EACH ROW EXECUTE FUNCTION allwain_support_ticket_no_delete();
