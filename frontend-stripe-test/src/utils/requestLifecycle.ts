import type { AllwainContract, AllwainScanRequest } from "../config/api";

export type RequestScope = "active" | "history";
export type RequestPublicationAction = "discard" | "withdraw" | "close" | "archive";
type RequestIdentity = Pick<AllwainScanRequest, "id" | "status" | "selectedOfferId" | "userId">;

const scopes: Record<RequestScope, AllwainScanRequest["status"][]> = {
  active: ["draft", "ready", "submitted", "awarded"],
  history: ["closed", "canceled", "archived"],
};

export function requestStatuses(scope: RequestScope) { return [...scopes[scope]]; }
export function requestIsInScope(request: RequestIdentity, scope: RequestScope) {
  return scopes[scope].includes(request.status);
}

// A selected proposal continues through its existing agreement and order. Never
// present it as a deletable draft, even if the list response has an old status.
export function requestPublicationAction(request: RequestIdentity): RequestPublicationAction | null {
  if (request.status === "archived") return null;
  if (request.status === "closed" || request.status === "canceled") return "archive";
  if (request.status === "awarded") return "close";
  if (request.selectedOfferId) return null;
  if (request.status === "draft" || request.status === "ready") return "discard";
  if (request.status === "submitted") return "withdraw";
  return null;
}

export function publicationTarget(action: RequestPublicationAction): AllwainScanRequest["status"] {
  return action === "archive" ? "archived" : action === "close" ? "closed" : "canceled";
}

export function hasRequestOrder(request: RequestIdentity) {
  return Boolean(request.selectedOfferId) || request.status === "awarded";
}

export function requestsPageUrl(scope: RequestScope, cursor?: string) {
  return `/allwain/scan-requests?limit=30&status=${requestStatuses(scope).join(",")}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
}

export async function transitionRequestPublication(
  request: RequestIdentity,
  action: RequestPublicationAction,
  dependencies: {
    accountId: string;
    isCurrent: () => boolean;
    read: (id: string) => Promise<AllwainScanRequest>;
    patch: (id: string, status: AllwainScanRequest["status"]) => Promise<AllwainScanRequest>;
  },
): Promise<AllwainScanRequest | null> {
  if (!dependencies.isCurrent()) return null;
  const latest = await dependencies.read(request.id);
  if (!dependencies.isCurrent()) return null;
  if (latest.id !== request.id || (latest.userId && latest.userId !== dependencies.accountId) ||
      requestPublicationAction(latest) !== action) {
    throw new Error("REQUEST_PUBLICATION_CHANGED");
  }
  const status = publicationTarget(action);
  const updated = await dependencies.patch(request.id, status);
  if (!dependencies.isCurrent()) return null;
  if (updated.id !== request.id || updated.status !== status ||
      (updated.userId && updated.userId !== dependencies.accountId)) {
    throw new Error("REQUEST_PUBLICATION_UNCONFIRMED");
  }
  return updated;
}

export async function existingRequestContract(
  request: RequestIdentity,
  accountId: string,
  isCurrent: () => boolean,
  read: (url: string) => Promise<{ items?: AllwainContract[] }>,
): Promise<string | null> {
  if (!request.selectedOfferId || !isCurrent()) return null;
  const result = await read(`/allwain/contracts?scope=buyer&offerId=${encodeURIComponent(request.selectedOfferId)}&limit=1`);
  if (!isCurrent()) return null;
  // Never turn a mismatched result into a new purchase or another user's order.
  const contract = result.items?.find(item => item.offerId === request.selectedOfferId && item.requesterUserId === accountId);
  return contract?.id || null;
}
