ALTER TABLE "AllwainGuideExecution" DROP CONSTRAINT "AllwainGuideExecution_status_check";
ALTER TABLE "AllwainGuideExecution" DROP CONSTRAINT "AllwainGuideExecution_result_check";

ALTER TABLE "AllwainGuideExecution"
  ADD CONSTRAINT "AllwainGuideExecution_status_check"
  CHECK ("status" IN ('started', 'completed', 'uncertain', 'manual_resolved', 'manual_discarded'));

ALTER TABLE "AllwainGuideExecution"
  ADD CONSTRAINT "AllwainGuideExecution_result_check"
  CHECK (
    ("status" IN ('completed', 'manual_resolved', 'manual_discarded')) = ("result" IS NOT NULL)
  );
