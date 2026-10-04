import type { AllwainScanRequest, Offer } from "../shared/types";
import { discoveryCursor } from "./allwain-discovery";

export type RequestProposalSort = "newest" | "price" | "rating";
export type RequestProposalView = "active" | "history" | "all";
export interface RequestProposalPageInput { limit: number; cursor?: string | null; sort?: RequestProposalSort; view?: RequestProposalView }
export function normalizeRequestProposalPage(input: RequestProposalPageInput) {
  if (input.sort && !["newest", "price", "rating"].includes(input.sort)) throw new Error("INVALID_PROPOSAL_SORT");
  if (input.view && !["active", "history", "all"].includes(input.view)) throw new Error("INVALID_PROPOSAL_VIEW");
  return { ...input, limit: Math.min(20, Math.max(1, Math.trunc(Number(input.limit) || 20))), sort: input.sort || "newest" as RequestProposalSort, view: input.view || "all" as RequestProposalView };
}
export function requestProposalActive(offer: Offer, now = new Date()) {
  if ((offer.allwainStatus || "active") !== "active") return false;
  const expires = offer.proposalExpiresAt || offer.meta?.validUntil;
  return !expires || (Number.isFinite(+new Date(String(expires))) && +new Date(String(expires)) > +now);
}
export function requestProposalSummary(offers: Offer[], now = new Date()) { return { total: offers.length, active: offers.filter((offer) => requestProposalActive(offer, now)).length }; }
export function requestPendingItem(request: AllwainScanRequest, proposalCount: number) {
  return { id: request.id, title: request.title, status: request.status, extracted: { productName: request.extracted.productName || null }, proposalCount, createdAt: request.createdAt, updatedAt: request.updatedAt };
}
export function requestProposalPage(offers: Array<Offer & { provider?: { score?: number } }>, actor: string, requestId: string, rawInput: RequestProposalPageInput, now = new Date()) {
  const input = normalizeRequestProposalPage(rawInput);
  const cursor = discoveryCursor({ ...input, requestId }, "request-proposals", actor);
  const price = (offer: any) => typeof offer.price === "number" && Number.isFinite(offer.price) ? offer.price : 1e100;
  const rating = (offer: any) => Number(offer.provider?.score || 0);
  const compare = (a: any, b: any) => input.sort === "price" ? price(a) - price(b) || a.id.localeCompare(b.id) : input.sort === "rating" ? rating(b) - rating(a) || b.id.localeCompare(a.id) : +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0) || b.id.localeCompare(a.id);
  const bound = cursor.row ? { id: cursor.row.id, price: cursor.row.value, provider: { score: cursor.row.value }, createdAt: cursor.row.value } : null;
  const matching = offers.filter((offer) => input.view === "all" || (input.view === "active" ? requestProposalActive(offer, now) : !requestProposalActive(offer, now))).sort(compare).filter((offer) => !bound || compare(offer, bound) > 0);
  const items = matching.slice(0, input.limit), hasNextPage = matching.length > input.limit;
  const last = items.at(-1);
  return { items, pageInfo: { hasNextPage, nextCursor: hasNextPage && last ? cursor.encode({ ...last, price: input.sort === "rating" ? rating(last) : price(last) }, input.sort === "newest" ? "newest" : input.sort === "price" ? "price_asc" : "price_desc") : null } };
}
export function buyerRequestPendingSummary(requests: AllwainScanRequest[], proposals: Offer[], limit = 3, now = new Date()) {
  const activeByRequest = new Map<string, number>();
  for (const offer of proposals) if (requestProposalActive(offer, now)) {
    const id = offer.requestId || (typeof offer.meta?.requestId === "string" ? offer.meta.requestId : null);
    if (id) activeByRequest.set(id, (activeByRequest.get(id) || 0) + 1);
  }
  const counts = { draft: 0, ready: 0, withProposals: 0 };
  const matching = requests.filter((request) => {
    if (request.status === "draft") { counts.draft++; return true; }
    if (request.status === "ready") { counts.ready++; return true; }
    if (request.status === "submitted" && activeByRequest.has(request.id)) { counts.withProposals++; return true; }
    return false;
  }).sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "") || b.id.localeCompare(a.id));
  return { total: matching.length, counts, items: matching.slice(0, Math.min(10, Math.max(1, Math.trunc(limit || 3)))).map((request) => requestPendingItem(request, activeByRequest.get(request.id) || 0)) };
}
