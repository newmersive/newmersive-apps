ALTER TABLE "Contract" ADD COLUMN "templateId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "templateVersion" TEXT;

CREATE INDEX "Contract_templateId_templateVersion_idx" ON "Contract"("templateId", "templateVersion");
