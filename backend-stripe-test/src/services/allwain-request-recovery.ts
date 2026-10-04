import { Prisma } from "@prisma/client";
import { appendAllwainAuditEventTx } from "./allwain-audit";
import { isAllwainOfferArchived, validateAllwainOrderQuantity } from "./allwain-inventory";

const unpaid = new Set(["not_started", "awaiting_seller", "awaiting_payment", "checkout_open", "payment_failed", "requires_customer_action", "payment_method_saved", "payment_canceled", "expired", "canceled"]);
const terminalOrders = new Set(["canceled", "expired"]);
const terminalPayments = new Set(["created", "canceled", "checkout_expired", "payment_failed", "payment_canceled", "expired", "setup_failed", "setup_completed"]);
export type AllwainRequestRecoveryReason = "contract_rejected" | "order_canceled";

export function allwainAttemptHasSettledFunds(contract: any, orders: any[], payments: any[]) {
  if (contract?.paymentStatus && !unpaid.has(contract.paymentStatus)) return true;
  if (contract?.inventoryStatus === "sold") return true;
  if (orders.some(order => order.paidAt || order.disputeStatus || Number(order.refundedAmount || 0) > 0 || order.inventoryStatus === "sold" || !unpaid.has(order.paymentStatus) || !["not_started", "pending", "canceled"].includes(order.fulfillmentStatus || "not_started"))) return true;
  return payments.some(payment => payment.paidAt || payment.stripeChargeId || payment.stripeRefundId || Number(payment.refundedAmount || 0) > 0 || ["paid", "refund_pending", "partially_refunded", "refunded", "disputed", "dispute_lost", "duplicate_payment", "payment_processing"].includes(payment.status));
}

/** A canceled status alone is not proof of an unpaid operation. */
export function allwainAttemptHasFinancialRisk(contract: any, orders: any[], payments: any[]) {
  return allwainAttemptHasSettledFunds(contract, orders, payments) || contract?.deliveryAddress?.recurringOrder?.enabled === true || orders.some(order => order.recurringPlanId || order.recurringSequence != null) || payments.some(payment => !terminalPayments.has(payment.status));
}

export function allwainSelectionClosureMeta(offer: any, selectedOfferId: string, now = new Date()) {
  return { ...(offer.meta || {}), selectionClosure: { selectedOfferId, previousStatus: offer.allwainStatus || "active", closedAt: now.toISOString() } };
}

function validFuture(value: unknown, now: Date) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime()) || date <= now) return false;
  // Do not turn a malformed legacy calendar date such as February 30 into March.
  return value instanceof Date || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && date.toISOString().slice(0, 19) === value.slice(0, 19));
}

export function planAllwainRequestRecovery(input: {
  request: any; contract: any; orders?: any[]; payments?: any[]; contracts?: any[];
  offers: any[]; revisions?: any[]; eligibleSellerIds: string[];
  reason: AllwainRequestRecoveryReason; now?: Date;
}) {
  const { request, contract, reason } = input, now = input.now || new Date();
  const orders = input.orders || [], payments = input.payments || [];
  if (!request || !contract || contract.app !== "allwain" || contract.requestId !== request.id || contract.requesterUserId !== request.userId || contract.shoppingListId || contract.operationalArchivedAt || request.status !== "awarded" || request.closedAt || request.selectedOfferId !== contract.offerId) return null;
  if (reason === "contract_rejected" ? contract.status !== "rejected" : !orders.some(order => order.contractId === contract.id && order.status === "canceled" && order.paymentStatus === "canceled")) return null;
  if (allwainAttemptHasFinancialRisk(contract, orders, payments)) return null;
  if (orders.some(order => order.operationalArchivedAt || !terminalOrders.has(order.status))) return null;
  // An inconsistent second live agreement must be resolved before reopening.
  if ((input.contracts || []).some(other => other.id !== contract.id && other.status !== "rejected" && !orders.some(order => order.contractId === other.id && terminalOrders.has(order.status) && unpaid.has(order.paymentStatus)))) return null;

  const eligibleSellers = new Set(input.eligibleSellerIds), revisions = new Map((input.revisions || []).map(row => [`${row.offerId}:${row.revision}`, row])), eligibleAlternativeIds: string[] = [], offerPatches: Array<{ id: string; allwainStatus: string; meta: any }> = [];
  for (const offer of input.offers) {
    if (offer.owner !== "allwain" || (offer.requestId || offer.meta?.requestId) !== request.id || offer.shoppingListId || isAllwainOfferArchived(offer)) continue;
    if (offer.id === contract.offerId) {
      if (offer.allwainStatus === "selected") offerPatches.push({ id: offer.id, allwainStatus: "withdrawn", meta: { ...(offer.meta || {}), failedSelection: { contractId: contract.id, reason, endedAt: now.toISOString() } } });
      continue;
    }
    const closure = offer.meta?.selectionClosure;
    const safelyClosed = offer.allwainStatus === "not_selected" && closure?.selectedOfferId === contract.offerId && closure?.previousStatus === "active";
    if (!safelyClosed && offer.allwainStatus !== "active") continue;
    if (!eligibleSellers.has(offer.ownerUserId) || !Number.isFinite(Number(offer.price)) || Number(offer.price) <= 0 || !validFuture(offer.proposalExpiresAt || offer.meta?.validUntil, now)) continue;
    if (input.revisions) {
      const revision = revisions.get(`${offer.id}:${offer.proposalRevision}`);
      if (!revision || revision.status !== "current" || revision.sellerUserId !== offer.ownerUserId || revision.requestId !== request.id || revision.shoppingListId || !validFuture(revision.validUntil, now) || Number(revision.totalAmount) !== Math.round(Number(offer.price) * 100) || (offer.currency && String(revision.currency).toLowerCase() !== String(offer.currency).toLowerCase())) continue;
    }
    try { validateAllwainOrderQuantity(offer, Number(contract.quantity || request.extracted?.quantity || 1)); } catch { continue; }
    eligibleAlternativeIds.push(offer.id);
    if (safelyClosed) offerPatches.push({ id: offer.id, allwainStatus: "active", meta: { ...(offer.meta || {}), recovery: { contractId: contract.id, restoredAt: now.toISOString() } } });
  }
  const order = orders.find(row => row.contractId === contract.id);
  const recovery = { contractId: contract.id, orderId: order?.id || null, offerId: contract.offerId, reason, reopenedAt: now.toISOString(), eligibleAlternativeIds };
  return { requestPatch: { status: "submitted", selectedOfferId: null, selectedAt: null, ai: { ...(request.ai || {}), recovery }, updatedAt: now }, offerPatches, recovery };
}

/** Caller locks request before the existing order/offer/contract. All writes and
 * the audit chain are part of that same transaction, never a later repair. */
export async function recoverAllwainRequestAfterUnpaidAttemptTx(tx: any, input: {
  contract: any; reason: AllwainRequestRecoveryReason; actorUserId: string; actorRole?: string; requestId?: string; now?: Date;
}) {
  const contract = input.contract, now = input.now || new Date();
  if (contract?.app !== "allwain" || !contract.requestId || contract.shoppingListId) return null;
  const rows = await tx.$queryRaw(Prisma.sql`SELECT * FROM "AllwainScanRequest" WHERE "id" = ${contract.requestId} FOR UPDATE`);
  const request = rows[0];
  if (!request || request.status !== "awarded" || request.selectedOfferId !== contract.offerId) return null;
  const contracts = await tx.contract.findMany({ where: { app: "allwain", requestId: request.id } });
  const orders = await tx.allwainOrder.findMany({ where: { contractId: { in: contracts.map((row: any) => row.id) } } });
  const payments = orders.length ? await tx.allwainPayment.findMany({ where: { orderId: { in: orders.map((row: any) => row.id) } } }) : [];
  // Aggregate lock also serializes proposal upsert/withdrawal/selection. Lock
  // the alternatives before rechecking their revisions and current stock.
  const offers = await tx.$queryRaw(Prisma.sql`SELECT * FROM "Offer" WHERE "owner" = 'allwain' AND COALESCE("requestId", "meta"->>'requestId') = ${request.id} ORDER BY "id" ASC FOR UPDATE`);
  const [revisions, sellers] = await Promise.all([
    tx.allwainProposalRevision.findMany({ where: { offerId: { in: offers.map((row: any) => row.id) } } }),
    tx.user.findMany({ where: { id: { in: offers.map((row: any) => row.ownerUserId).filter(Boolean) }, deletedAt: null, status: "active" }, select: { id: true } }),
  ]);
  const plan = planAllwainRequestRecovery({ request, contract, contracts, orders, payments, offers, revisions, eligibleSellerIds: sellers.map((row: any) => row.id), reason: input.reason, now });
  if (!plan) return null;
  for (const patch of plan.offerPatches) await tx.offer.update({ where: { id: patch.id }, data: { allwainStatus: patch.allwainStatus, meta: patch.meta, updatedAt: now } });
  await tx.allwainScanRequest.update({ where: { id: request.id }, data: plan.requestPatch });
  await appendAllwainAuditEventTx(tx, { aggregateType: "market_request", aggregateId: request.id, orderId: plan.recovery.orderId, eventType: "market_request.reopened_after_unpaid_attempt", actorUserId: input.actorUserId, actorRole: input.actorRole, source: input.reason, requestId: input.requestId, occurredAt: now, payload: { ...plan.recovery, previousStatus: "awarded", nextStatus: "submitted" } });
  return plan.recovery;
}
