const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const temporaryData = path.join(os.tmpdir(), `allwain-scan-${process.pid}-${Date.now()}.json`);
fs.copyFileSync(path.join(root, "data/database.json"), temporaryData);
try {
  const result = spawnSync(process.execPath, [
    "--test", "--test-concurrency=1", "-r", "ts-node/register",
    "tests/allwain-scan.spec.ts", "tests/document-columns.spec.ts",
  ], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
      STORAGE_DRIVER: "json",
      DATA_FILE: temporaryData,
      ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: "false",
    },
  });
  process.exitCode = result.status ?? 1;
} finally {
  fs.unlinkSync(temporaryData);
}
