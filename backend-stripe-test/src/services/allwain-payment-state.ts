import { ENV } from "../config/env";

export function assertAllwainReviewedTotal(
  order: { totalAmount: number; currency: string },
  input: { reviewedTotalAmount?: unknown; reviewedCurrency?: unknown },
) {
  if (input.reviewedTotalAmount === undefined && input.reviewedCurrency === undefined) return;
  if (
    !Number.isSafeInteger(input.reviewedTotalAmount) || Number(input.reviewedTotalAmount) <= 0 ||
    typeof input.reviewedCurrency !== "string" || !/^[a-zA-Z]{3}$/.test(input.reviewedCurrency)
  ) throw new Error("INVALID_REVIEWED_TOTAL");
  if (
    input.reviewedTotalAmount !== order.totalAmount ||
    input.reviewedCurrency.toLowerCase() !== order.currency.toLowerCase()
  ) throw new Error("ORDER_TOTAL_CHANGED");
}

export const PAID_PAYMENT_STATUSES = new Set([
  "paid",
  "refund_pending",
  "partially_refunded",
  "disputed",
]);

const SETTLED_PAYMENT_RECORD_STATUSES = new Set([
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "disputed",
]);

const RESOLVED_DISPUTE_STATUSES = new Set([
  "won",
  "closed_won",
  "warning_closed",
]);

export function isAllwainActiveDispute(status?: string | null) {
  return Boolean(status && !RESOLVED_DISPUTE_STATUSES.has(status));
}

export function allwainPaymentStatusAfterSuccessfulCharge(
  disputeStatus?: string | null,
) {
  if (!isAllwainActiveDispute(disputeStatus)) return "paid";
  return disputeStatus === "lost" || disputeStatus === "closed_lost"
    ? "dispute_lost"
    : "disputed";
}

const PAYMENT_TRANSITIONS: Record<string, Set<string>> = {
  not_started: new Set(["awaiting_seller", "awaiting_payment", "legacy_confirmed"]),
  awaiting_seller: new Set(["awaiting_payment", "canceled", "expired"]),
  awaiting_payment: new Set(["checkout_open", "payment_processing", "canceled", "expired"]),
  checkout_open: new Set([
    "awaiting_payment",
    "payment_processing",
    "payment_method_saved",
    "paid",
    "payment_failed",
    "requires_customer_action",
    "canceled",
    "expired",
  ]),
  payment_processing: new Set([
    "paid",
    "payment_failed",
    "requires_customer_action",
    "canceled",
    "expired",
  ]),
  payment_method_saved: new Set([
    "payment_processing",
    "checkout_open",
    "canceled",
    "expired",
  ]),
  requires_customer_action: new Set([
    "checkout_open",
    "payment_processing",
    "paid",
    "canceled",
    "expired",
  ]),
  payment_failed: new Set([
    "awaiting_payment",
    "checkout_open",
    "payment_processing",
    "paid",
    "canceled",
    "expired",
  ]),
  payment_canceled: new Set(["awaiting_payment", "checkout_open", "canceled", "expired"]),
  paid: new Set(["refund_pending", "partially_refunded", "refunded", "disputed"]),
  refund_pending: new Set(["paid", "partially_refunded", "refunded", "disputed"]),
  partially_refunded: new Set(["refund_pending", "refunded", "disputed"]),
  disputed: new Set([
    "paid",
    "partially_refunded",
    "refunded",
    "dispute_lost",
  ]),
  legacy_confirmed: new Set(["canceled"]),
  refunded: new Set(),
  dispute_lost: new Set(),
  canceled: new Set(),
  expired: new Set(),
};

const FULFILLMENT_TRANSITIONS: Record<string, Set<string>> = {
  not_started: new Set(["pending"]),
  pending: new Set(["preparing"]),
  preparing: new Set(["ready"]),
  ready: new Set(["dispatched", "delivered"]),
  dispatched: new Set(["delivered"]),
  delivered: new Set(["completed"]),
  completed: new Set(),
};

export function canTransitionAllwainPayment(fromStatus: string, toStatus: string) {
  if (fromStatus === toStatus) return true;
  return PAYMENT_TRANSITIONS[fromStatus]?.has(toStatus) || false;
}

export function deriveAllwainRefundPaymentStatus(input: {
  refundStatus?: string | null;
  cumulativeRefunded: number;
  paymentAmount: number;
}) {
  if (input.refundStatus !== "succeeded") return "refund_pending";
  return input.cumulativeRefunded >= input.paymentAmount
    ? "refunded"
    : "partially_refunded";
}

export function canApplyCheckoutStatusToAllwainPaymentRecord(payment: {
  status?: string | null;
  paidAt?: Date | string | null;
}) {
  return (
    !payment.paidAt &&
    !SETTLED_PAYMENT_RECORD_STATUSES.has(String(payment.status || "not_started"))
  );
}

export function canTransitionAllwainFulfillment(fromStatus: string, toStatus: string) {
  if (fromStatus === toStatus) return true;
  return FULFILLMENT_TRANSITIONS[fromStatus]?.has(toStatus) || false;
}

export function deriveAllwainOrderStatus(input: {
  paymentStatus: string;
  fulfillmentStatus: string;
  disputeStatus?: string | null;
}) {
  if (isAllwainActiveDispute(input.disputeStatus)) {
    return input.disputeStatus === "lost" || input.disputeStatus === "closed_lost"
      ? "dispute_lost"
      : "disputed";
  }
  if (["refunded", "refund_pending", "partially_refunded"].includes(input.paymentStatus)) {
    return input.paymentStatus;
  }
  if (input.paymentStatus === "paid") {
    return input.fulfillmentStatus === "pending" || input.fulfillmentStatus === "not_started"
      ? "paid"
      : input.fulfillmentStatus;
  }
  return input.paymentStatus;
}

export function allwainReservationDeadline(from = new Date()) {
  const configured = ENV.ALLWAIN_RESERVATION_TTL_MINUTES;
  const minutes = Number.isFinite(configured)
    ? Math.min(43_200, Math.max(5, Math.floor(configured)))
    : 1_440;
  return new Date(from.getTime() + minutes * 60_000);
}

export function allwainPaymentOperationKey(
  orderId: string,
  kind:
    | "setup"
    | "payment"
    | "deferred_charge"
    | "recurring_charge"
    | "refund"
    | "refund_duplicate",
  attempt = 1,
) {
  return `allwain:${kind}:${orderId}:${Math.max(1, Math.floor(attempt))}`;
}

export function isAllwainReservationReleaseable(order: {
  paymentStatus?: string | null;
  inventoryStatus?: string | null;
}) {
  return (
    order.inventoryStatus === "reserved" &&
    !PAID_PAYMENT_STATUSES.has(order.paymentStatus || "not_started") &&
    order.paymentStatus !== "payment_method_saved"
  );
}
