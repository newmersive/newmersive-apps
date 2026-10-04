UPDATE "AllwainScanRequest"
   SET "visibility" = 'operational_archive',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "status" = 'archived'
   AND COALESCE("ai", '{}'::jsonb) ? 'operationalArchive';
