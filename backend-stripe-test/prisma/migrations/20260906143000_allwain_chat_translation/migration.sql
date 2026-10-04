CREATE TABLE "ChatMessageTranslation" (
  "id" TEXT NOT NULL,
  "app" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "targetLocale" TEXT NOT NULL,
  "sourceLocale" TEXT,
  "translatedText" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageTranslation_messageId_targetLocale_key"
ON "ChatMessageTranslation"("messageId", "targetLocale");

CREATE INDEX "ChatMessageTranslation_threadId_targetLocale_createdAt_idx"
ON "ChatMessageTranslation"("threadId", "targetLocale", "createdAt");

CREATE INDEX "ChatMessageTranslation_app_createdAt_idx"
ON "ChatMessageTranslation"("app", "createdAt");

ALTER TABLE "ChatMessageTranslation"
ADD CONSTRAINT "ChatMessageTranslation_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "TrueqiaChatMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
