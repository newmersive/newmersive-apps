const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const load = require("./helpers/load-typescript.cjs");

const {
  isAllwainLivePaymentEnvironment,
  isAllwainPaymentEnvironmentReady,
  isAllwainStripeTestMarketplace,
} = load("src/utils/allwainPaymentEnvironment.ts");

const testMarketplace = {
  enabled: true,
  stripeLivemode: false,
  paymentEnvironment: "test",
  stripeTestCheckoutEnabled: true,
  stripeTestCheckoutScope: "all_real_user_offers",
  stripeTestFundsFlow: "platform_charge_only_no_transfers",
  stripeTestFiscalDocumentsIssued: false,
  stripeTestSellerTransfersEnabled: false,
  legalRequirementsBypassedForTest: true,
};

test("accepts only the complete open Stripe TEST marketplace contract", () => {
  assert.equal(isAllwainStripeTestMarketplace(testMarketplace), true);
  assert.equal(isAllwainPaymentEnvironmentReady(testMarketplace), true);

  for (const invalid of [
    { ...testMarketplace, stripeTestCheckoutScope: "pilot_offer" },
    { ...testMarketplace, stripeTestSellerTransfersEnabled: true },
    { ...testMarketplace, stripeTestFiscalDocumentsIssued: true },
    { ...testMarketplace, legalRequirementsBypassedForTest: false },
    { ...testMarketplace, stripeLivemode: true },
  ]) {
    assert.equal(isAllwainStripeTestMarketplace(invalid), false);
    assert.equal(isAllwainPaymentEnvironmentReady(invalid), false);
  }
});

test("accepts a real live environment only without the TEST legal bypass", () => {
  const live = {
    enabled: true,
    stripeLivemode: true,
    paymentEnvironment: "live",
    legalRequirementsBypassedForTest: false,
  };
  assert.equal(isAllwainLivePaymentEnvironment(live), true);
  assert.equal(isAllwainPaymentEnvironmentReady(live), true);
  assert.equal(
    isAllwainLivePaymentEnvironment({
      ...live,
      legalRequirementsBypassedForTest: true,
    }),
    false,
  );
});

test("guards both buyer checkout and seller preorder charge in the screen", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/screens/Offers/OffersScreen.tsx"),
    "utf8",
  );
  const guards = source.match(/if \(!paymentEnvironmentReady\)/g) || [];
  assert.equal(guards.length, 2);
  assert.match(source, /paymentEnvironmentReady\s*&&\s*paymentNeedsAction/);
});
