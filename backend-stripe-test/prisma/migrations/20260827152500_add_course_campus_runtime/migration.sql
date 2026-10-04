-- AlterTable
ALTER TABLE "CourseEntitlement" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "CourseEntitlement" ADD COLUMN "revokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CourseProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "lessonIndex" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "percent" INTEGER NOT NULL DEFAULT 0,
    "studentState" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "artifactType" TEXT NOT NULL,
    "fileName" TEXT,
    "storedName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "textContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "aiReview" JSONB,
    "adminNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseAiMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseAiMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    CONSTRAINT "CourseConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseEmailDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "CourseEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseProgress_userId_moduleId_key" ON "CourseProgress"("userId", "moduleId");
CREATE INDEX "CourseProgress_userId_updatedAt_idx" ON "CourseProgress"("userId", "updatedAt");
CREATE INDEX "CourseSubmission_userId_createdAt_idx" ON "CourseSubmission"("userId", "createdAt");
CREATE INDEX "CourseSubmission_status_createdAt_idx" ON "CourseSubmission"("status", "createdAt");
CREATE INDEX "CourseAiMessage_userId_createdAt_idx" ON "CourseAiMessage"("userId", "createdAt");
CREATE UNIQUE INDEX "CourseConsent_userId_type_version_key" ON "CourseConsent"("userId", "type", "version");
CREATE INDEX "CourseConsent_userId_acceptedAt_idx" ON "CourseConsent"("userId", "acceptedAt");
CREATE INDEX "CourseAuditEvent_actorUserId_createdAt_idx" ON "CourseAuditEvent"("actorUserId", "createdAt");
CREATE INDEX "CourseAuditEvent_targetUserId_createdAt_idx" ON "CourseAuditEvent"("targetUserId", "createdAt");
CREATE INDEX "CourseAuditEvent_action_createdAt_idx" ON "CourseAuditEvent"("action", "createdAt");
CREATE INDEX "CourseEmailDelivery_email_createdAt_idx" ON "CourseEmailDelivery"("email", "createdAt");
CREATE INDEX "CourseEmailDelivery_status_createdAt_idx" ON "CourseEmailDelivery"("status", "createdAt");
