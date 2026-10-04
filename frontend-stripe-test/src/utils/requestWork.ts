import type { AllwainOffer, AllwainOrder, AllwainScanRequest } from "../config/api";
import { checkoutPaymentActionable } from "./buyerCheckout";
export type ProposalSort = "price" | "rating" | "newest";
export type ProposalView = "active" | "history" | "all";
export interface RequestPendingSummary {
  total: number;
  counts: { draft: number; ready: number; withProposals: number };
  items: Array<Pick<AllwainScanRequest, "id" | "title" | "status" | "createdAt" | "updatedAt"> & { extracted: { productName?: string | null }; proposalCount: number }>;
}
export interface RequestProposalPage {
  items: AllwainOffer[];
  summary: { total: number; active: number };
  selectedOffer: AllwainOffer | null;
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
}
export type RequestWorkDetail = AllwainScanRequest & { proposalSummary?: RequestProposalPage["summary"]; selectedOffer?: AllwainOffer | null };
export function proposalPageUrl(id: string, sort: ProposalSort, view: ProposalView, cursor?: string | null) {
  return `/allwain/scan-requests/${encodeURIComponent(id)}/proposals?limit=20&sort=${sort}&view=${view}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
}
function nonnegative(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
export function validatePendingSummary(value: RequestPendingSummary) {
  if (!value || !nonnegative(value.total) || !value.counts || Object.values(value.counts).some(n => !nonnegative(n)) || value.total !== value.counts.draft + value.counts.ready + value.counts.withProposals || !Array.isArray(value.items) || value.items.length > 10 || value.items.length > value.total || value.items.some(item => !item?.id || !["draft", "ready", "submitted"].includes(item.status) || !nonnegative(item.proposalCount))) throw new Error("INVALID_PENDING_SUMMARY");
  return value;
}
export function validateProposalPage(value: RequestProposalPage, requestId: string) {
  const belongs = (offer: AllwainOffer) => offer?.id && (offer.requestId || offer.meta?.requestId) === requestId;
  if (!value || !Array.isArray(value.items) || value.items.length > 20 || new Set(value.items.map(o => o.id)).size !== value.items.length || value.items.some(o => !belongs(o)) || (value.selectedOffer && !belongs(value.selectedOffer)) || !nonnegative(value.summary?.total) || !nonnegative(value.summary?.active) || value.summary.active > value.summary.total || value.items.length > value.summary.total || typeof value.pageInfo?.hasNextPage !== "boolean" || (value.pageInfo.hasNextPage && !value.pageInfo.nextCursor)) throw new Error("INVALID_PROPOSAL_PAGE");
  return value;
}
/** Scope a reply to focus, account, session and query. A newer request wins. */
export function createReplyGate() {
  let revision = 0;
  return { invalidate: () => { revision++; }, begin: (current: () => boolean) => { const started = ++revision; return () => started === revision && current(); } };
}
export function pendingBuyerOrder(order: AllwainOrder) {
  return !["completed", "refunded", "canceled", "cancelled", "expired"].includes(order.status) &&
    (!order.disputeStatus || ["won", "closed_won", "warning_closed"].includes(order.disputeStatus)) &&
    (checkoutPaymentActionable(order.paymentStatus) || (["paid", "partially_refunded", "refund_pending", "legacy_confirmed"].includes(order.paymentStatus) && order.fulfillmentStatus === "delivered"));
}
