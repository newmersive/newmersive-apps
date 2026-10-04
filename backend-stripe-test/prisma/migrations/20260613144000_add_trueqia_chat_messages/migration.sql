-- CreateTable
CREATE TABLE "TrueqiaChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrueqiaChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrueqiaChatMessage_userId_createdAt_idx" ON "TrueqiaChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TrueqiaChatMessage_threadId_createdAt_idx" ON "TrueqiaChatMessage"("threadId", "createdAt");
