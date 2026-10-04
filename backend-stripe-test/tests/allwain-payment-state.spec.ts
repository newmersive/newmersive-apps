import assert from "node:assert";
import { describe, it } from "node:test";
import {
  allwainPaymentStatusAfterSuccessfulCharge,
  allwainPaymentOperationKey,
  canApplyCheckoutStatusToAllwainPaymentRecord,
  canTransitionAllwainFulfillment,
  canTransitionAllwainPayment,
  deriveAllwainRefundPaymentStatus,
  deriveAllwainOrderStatus,
  isAllwainActiveDispute,
  isAllwainReservationReleaseable,
} from "../src/services/allwain-payment-state";
import {
  buildAllwainAuditHash,
  canonicalAllwainAuditJson,
} from "../src/services/allwain-audit";

describe("Allwain payment state", () => {
  it("does not allow a late failed event to move a paid order backwards", () => {
    assert.equal(canTransitionAllwainPayment("paid", "payment_failed"), false);
    assert.equal(canTransitionAllwainPayment("paid", "refunded"), true);
  });

  it("does not let a late Checkout event downgrade a settled payment record", () => {
    assert.equal(
      canApplyCheckoutStatusToAllwainPaymentRecord({
        status: "paid",
        paidAt: "2026-09-01T09:30:00.000Z",
      }),
      false,
    );
    assert.equal(
      canApplyCheckoutStatusToAllwainPaymentRecord({
        status: "checkout_open",
        paidAt: null,
      }),
      true,
    );
  });

  it("keeps payment and fulfilment as independent order dimensions", () => {
    assert.equal(
      deriveAllwainOrderStatus({ paymentStatus: "paid", fulfillmentStatus: "dispatched" }),
      "dispatched",
    );
    assert.equal(
      deriveAllwainOrderStatus({
        paymentStatus: "paid",
        fulfillmentStatus: "completed",
        disputeStatus: "needs_response",
      }),
      "disputed",
    );
    assert.equal(canTransitionAllwainFulfillment("delivered", "completed"), true);
    assert.equal(canTransitionAllwainFulfillment("completed", "preparing"), false);
  });

  it("treats a closed warning as resolved and a lost dispute as terminal", () => {
    assert.equal(
      deriveAllwainOrderStatus({
        paymentStatus: "paid",
        fulfillmentStatus: "delivered",
        disputeStatus: "warning_closed",
      }),
      "delivered",
    );
    assert.equal(
      deriveAllwainOrderStatus({
        paymentStatus: "dispute_lost",
        fulfillmentStatus: "delivered",
        disputeStatus: "lost",
      }),
      "dispute_lost",
    );
    assert.equal(canTransitionAllwainPayment("disputed", "dispute_lost"), true);
    assert.equal(canTransitionAllwainPayment("dispute_lost", "paid"), false);
  });

  it("does not downgrade an active dispute when its successful charge arrives late", () => {
    assert.equal(isAllwainActiveDispute("needs_response"), true);
    assert.equal(isAllwainActiveDispute("warning_closed"), false);
    assert.equal(
      allwainPaymentStatusAfterSuccessfulCharge("needs_response"),
      "disputed",
    );
    assert.equal(
      allwainPaymentStatusAfterSuccessfulCharge("lost"),
      "dispute_lost",
    );
    assert.equal(allwainPaymentStatusAfterSuccessfulCharge("won"), "paid");
  });

  it("uses stable unique keys per operation attempt", () => {
    assert.equal(
      allwainPaymentOperationKey("order-1", "payment", 2),
      "allwain:payment:order-1:2",
    );
  });

  it("releases only unpaid inventory reservations", () => {
    assert.equal(
      isAllwainReservationReleaseable({
        inventoryStatus: "reserved",
        paymentStatus: "awaiting_payment",
      }),
      true,
    );
    assert.equal(
      isAllwainReservationReleaseable({
        inventoryStatus: "reserved",
        paymentStatus: "paid",
      }),
      false,
    );
  });

  it("settles synchronous Stripe refunds without a webhook race", () => {
    assert.equal(
      deriveAllwainRefundPaymentStatus({
        refundStatus: "succeeded",
        cumulativeRefunded: 501,
        paymentAmount: 1_500,
      }),
      "partially_refunded",
    );
    assert.equal(
      deriveAllwainRefundPaymentStatus({
        refundStatus: "succeeded",
        cumulativeRefunded: 1_500,
        paymentAmount: 1_500,
      }),
      "refunded",
    );
    assert.equal(
      deriveAllwainRefundPaymentStatus({
        refundStatus: "pending",
        cumulativeRefunded: 0,
        paymentAmount: 1_500,
      }),
      "refund_pending",
    );
  });
});

describe("Allwain audit evidence", () => {
  it("canonicalizes object keys independently from insertion order", () => {
    assert.equal(
      canonicalAllwainAuditJson({ z: 1, a: { d: 2, b: 3 } }),
      canonicalAllwainAuditJson({ a: { b: 3, d: 2 }, z: 1 }),
    );
  });

  it("links every event hash to the previous hash and material facts", () => {
    const common = {
      aggregateType: "order",
      aggregateId: "order-1",
      eventType: "payment.succeeded",
      source: "test",
      occurredAt: "2026-08-31T12:00:00.000Z",
      actorUserId: null,
      actorRole: null,
      requestId: "request-1",
      providerEventId: "evt_1",
    };
    const first = buildAllwainAuditHash({
      ...common,
      sequence: 1,
      payload: { amount: 1_500, currency: "eur" },
      previousHash: null,
    });
    const second = buildAllwainAuditHash({
      ...common,
      sequence: 2,
      eventType: "fulfillment.preparing",
      payload: { from: "pending", to: "preparing" },
      previousHash: first,
    });
    const altered = buildAllwainAuditHash({
      ...common,
      sequence: 2,
      eventType: "fulfillment.preparing",
      payload: { from: "pending", to: "completed" },
      previousHash: first,
    });
    assert.notEqual(first, second);
    assert.notEqual(second, altered);
  });
});
