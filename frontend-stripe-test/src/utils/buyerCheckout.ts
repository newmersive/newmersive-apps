import type { AllwainCheckoutResponse, AllwainContract, AllwainOrder, AllwainRecurringPlan } from "../config/api";

export const CHECKOUT_REVIEW_NOTICE = "Hay un intento de cobro que requiere revisión. La confirmación bancaria todavía no puede completarse desde esta pantalla. Actualizar consulta el estado registrado del pedido.";
export const CHECKOUT_UNKNOWN_NOTICE = "No hemos podido verificar si este pedido permite continuar con el pago. Actualiza el estado antes de intentarlo de nuevo.";
export type CheckoutBlockReason = "recurring_charge" | "deferred_charge";

// Null only confirms the absence of these two blockers. Existing consent,
// payment-state and server checkout rules continue to apply independently.
export function checkoutBlockReason(order?: AllwainOrder | null): CheckoutBlockReason | null | undefined {
  if (!order) return undefined;
  if (order.checkoutBlockReason === "recurring_charge" || order.checkoutBlockReason === "deferred_charge") return order.checkoutBlockReason;
  if (order.checkoutBlockReason === null) return null;
  if (Number(order.recurringSequence) > 0 || order.latestPayment?.kind === "recurring_charge") return "recurring_charge";
  if (order.latestPayment?.kind === "deferred_charge") return "deferred_charge";
  return undefined;
}

export function checkoutPaymentActionable(status?: string | null) {
  return ["awaiting_payment", "checkout_open", "payment_failed", "requires_customer_action"].includes(status || "");
}

export function unresolvedRecurringOrder(plan: AllwainRecurringPlan) {
  return plan.occurrences?.find(item => ["processing", "requires_action"].includes(item.status) &&
    typeof item.orderId === "string" && item.orderId.length > 0)?.orderId || null;
}

type CheckoutContext = {
  buyerId: string;
  contract: AllwainContract;
  order?: AllwainOrder;
  isCurrent: () => boolean;
  readOrder: (orderId: string) => Promise<AllwainOrder>;
  publishOrder: (order: AllwainOrder) => void;
};
type CheckoutResult = "opened" | "already_paid" | "reservation_ready" | "blocked" | "unknown" | "updated" | "retired";

function ownsContract(context: CheckoutContext) {
  return context.isCurrent() && Boolean(context.buyerId && context.contract.id &&
    context.contract.requesterUserId === context.buyerId);
}
function checkOrder(context: CheckoutContext, order: AllwainOrder) {
  if (!order || order.id !== context.order?.id || order.contractId !== context.contract.id || order.buyerUserId !== context.buyerId)
    throw new Error("El servidor devolvió un pedido que no corresponde a tu compra.");
}

export async function refreshBuyerCheckoutOrder(context: CheckoutContext): Promise<AllwainOrder | null> {
  if (!ownsContract(context) || !context.order) return null;
  checkOrder(context, context.order);
  const order = await context.readOrder(context.order.id);
  if (!ownsContract(context)) return null;
  checkOrder(context, order);
  context.publishOrder(order);
  return order;
}

export async function runBuyerCheckout(context: CheckoutContext & {
  postCheckout: (freshOrder?: AllwainOrder) => Promise<AllwainCheckoutResponse>;
  openUrl: (url: string) => Promise<void>;
}): Promise<CheckoutResult> {
  if (!ownsContract(context)) return "retired";
  let order: AllwainOrder | undefined;
  if (context.order) {
    order = await refreshBuyerCheckoutOrder(context) || undefined;
    if (!order || !ownsContract(context)) return "retired";
    if (!checkoutPaymentActionable(order.paymentStatus)) return "updated";
    const block = checkoutBlockReason(order);
    if (block) return "blocked";
    // Older order DTOs do not expose checkoutBlockReason. The checkout POST is
    // still authoritative and rejects durable/recurring charges server-side.
    // Let ordinary TEST payments reach Stripe instead of silently doing nothing.
  }
  if (!ownsContract(context)) return "retired";
  const response = await context.postCheckout(order);
  if (!ownsContract(context)) return "retired";
  if (!response.orderId || (order && response.orderId !== order.id))
    throw new Error("El servidor devolvió un pago que no corresponde al acuerdo.");
  if (response.url) {
    if (!/^https:\/\//i.test(response.url)) throw new Error("El servidor no devolvió un acceso seguro al pago.");
    if (!ownsContract(context)) return "retired";
    await context.openUrl(response.url);
    return ownsContract(context) ? "opened" : "retired";
  }
  if (response.alreadyPaid) return "already_paid";
  if (response.reservationReady) return "reservation_ready";
  throw new Error("Stripe no devolvió una acción de pago válida.");
}
