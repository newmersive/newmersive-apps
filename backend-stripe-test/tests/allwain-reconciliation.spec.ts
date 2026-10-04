import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareAllwainDisputeWithStripe,
  compareAllwainPaymentWithStripe,
  compareAllwainPayoutWithStripe,
  compareAllwainRefundWithStripe,
  compareAllwainTransferWithStripe,
  untrackedAllwainProviderObject,
} from "../src/services/allwain-reconciliation";

describe("Allwain payment reconciliation", () => {
  it("accepts a payment whose Stripe facts match the local ledger", () => {
    const differences = compareAllwainPaymentWithStripe(
      {
        id: "pay_local",
        orderId: "order_1",
        status: "paid",
        paidAt: new Date(),
        amount: 1500,
        currency: "eur",
        stripeChargeId: "ch_1",
        refundedAmount: 0,
        processorFeeAmount: 55,
        processorNetAmount: 1445,
      },
      {
        id: "pi_1",
        status: "succeeded",
        amount: 1500,
        currency: "eur",
        metadata: { orderId: "order_1" },
        latest_charge: {
          id: "ch_1",
          amount_refunded: 0,
          balance_transaction: { id: "txn_1", fee: 55, net: 1445 },
        },
      },
    );
    assert.deepEqual(differences, []);
  });

  it("reports material payment differences without changing either source", () => {
    const differences = compareAllwainPaymentWithStripe(
      {
        id: "pay_local",
        orderId: "order_1",
        status: "paid",
        paidAt: new Date(),
        amount: 1500,
        currency: "eur",
        stripeChargeId: "ch_old",
        refundedAmount: 0,
        processorFeeAmount: 55,
        processorNetAmount: 1445,
      },
      {
        id: "pi_1",
        status: "requires_payment_method",
        amount: 1600,
        currency: "usd",
        metadata: { orderId: "order_other" },
        latest_charge: {
          id: "ch_1",
          amount_refunded: 300,
          balance_transaction: { id: "txn_1", fee: 65, net: 1535 },
        },
      },
    );
    assert.deepEqual(
      new Set(differences.map((item) => item.field)),
      new Set([
        "amount",
        "currency",
        "status",
        "stripeChargeId",
        "refundedAmount",
        "processorFeeAmount",
        "processorNetAmount",
        "orderId",
      ]),
    );
  });

  it("reports missing processor accounting facts", () => {
    const differences = compareAllwainPaymentWithStripe(
      {
        id: "pay_missing_accounting",
        orderId: "order_1",
        status: "paid",
        paidAt: new Date(),
        amount: 1500,
        currency: "eur",
        stripeChargeId: "ch_1",
        refundedAmount: 0,
        processorFeeAmount: null,
        processorNetAmount: null,
      },
      {
        id: "pi_1",
        status: "succeeded",
        amount: 1500,
        currency: "eur",
        metadata: { orderId: "order_1" },
        latest_charge: {
          id: "ch_1",
          amount_refunded: 0,
          balance_transaction: { id: "txn_1", fee: 72, net: 1428 },
        },
      },
    );
    assert.deepEqual(
      differences.map((item) => item.field),
      ["processorFeeAmount", "processorNetAmount"],
    );
  });

  it("reconciles transfers, refunds, disputes and payouts", () => {
    assert.deepEqual(
      compareAllwainTransferWithStripe(
        {
          id: "local_transfer",
          amount: 1000,
          reversedAmount: 200,
          currency: "eur",
          stripeAccountId: "acct_1",
        },
        {
          id: "tr_1",
          amount: 1000,
          amount_reversed: 200,
          currency: "eur",
          destination: "acct_1",
        },
      ),
      [],
    );
    assert.deepEqual(
      compareAllwainRefundWithStripe(
        { id: "local_refund", amount: 300, currency: "eur", status: "succeeded" },
        { id: "re_1", amount: 300, currency: "eur", status: "succeeded" },
      ),
      [],
    );
    assert.deepEqual(
      compareAllwainDisputeWithStripe(
        { id: "local_dispute", amount: 1500, currency: "eur", status: "won" },
        { id: "dp_1", amount: 1500, currency: "eur", status: "won" },
      ),
      [],
    );
    assert.deepEqual(
      compareAllwainPayoutWithStripe(
        { id: "local_payout", amount: 1000, currency: "eur", status: "paid" },
        { id: "po_1", amount: 1000, currency: "eur", status: "paid" },
      ),
      [],
    );
  });

  it("marks a Stripe object missing from Allwain as a critical difference", () => {
    const difference = untrackedAllwainProviderObject("refund", "re_external", {
      orderId: "order_1",
    });
    assert.equal(difference.providerId, "re_external");
    assert.equal(difference.field, "localObject");
    assert.equal(difference.severity, "critical");
  });
});
