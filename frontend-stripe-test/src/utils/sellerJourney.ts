import type { AllwainOrder } from "../config/api";
import type { AppLocale } from "../i18n";

export function preparationCountLabel(locale:AppLocale,count:number) {
  const singular=count===1;
  return {
    es:`${count} ${singular?"pedido pendiente":"pedidos pendientes"} en total`,
    en:`${count} pending ${singular?"order":"orders"} in total`,
    fr:`${count} ${singular?"commande en attente":"commandes en attente"} au total`,
    it:`${count} ${singular?"ordine in sospeso":"ordini in sospeso"} in totale`,
    zh:`共 ${count} 个待处理订单`,
    ar:`إجمالي الطلبات المعلقة: ${count}`,
  }[locale];
}

export function sellerCanFulfill(order?: Pick<AllwainOrder, "paymentStatus" | "disputeStatus">): boolean {
  return Boolean(order && ["paid", "partially_refunded", "refund_pending", "legacy_confirmed"].includes(order.paymentStatus) &&
    (!order.disputeStatus || ["won", "closed_won", "warning_closed"].includes(order.disputeStatus)));
}

export function sellerNeedsPreparation(order?: AllwainOrder): boolean {
  return sellerCanFulfill(order) && !["delivered", "completed", "canceled"].includes(order?.fulfillmentStatus || "");
}
