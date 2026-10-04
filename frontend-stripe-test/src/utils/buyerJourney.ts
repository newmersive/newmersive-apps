export function buyerPaymentLabel(status?: string | null): string | null {
  const labels: Record<string, string> = {
    awaiting_payment: "Pago pendiente", checkout_open: "Pago pendiente", payment_failed: "Pago no completado",
    requires_customer_action: "Pago pendiente de confirmación", payment_processing: "Pago en proceso",
    payment_method_saved: "Reserva · tarjeta preparada", refunded: "Reembolsado", partially_refunded: "Reembolso parcial",
    canceled: "Cancelado", cancelled: "Cancelado", expired: "Reserva caducada",
  };
  if (status === "paid") return null;
  return labels[status || ""] || "Consultar estado del pago";
}

export function buyerCheckoutReturnUrl(base: string, web: boolean, contractId: string) {
  return `${base.replace(/\/$/, "")}${web ? "/ofertas" : ""}?section=orders&contractId=${encodeURIComponent(contractId)}`;
}
import type { AllwainContract, AllwainOrder } from "../config/api";

export function buyerReviewAmount(contract: AllwainContract, order?: AllwainOrder): number | undefined {
  if (typeof order?.totalAmount === "number" && Number.isSafeInteger(order.totalAmount) && order.totalAmount >= 0) return order.totalAmount;
  if (typeof contract.totalPrice === "number" && Number.isFinite(contract.totalPrice) && contract.totalPrice >= 0) return Math.round(contract.totalPrice * 100);
  // An incomplete legacy summary must not present its product subtotal as the
  // final charge. The server's complete order is required before displaying it.
  return undefined;
}
