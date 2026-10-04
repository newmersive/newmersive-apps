/** Filter capabilities are explicit: lists add delivery/deadline, individual requests do not. */
export const MARKET_REQUEST_FILTERS = ["q", "category", "subcategory", "productKind", "unit", "currency", "minPrice", "maxPrice", "locationLabel", "latitude", "longitude", "radiusKm", "responseStatus", "dateFrom", "dateTo"];
export const MARKET_LIST_FILTERS = [...MARKET_REQUEST_FILTERS, "deliveryChannel", "proposalDeadlineBefore", "proposalDeadlineAfter"];
export const OWN_LIST_FILTERS = [...MARKET_LIST_FILTERS.filter(key => key !== "responseStatus"), "status"];

export type DiscoveryPageInfo = { hasNextPage?: boolean; nextCursor?: string | null; queryKey?: string };

/** A cursor is meaningful only for the exact applied query that returned it. */
export function discoveryPageCursor(page: DiscoveryPageInfo, appliedKey: string) {
  return page.queryKey === appliedKey && page.hasNextPage && page.nextCursor ? page.nextCursor : null;
}

export function mergeDiscoveryPage<T extends { id: string }>(previous: T[], incoming: T[]) {
  const merged = new Map(previous.map(item => [item.id, item]));
  incoming.forEach(item => merged.set(item.id, item));
  return [...merged.values()];
}

/** Two streams can finish independently, but an older query or account never wins. */
export function createDiscoveryReadGuard(initialScope = "") {
  let scope = initialScope;
  let key = "";
  let generation = 0;
  const revisions = new Map<string, number>();
  return {
    apply(nextScope: string, nextKey: string) {
      if (scope !== nextScope || key !== nextKey) {
        scope = nextScope; key = nextKey; generation += 1; revisions.clear();
      }
    },
    start(stream: string) {
      const revision = (revisions.get(stream) || 0) + 1;
      revisions.set(stream, revision);
      return { scope, key, generation, stream, revision };
    },
    invalidate() { generation += 1; revisions.clear(); },
    isCurrent(ticket: { scope: string; key: string; generation: number; stream: string; revision: number }) {
      return ticket.scope === scope && ticket.key === key && ticket.generation === generation && revisions.get(ticket.stream) === ticket.revision;
    },
  };
}
