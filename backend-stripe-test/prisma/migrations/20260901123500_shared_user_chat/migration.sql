CREATE TABLE "ChatThread" (
  "id" TEXT NOT NULL,
  "app" TEXT NOT NULL,
  "contextType" TEXT NOT NULL,
  "contextId" TEXT NOT NULL,
  "title" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatParticipant" (
  "threadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReadAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("threadId", "userId")
);

CREATE TABLE "ChatBlock" (
  "app" TEXT NOT NULL,
  "blockerUserId" TEXT NOT NULL,
  "blockedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatBlock_pkey" PRIMARY KEY ("app", "blockerUserId", "blockedUserId")
);

CREATE UNIQUE INDEX "ChatThread_app_contextType_contextId_key"
  ON "ChatThread"("app", "contextType", "contextId");
CREATE INDEX "ChatThread_app_lastMessageAt_idx"
  ON "ChatThread"("app", "lastMessageAt");
CREATE INDEX "ChatParticipant_userId_archivedAt_idx"
  ON "ChatParticipant"("userId", "archivedAt");
CREATE INDEX "ChatBlock_app_blockedUserId_idx"
  ON "ChatBlock"("app", "blockedUserId");
CREATE INDEX "TrueqiaChatMessage_threadId_senderId_createdAt_idx"
  ON "TrueqiaChatMessage"("threadId", "senderId", "createdAt");

INSERT INTO "ChatThread" (
  "id", "app", "contextType", "contextId", "title", "lastMessageAt", "createdAt", "updatedAt"
)
SELECT
  messages."threadId",
  'trueqia',
  CASE WHEN messages."tradeId" IS NULL THEN 'assistant' ELSE 'trade' END,
  COALESCE(messages."tradeId", messages."userId"),
  CASE WHEN messages."tradeId" IS NULL THEN 'Guía TrueQIA' ELSE offers."title" END,
  MAX(messages."createdAt"),
  MIN(messages."createdAt"),
  MAX(messages."createdAt")
FROM "TrueqiaChatMessage" messages
LEFT JOIN "Trade" trades ON trades."id" = messages."tradeId"
LEFT JOIN "Offer" offers ON offers."id" = trades."offerId"
GROUP BY messages."threadId", messages."tradeId", messages."userId", offers."title"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ChatThread" (
  "id", "app", "contextType", "contextId", "title", "createdAt", "updatedAt"
)
SELECT
  'trueqia:trade:' || trades."id",
  'trueqia',
  'trade',
  trades."id",
  COALESCE(offers."title", 'Trueque'),
  trades."createdAt",
  CURRENT_TIMESTAMP
FROM "Trade" trades
LEFT JOIN "Offer" offers ON offers."id" = trades."offerId"
ON CONFLICT ("app", "contextType", "contextId") DO NOTHING;

INSERT INTO "ChatParticipant" ("threadId", "userId", "joinedAt", "lastReadAt")
SELECT
  threads."id",
  participants."userId",
  threads."createdAt",
  threads."lastMessageAt"
FROM "ChatThread" threads
JOIN "Trade" trades
  ON threads."app" = 'trueqia'
  AND threads."contextType" = 'trade'
  AND threads."contextId" = trades."id"
CROSS JOIN LATERAL (
  VALUES (trades."fromUserId"), (trades."toUserId")
) AS participants("userId")
ON CONFLICT ("threadId", "userId") DO NOTHING;

INSERT INTO "ChatParticipant" ("threadId", "userId", "joinedAt", "lastReadAt")
SELECT
  threads."id",
  threads."contextId",
  threads."createdAt",
  threads."lastMessageAt"
FROM "ChatThread" threads
WHERE threads."app" = 'trueqia' AND threads."contextType" = 'assistant'
ON CONFLICT ("threadId", "userId") DO NOTHING;
