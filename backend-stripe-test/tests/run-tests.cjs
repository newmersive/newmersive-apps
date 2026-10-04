const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceData = path.join(root, "data", "database.json");
const tempData = path.join(
  os.tmpdir(),
  `newmersive-backend-test-${process.pid}-${Date.now()}.json`
);
const ownsTempData = !process.env.DATA_FILE;

if (ownsTempData) {
  fs.copyFileSync(sourceData, tempData);
}

const env = {
  ...process.env,
  NODE_ENV: "test",
  STORAGE_DRIVER: process.env.STORAGE_DRIVER || "json",
  DATA_FILE: process.env.DATA_FILE || tempData,
  SERVICE_TOKEN: process.env.SERVICE_TOKEN || "test-service-token",
  APPLE_AUTH_ALLWAIN_CLIENT_ID:
    process.env.APPLE_AUTH_ALLWAIN_CLIENT_ID || "es.allwain.app",
  APPLE_AUTH_TRUEQIA_CLIENT_ID:
    process.env.APPLE_AUTH_TRUEQIA_CLIENT_ID || "es.trueqia.app",
  ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: "false",
};

const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    "-r",
    "ts-node/register",
    "./tests/trueqia-workspace.spec.ts",
    "./tests/trueqia-tester.spec.ts",
    "./tests/trueqia-offer-token-filters.spec.ts",
    "./tests/auth.spec.ts",
    "./tests/newmersive-id.spec.ts",
    "./tests/course-entitlements.spec.ts",
    "./tests/course-routes.spec.ts",
    "./tests/course-upload-security.spec.ts",
    "./tests/allwain-scan.spec.ts",
    "./tests/image-data-url.spec.ts",
    "./tests/operation-rate-limit.spec.ts",
    "./tests/allwain-direct-chat.spec.ts",
    "./tests/chat-translation.spec.ts",
    "./tests/external-http.spec.ts",
    "./tests/allwain-product-intelligence.spec.ts",
    "./tests/allwain-card-images.spec.ts",
    "./tests/allwain-shopping-lists.spec.ts",
    "./tests/allwain-guide.spec.ts",
    "./tests/allwain-public-guide.spec.ts",
    "./tests/allwain-money.spec.ts",
    "./tests/allwain-purchase-details.spec.ts",
    "./tests/allwain-checkout-review.spec.ts",
    "./tests/allwain-preorders.spec.ts",
    "./tests/allwain-recurring.spec.ts",
    "./tests/allwain-legal-settlement.spec.ts",
    "./tests/allwain-inventory.spec.ts",
    "./tests/allwain-logistics.spec.ts",
    "./tests/allwain-shipping.spec.ts",
    "./tests/allwain-notifications.spec.ts",
    "./tests/allwain-support.spec.ts",
    "./tests/allwain-agent-control.spec.ts",
    "./tests/allwain-web-tester.spec.ts",
    "./tests/allwain-web-tester-routes.spec.ts",
    "./tests/allwain-traceability.spec.ts",
    "./tests/allwain-payment-state.spec.ts",
    "./tests/allwain-reconciliation.spec.ts",
    "./tests/pdf.spec.ts",
    "./tests/allwain-contracts.spec.ts",
    "./tests/allwain-participation.spec.ts",
    "./tests/trueqia-chat.spec.ts",
    "./tests/trueqia-contracts.spec.ts",
    "./tests/offers.spec.ts",
    "./tests/multiuser-demo.spec.ts",
  ],
  {
    cwd: root,
    env,
    stdio: "inherit",
  }
);

if (ownsTempData) {
  fs.rmSync(tempData, { force: true });
}

process.exit(result.status ?? 1);
