const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for the isolated PostgreSQL suite.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    "-r",
    "ts-node/register",
    "./tests/trueqia-workspace.spec.ts",
    "./tests/trueqia-offer-token-filters.spec.ts",
    "./tests/allwain-postgres-scale.spec.ts",
    "./tests/allwain-shopping-lists-postgres.spec.ts",
    "./tests/allwain-web-tester-postgres.spec.ts",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      STORAGE_DRIVER: "postgres",
      ALLWAIN_PAYMENTS_ENABLED: "false",
      ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: "false",
    },
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
