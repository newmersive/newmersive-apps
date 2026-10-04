import { useEffect, useState } from "react";
import { readJourneyDraft, writeJourneyDraft } from "./journeyDrafts";

export type DiscoveryQuery = {
  q: string; category: string; subcategory: string; productKind: string;
  unit: string; currency: string; minPrice: string; maxPrice: string;
  locationLabel: string; dateFrom: string; dateTo: string;
  sort: "newest" | "price_asc" | "price_desc"; status: string;
  latitude?: number; longitude?: number; radiusKm?: number;
  responseStatus?: string; deliveryChannel?: string; proposalDeadlineBefore?: string; proposalDeadlineAfter?: string;
  paymentStatus?: string; fulfillmentStatus?: string; contractStatus?: string;
};
export const EMPTY_DISCOVERY_QUERY: DiscoveryQuery = {
  q: "", category: "", subcategory: "", productKind: "", unit: "", currency: "",
  minPrice: "", maxPrice: "", locationLabel: "", dateFrom: "", dateTo: "", sort: "newest", status: "",
};
const textKeys = ["q", "category", "subcategory", "productKind", "unit", "currency", "minPrice", "maxPrice", "locationLabel", "dateFrom", "dateTo", "status", "responseStatus", "deliveryChannel", "proposalDeadlineBefore", "proposalDeadlineAfter", "paymentStatus", "fulfillmentStatus", "contractStatus"] as const;
export function normalizeDiscoveryQuery(input: Partial<DiscoveryQuery>): DiscoveryQuery {
  const result: DiscoveryQuery = { ...EMPTY_DISCOVERY_QUERY };
  for (const key of textKeys) {
    const value = typeof input[key] === "string" ? String(input[key]).trim() : "";
    if (key in EMPTY_DISCOVERY_QUERY || value) (result as any)[key] = value;
  }
  if (input.sort === "price_asc" || input.sort === "price_desc") result.sort = input.sort;
  if (!result.unit || !result.currency) result.sort = "newest";
  if (Number.isFinite(input.latitude) && Math.abs(input.latitude!) <= 90 && Number.isFinite(input.longitude) && Math.abs(input.longitude!) <= 180 && Number.isFinite(input.radiusKm) && input.radiusKm! > 0) {
    result.latitude = input.latitude; result.longitude = input.longitude; result.radiusKm = input.radiusKm;
  }
  return result;
}
export function discoveryQueryKey(query: Partial<DiscoveryQuery>) {
  const normalized = normalizeDiscoveryQuery(query);
  return JSON.stringify(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)));
}
export function discoveryQueryValidation(query: Partial<DiscoveryQuery>): "price" | "date" | "priceUnit" | null {
  const value = normalizeDiscoveryQuery(query);
  const min = value.minPrice ? Number(value.minPrice.replace(",", ".")) : undefined, max = value.maxPrice ? Number(value.maxPrice.replace(",", ".")) : undefined;
  if ((min != null && (!Number.isFinite(min) || min < 0)) || (max != null && (!Number.isFinite(max) || max < 0)) || (min != null && max != null && min > max)) return "price";
  if ((min != null || max != null) && (!value.unit || !value.currency)) return "priceUnit";
  const validDate = (date?: string) => { if (!date) return true; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; const parsed = new Date(`${date}T00:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date; };
  if (![value.dateFrom, value.dateTo, value.proposalDeadlineBefore, value.proposalDeadlineAfter].every(validDate) || value.dateFrom && value.dateTo && value.dateFrom > value.dateTo || value.proposalDeadlineAfter && value.proposalDeadlineBefore && value.proposalDeadlineAfter > value.proposalDeadlineBefore) return "date";
  return null;
}
export function discoveryPageUrl(path: string, query: Partial<DiscoveryQuery>, options: { fixed?: Record<string, string>; cursor?: string; limit?: number; allowed?: string[] } = {}) {
  const normalized = normalizeDiscoveryQuery(query);
  const params = new URLSearchParams({ limit: String(options.limit || 30) });
  for (const [name, value] of Object.entries(normalized)) {
    if (value === "" || value == null || (name === "sort" && value === "newest") || (options.allowed && !options.allowed.includes(name))) continue;
    params.set(name, String(value));
  }
  // Fixed scope/state restrictions cannot be weakened by a saved query.
  for (const [name, value] of Object.entries(options.fixed || {})) params.set(name, value);
  if (options.cursor) params.set("cursor", options.cursor);
  return `${path}?${params.toString()}`;
}

const cache = new Map<string, DiscoveryQuery>();
const versions = new Map<string, number>();
const listeners = new Map<string, Set<(query: DiscoveryQuery) => void>>();
const queryStorageKey = (context: string) => `discovery:${context}`;
export function setDiscoveryQuery(accountId: string, context: string, query: Partial<DiscoveryQuery>) {
  if (!accountId) return;
  const key = `${accountId}:${context}`, normalized = normalizeDiscoveryQuery(query);
  versions.set(key, (versions.get(key) || 0) + 1); cache.set(key, normalized);
  for (const listener of listeners.get(key) || []) listener(normalized);
  // Search coordinates are optional, temporary context, never a delivery address.
  const { latitude: _lat, longitude: _lng, radiusKm: _radius, ...safe } = normalized;
  void writeJourneyDraft(accountId, queryStorageKey(context), safe);
}
export function useDiscoveryQuery(accountId: string | undefined, context: string) {
  const key = `${accountId || ""}:${context}`;
  const [state, setState] = useState<{ key: string; query: DiscoveryQuery; ready: boolean }>(() => ({ key, query: cache.get(key) || { ...EMPTY_DISCOVERY_QUERY }, ready: cache.has(key) }));
  useEffect(() => {
    let active = true;
    const update = (query: DiscoveryQuery) => { if (active) setState({ key, query, ready: true }); };
    const subscribers = listeners.get(key) || new Set(); subscribers.add(update); listeners.set(key, subscribers);
    const revision = versions.get(key) || 0;
    if (!accountId) setState({ key, query: { ...EMPTY_DISCOVERY_QUERY }, ready: true });
    else if (cache.has(key)) update(cache.get(key)!);
    else void readJourneyDraft<Partial<DiscoveryQuery>>(accountId, queryStorageKey(context)).then(saved => {
      if (!active || revision !== (versions.get(key) || 0)) return;
      const query = normalizeDiscoveryQuery(saved || {}); cache.set(key, query); update(query);
    }).catch(() => {
      if (!active || revision !== (versions.get(key) || 0)) return;
      const query = { ...EMPTY_DISCOVERY_QUERY }; cache.set(key, query); update(query);
    });
    return () => { active = false; subscribers.delete(update); };
  }, [accountId, context, key]);
  return {
    query: state.key === key ? state.query : cache.get(key) || { ...EMPTY_DISCOVERY_QUERY },
    ready: state.key === key && state.ready,
    setQuery: (query: Partial<DiscoveryQuery>) => setDiscoveryQuery(accountId || "", context, query),
  };
}
