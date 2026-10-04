import type { AllwainOrder } from "../config/api";

export function sellerCanFulfill(order?: Pick<AllwainOrder, "paymentStatus" | "disputeStatus">): boolean {
  return Boolean(order && ["paid", "partially_refunded", "refund_pending", "legacy_confirmed"].includes(order.paymentStatus) &&
    (!order.disputeStatus || ["won", "closed_won", "warning_closed"].includes(order.disputeStatus)));
}

export function sellerNeedsPreparation(order?: AllwainOrder): boolean {
  return sellerCanFulfill(order) && !["delivered", "completed", "canceled"].includes(order?.fulfillmentStatus || "");
}
