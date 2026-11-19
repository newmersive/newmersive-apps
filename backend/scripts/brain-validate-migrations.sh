#!/usr/bin/env bash
# B01 isolated PostgreSQL validation. Run from backend/ with bash scripts/brain-validate-migrations.sh
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a disposable local PostgreSQL database named brain_test}"
node <<'NODE'
const u = new URL(process.env.DATABASE_URL);
const local = ['localhost','127.0.0.1','::1'].includes(u.hostname);
if (!['postgresql:','postgres:'].includes(u.protocol) || !local || u.pathname !== '/brain_test') {
  console.error('REFUSING: DATABASE_URL must target local PostgreSQL database /brain_test');
  process.exit(2);
}
console.log('Target verified: local /brain_test (no credentials printed)');
NODE
echo 'Validating Prisma schema...'
npx prisma validate
echo 'Checking migration status before applying...'
npx prisma migrate status || true
echo 'Applying repository migrations ONLY to local brain_test...'
npx prisma migrate deploy
echo 'Checking final migration status...'
npx prisma migrate status
echo 'Comparing database schema with Prisma schema...'
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
echo 'B01 migration validation complete. Authorization tests remain separate.'
