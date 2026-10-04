-- Tester feedback can contain voluntary free text and must be erased with the account.
-- Keep the audit ledger immutable except while the account-deletion transaction exposes
-- the exact actor id through a transaction-local PostgreSQL setting.
CREATE OR REPLACE FUNCTION allwain_reject_audit_mutation()
RETURNS trigger AS $$
DECLARE
  erasure_user_id TEXT := NULLIF(
    current_setting('allwain.account_erasure_user_id', true),
    ''
  );
BEGIN
  IF TG_OP = 'DELETE'
    AND erasure_user_id IS NOT NULL
    AND OLD."actorUserId" = erasure_user_id
    AND (
      (
        OLD."aggregateType" = 'web_tester_feedback'
        AND OLD."eventType" = 'web_tester.feedback_submitted'
      )
      OR
      (
        OLD."aggregateType" = 'app_tester_progress_request'
        AND OLD."eventType" = 'app_tester.progress_completed'
      )
    )
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'AllwainAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

-- Support messages remain append-only. The only permitted update is the fixed redaction
-- performed during deletion of the requester of a web-tester ticket. Operational fields
-- and message timestamps cannot be changed through this exception.
CREATE OR REPLACE FUNCTION allwain_support_message_protect_update()
RETURNS trigger AS $$
DECLARE
  erasure_user_id TEXT := NULLIF(
    current_setting('allwain.account_erasure_user_id', true),
    ''
  );
BEGIN
  IF erasure_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "AllwainSupportTicket" ticket
      WHERE ticket."id" = OLD."ticketId"
        AND ticket."source" = 'web_tester'
        AND ticket."requesterUserId" = erasure_user_id
    )
    AND NEW."authorUserId" IS NULL
    AND NEW."fromEmail" = 'deleted-web-tester@deleted.invalid'
    AND NEW."toEmail" = 'deleted-web-tester@deleted.invalid'
    AND NEW."subject" IS NULL
    AND NEW."bodyText" = 'Contenido eliminado al borrar la cuenta.'
    AND NEW."providerMessageId" IS NULL
    AND NEW."inReplyTo" IS NULL
    AND NEW."references" IS NULL
    AND (
      to_jsonb(NEW) - ARRAY[
        'authorUserId',
        'fromEmail',
        'toEmail',
        'subject',
        'bodyText',
        'providerMessageId',
        'inReplyTo',
        'references'
      ]::TEXT[]
    ) = (
      to_jsonb(OLD) - ARRAY[
        'authorUserId',
        'fromEmail',
        'toEmail',
        'subject',
        'bodyText',
        'providerMessageId',
        'inReplyTo',
        'references'
      ]::TEXT[]
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AllwainSupportMessage is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AllwainSupportMessage_append_only_update"
ON "AllwainSupportMessage";

CREATE TRIGGER "AllwainSupportMessage_append_only_update"
BEFORE UPDATE ON "AllwainSupportMessage"
FOR EACH ROW EXECUTE FUNCTION allwain_support_message_protect_update();
