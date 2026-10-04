CREATE TABLE "CoursePaymentEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "CoursePaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoursePayment" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "checkoutSessionId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "entitlement" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amountTotal" INTEGER,
    "currency" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoursePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseCertificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "metadata" JSONB,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "CourseCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "aiTriage" JSONB,
    "adminNotes" TEXT,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "CourseSupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoursePaymentEvent_providerEventId_key" ON "CoursePaymentEvent"("providerEventId");
CREATE INDEX "CoursePaymentEvent_status_createdAt_idx" ON "CoursePaymentEvent"("status", "createdAt");
CREATE INDEX "CoursePaymentEvent_type_createdAt_idx" ON "CoursePaymentEvent"("type", "createdAt");
CREATE UNIQUE INDEX "CoursePayment_checkoutSessionId_key" ON "CoursePayment"("checkoutSessionId");
CREATE INDEX "CoursePayment_paymentIntentId_idx" ON "CoursePayment"("paymentIntentId");
CREATE INDEX "CoursePayment_email_createdAt_idx" ON "CoursePayment"("email", "createdAt");
CREATE INDEX "CoursePayment_status_createdAt_idx" ON "CoursePayment"("status", "createdAt");
CREATE UNIQUE INDEX "CourseCertificate_userId_key" ON "CourseCertificate"("userId");
CREATE UNIQUE INDEX "CourseCertificate_verificationCode_key" ON "CourseCertificate"("verificationCode");
CREATE INDEX "CourseCertificate_issuedAt_idx" ON "CourseCertificate"("issuedAt");
CREATE INDEX "CourseSupportTicket_userId_createdAt_idx" ON "CourseSupportTicket"("userId", "createdAt");
CREATE INDEX "CourseSupportTicket_status_priority_createdAt_idx" ON "CourseSupportTicket"("status", "priority", "createdAt");
CREATE INDEX "CourseAnalyticsEvent_userId_createdAt_idx" ON "CourseAnalyticsEvent"("userId", "createdAt");
CREATE INDEX "CourseAnalyticsEvent_name_createdAt_idx" ON "CourseAnalyticsEvent"("name", "createdAt");
