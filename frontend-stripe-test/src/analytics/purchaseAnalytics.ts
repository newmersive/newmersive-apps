import AsyncStorage from "@react-native-async-storage/async-storage";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import type { AllwainOrder } from "../config/api";
import type { DiscoveryQuery } from "../utils/discoveryFilters";
import { getAnalyticsConsentSnapshot, trackAnalyticsEvent } from "./index";

type Mode = "buy" | "sell" | "connector";
type Surface = "search" | "offers" | "market_requests" | "shopping_lists" | "my_requests";
type Guard = () => boolean;
const validMode = (mode: unknown): mode is Mode => ["buy", "sell", "connector"].includes(String(mode));
const purchaseTails = new Map<string, Promise<unknown>>();
const recorded = new Set<string>();
export function captureAnalyticsGuard(current: Guard): Guard {
  const consent = getAnalyticsConsentSnapshot();
  return () => current() && consent.granted && consent.isCurrent();
}

/** The server supplies this descriptor only for a historically confirmed payment.
 * Local markers contain only a digest and a boolean, never an account, item or address. */
export async function observeConfirmedPurchases(orders: AllwainOrder[], accountId: string | undefined, appMode: string, current: Guard): Promise<void> {
  const consent = getAnalyticsConsentSnapshot();
  if (!Array.isArray(orders) || !accountId || appMode !== "buy" || !current() || !consent.granted) return;
  const valid = () => current() && consent.isCurrent();
  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    const payment = order.purchaseAnalytics;
    if (!valid() || order.buyerUserId !== accountId || order.paymentStatus !== "paid" || !payment ||
      payment.version !== 1 || !/^aw_(test|live)_[a-f0-9]{32}$/.test(payment.transactionId) || !payment.transactionId.startsWith(`aw_${payment.paymentEnvironment}_`) ||
      !["test", "live"].includes(payment.paymentEnvironment) || !/^[A-Z]{3}$/.test(payment.currency) ||
      typeof order.currency !== "string" || payment.currency !== order.currency.toUpperCase() || !Number.isSafeInteger(order.totalAmount) ||
      !Number.isFinite(payment.value) || payment.value < 0 || Math.round(payment.value * 100) !== order.totalAmount) continue;
    const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([accountId, payment.paymentEnvironment, payment.transactionId])).catch(() => null);
    if (!digest || !valid()) return;
    const key = `allwain:analytics:purchase:v1:${digest}`;
    const pending = (purchaseTails.get(key) || Promise.resolve()).catch(() => undefined).then(async () => {
      if (!valid() || recorded.has(key)) return;
      try {
        if (await AsyncStorage.getItem(key) || !valid()) return;
        // Persist before dispatch: a crash or lost SDK response cannot duplicate purchase.
        await AsyncStorage.setItem(key, "1");
        if (!valid()) { await AsyncStorage.removeItem(key); return; }
        const accepted = await trackAnalyticsEvent("purchase", {
          transaction_id: payment.transactionId, currency: payment.currency, value: payment.value,
          payment_environment: payment.paymentEnvironment,
        }, valid);
        if (accepted) recorded.add(key);
        else await AsyncStorage.removeItem(key);
      } catch { /* A storage failure prevents emission. Retry on the next authorized read. */ }
    });
    purchaseTails.set(key, pending);
    try { await pending; } finally { if (purchaseTails.get(key) === pending) purchaseTails.delete(key); }
  }
}

type QueryMeasurement = {
  counts: Map<string, number>; expected: string[]; executed: boolean; zero: boolean;
  filters: boolean; pending: Set<string>;
};
export type DiscoveryAnalyticsState = Map<string, QueryMeasurement>;
export function createDiscoveryAnalyticsState(): DiscoveryAnalyticsState { return new Map(); }
function entry(state: DiscoveryAnalyticsState, key: string) {
  let value = state.get(key);
  if (!value) {
    value = { counts: new Map(), expected: [], executed: false, zero: false, filters: false, pending: new Set() };
    state.set(key, value);
    if (state.size > 100) state.delete(state.keys().next().value!);
  }
  return value;
}
export function discoveryMeasurement(query: Partial<DiscoveryQuery>, allowed?: string[]) {
  const included = (key: keyof DiscoveryQuery) => (!allowed || allowed.includes(key)) && Boolean(query[key]);
  const category_filter = ["category", "subcategory", "productKind"].some(key => included(key as keyof DiscoveryQuery));
  const location_filter = included("locationLabel") || included("radiusKm");
  const price_filter = included("minPrice") || included("maxPrice");
  const status_filter = ["status", "responseStatus", "paymentStatus", "fulfillmentStatus", "contractStatus"].some(key => included(key as keyof DiscoveryQuery));
  const filter_count = Object.entries(query).filter(([key, value]) => key !== "q" && !["latitude", "longitude", "radiusKm"].includes(key) && key !== "sort" && (!allowed || allowed.includes(key)) && Boolean(value)).length + (included("radiusKm") ? 1 : 0) + (query.sort && query.sort !== "newest" && (!allowed || allowed.includes("sort")) ? 1 : 0);
  return { query_present: typeof query.q === "string" && query.q.trim().length > 0, filter_count, category_filter, location_filter, price_filter, status_filter };
}
type DiscoveryInput = { state: DiscoveryAnalyticsState; scope: string; queryKey: string; query: Partial<DiscoveryQuery>; surface: Surface; appMode: string; current: Guard; allowed?: string[] };
async function emitDiscovery(input: DiscoveryInput, name: "search_executed" | "filters_applied" | "search_zero_results", resultCount: number) {
  const consent = getAnalyticsConsentSnapshot();
  if (!validMode(input.appMode) || !input.current() || !consent.granted) return;
  const saved = entry(input.state, `${input.scope}:${input.surface}:${input.queryKey}`);
  const marker = name === "search_executed" ? "executed" : name === "filters_applied" ? "filters" : "zero";
  if (saved[marker] || saved.pending.has(marker)) return;
  saved.pending.add(marker);
  try {
    const accepted = await trackAnalyticsEvent(name, { surface: input.surface, app_mode: input.appMode, ...discoveryMeasurement(input.query, input.allowed), result_count: Math.min(1_000_000, Math.max(0, resultCount)) }, () => input.current() && consent.isCurrent());
    if (accepted) saved[marker] = true;
  } finally { saved.pending.delete(marker); }
}
/** First pages only. All relevant streams must confirm the same applied query.
 * Error/retry pages, append pages and out-of-date reads never create a false zero. */
export async function recordDiscoveryResults(input: DiscoveryInput & { stream?: string; expectedStreams?: string[]; resultCount: number; append?: boolean }): Promise<void> {
  if (input.append || !input.current() || !Number.isFinite(input.resultCount) || input.resultCount < 0) return;
  const saved = entry(input.state, `${input.scope}:${input.surface}:${input.queryKey}`);
  saved.counts.set(input.stream || "main", input.resultCount);
  saved.expected = input.expectedStreams || [input.stream || "main"];
  if (!saved.expected.every(stream => saved.counts.has(stream))) return;
  const count = saved.expected.reduce((sum, stream) => sum + (saved.counts.get(stream) || 0), 0);
  await emitDiscovery(input, "search_executed", count);
  if (count === 0) await emitDiscovery(input, "search_zero_results", 0);
}
export async function recordAppliedFilters(input: DiscoveryInput, previousKey: string): Promise<void> {
  if (input.queryKey === previousKey) return;
  await emitDiscovery(input, "filters_applied", 0);
}
export async function recordPublicationWithdrawal(publicationType: "request" | "catalog" | "proposal" | "shopping_list", appMode: string, current: Guard): Promise<void> {
  if (!validMode(appMode) || !current()) return;
  const consent = getAnalyticsConsentSnapshot();
  if (!consent.granted) return;
  await trackAnalyticsEvent("publication_withdrawn", { publication_type: publicationType, app_mode: appMode }, () => current() && consent.isCurrent());
}
