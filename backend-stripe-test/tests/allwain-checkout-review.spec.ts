import assert from "node:assert/strict";
import https from "node:https";
import { afterEach, describe, it, mock } from "node:test";
import { ENV } from "../src/config/env";
import * as db from "../src/db/prisma";
import * as compliance from "../src/services/allwain-compliance.service";
import { createAllwainCheckout, prepareAllwainCheckoutReview } from "../src/services/allwain-payments.service";
import { assertAllwainReviewedTotal } from "../src/services/allwain-payment-state";
import { allwainPaymentErrorStatus } from "../src/routes/allwain-payments.routes";

const initialOrder = {
  id: "order", contractId: "contract", buyerUserId: "buyer", sellerUserId: "seller", offerId: "offer",
  totalAmount: 1500, currency: "eur", paymentStatus: "awaiting_payment", status: "awaiting_payment",
  commercialModel: "marketplace", paymentMode: "immediate", quantity: 1, unit: "kg", unitPriceAmount: 1500,
  subtotalAmount: 1500, platformFeeAmount: 150, platformFeeBps: 1000, sellerAmount: 1350,
};
const contract = { id: "contract", app: "allwain", requesterUserId: "buyer", status: "accepted" };
const offer = { id: "offer", owner: "allwain", ownerUserId: "seller", title: "Producto", meta: {} };
const originalEnv = { ...ENV };

function lockedTransaction(changedOrder: typeof initialOrder) {
  let consentCalls = 0;
  return {
    consentCalls: () => consentCalls,
    tx: {
      $queryRaw: async () => [{ ...initialOrder }],
      user: { findUnique: async ({ where }: any) => ({ id: where.id, name: "Test", email: "test@example.com" }) },
      offer: { findUnique: async () => offer },
      allwainFiscalProfile: { findUnique: async () => null },
      allwainProductComplianceProfile: { findUnique: async () => null },
      allwainSettlementPlan: { findFirst: async () => ({ status: "checkout_locked" }) },
      allwainPartySnapshot: { findUnique: async () => ({ id: "snapshot" }) },
      allwainOrderLine: { findFirst: async () => ({ id: "line" }) },
      allwainOrder: { findUnique: async () => changedOrder, update: async () => changedOrder },
      allwainConsentEvidence: { findUnique: async () => { consentCalls++; throw new Error("CONSENT_STAGE_REACHED"); } },
    },
  };
}

afterEach(() => { mock.restoreAll(); Object.assign(ENV, originalEnv); });

describe("Allwain reviewed payment totals", () => {
  it("validates cents and currency together, keeping legacy calls compatible", () => {
    assert.doesNotThrow(() => assertAllwainReviewedTotal(initialOrder, {}));
    assert.doesNotThrow(() => assertAllwainReviewedTotal(initialOrder, { reviewedTotalAmount: 1500, reviewedCurrency: "EUR" }));
    for (const input of [
      { reviewedTotalAmount: "1500", reviewedCurrency: "eur" },
      { reviewedTotalAmount: 15.5, reviewedCurrency: "eur" },
      { reviewedTotalAmount: 1500 },
      { reviewedCurrency: "eur" },
    ]) assert.throws(() => assertAllwainReviewedTotal(initialOrder, input), /INVALID_REVIEWED_TOTAL/);
    assert.throws(() => assertAllwainReviewedTotal(initialOrder, { reviewedTotalAmount: 1500, reviewedCurrency: "usd" }), /ORDER_TOTAL_CHANGED/);
    assert.equal(allwainPaymentErrorStatus("ORDER_TOTAL_CHANGED"), 409);
    assert.equal(allwainPaymentErrorStatus("INVALID_REVIEWED_TOTAL"), 400);
  });

  it("checks the post-compliance locked order before reaching consent persistence", async () => {
    const changed = lockedTransaction({ ...initialOrder, totalAmount: 1700 });
    await assert.rejects(compliance.prepareAllwainOrderPaymentTx(changed.tx, {
      orderId: "order", buyerUserId: "buyer", commercialTermsAccepted: true,
      reviewedTotalAmount: 1500, reviewedCurrency: "eur",
    }), /ORDER_TOTAL_CHANGED/);
    assert.equal(changed.consentCalls(), 0);
    await assert.rejects(compliance.prepareAllwainOrderPaymentTx(changed.tx, {
      orderId: "order", buyerUserId: "buyer", commercialTermsAccepted: true,
      reviewedTotalAmount: 1700, reviewedCurrency: "eur",
    }), /CONSENT_STAGE_REACHED/);
    assert.equal(changed.consentCalls(), 1);
  });

  it("reprepares the same authorized order without Stripe or consent calls", async () => {
    ENV.STORAGE_DRIVER = "postgres";
    ENV.STRIPE_SECRET_KEY = undefined;
    let current = { ...initialOrder };
    let preparations = 0;
    let transactions = 0;
    const prisma: any = {
      contract: { findUnique: async () => contract },
      allwainOrder: { findUnique: async () => current },
      user: { findUnique: async () => ({ id: "buyer", role: "user" }) },
      offer: { findFirst: async () => null },
      allwainPayment: { findFirst: async () => null },
      $transaction: async (fn: any) => { transactions++; return fn({
        $queryRaw: async () => [current], contract: { findUnique: async () => contract },
      }); },
    };
    mock.method(db, "getPrisma", () => prisma);
    mock.method(compliance, "ensureAllwainOrderComplianceTx", async () => {
      preparations++;
      current = { ...current, totalAmount: 1815 };
    });
    const blockedNetwork = mock.method(https, "request", () => { throw new Error("UNEXPECTED_NETWORK"); });
    await assert.rejects(prepareAllwainCheckoutReview("outsider", "contract"), /CONTRACT_NOT_FOUND/);
    assert.equal(transactions, 0);
    const first = await prepareAllwainCheckoutReview("buyer", "contract");
    const repeated = await prepareAllwainCheckoutReview("buyer", "contract");
    assert.equal(first.totalAmount, 1815);
    assert.equal(repeated.id, first.id);
    assert.equal(preparations, 2);
    assert.equal(blockedNetwork.mock.callCount(), 0);
  });

  it("does not create or update any Checkout/payment when the reviewed amount changed", async () => {
    Object.assign(ENV, {
      STORAGE_DRIVER: "postgres", ALLWAIN_STRIPE_TEST_CHECKOUT_ENABLED: true,
      ALLWAIN_STRIPE_LIVEMODE: false, STRIPE_SECRET_KEY: "sk_test_local_mock_only",
      STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_local", STRIPE_CONNECT_THIN_WEBHOOK_SECRET: "whsec_local",
      STRIPE_CONNECTED_ACCOUNTS_WEBHOOK_SECRET: "whsec_local",
    });
    const changed = lockedTransaction({ ...initialOrder, totalAmount: 1700 });
    let paymentWrites = 0;
    const prisma: any = {
      contract: { findUnique: async () => contract },
      allwainOrder: { findUnique: async () => initialOrder },
      offer: { findUnique: async () => offer },
      allwainPayment: { create: async () => { paymentWrites++; }, update: async () => { paymentWrites++; } },
      $transaction: async (fn: any) => fn(changed.tx),
    };
    mock.method(db, "getPrisma", () => prisma);
    const blockedNetwork = mock.method(https, "request", () => { throw new Error("UNEXPECTED_NETWORK"); });
    await assert.rejects(createAllwainCheckout("buyer", "contract", {
      reviewedTotalAmount: 1500, reviewedCurrency: "eur", commercialTermsAccepted: true,
    }), /ORDER_TOTAL_CHANGED/);
    assert.equal(changed.consentCalls(), 0);
    assert.equal(paymentWrites, 0);
    assert.equal(blockedNetwork.mock.callCount(), 0);
  });
});
