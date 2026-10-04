-- Expose only a small, clearly identified set of navigable demo requests.
-- The remaining scale-test catalogue stays internal.
UPDATE "AllwainScanRequest"
SET
  "visibility" = 'public',
  "ai" = COALESCE("ai", '{}'::jsonb) || jsonb_build_object(
    'demo', true,
    'demoLabel', 'Petición de demostración'
  ),
  "updatedAt" = NOW()
WHERE "id" IN (
  'allwain-catalog-request-0000',
  'allwain-catalog-request-0001',
  'allwain-catalog-request-0002',
  'allwain-catalog-request-0003',
  'allwain-catalog-request-0004',
  'allwain-catalog-request-0005',
  'allwain-catalog-request-0006',
  'allwain-catalog-request-0007'
)
  AND "status" = 'submitted';
