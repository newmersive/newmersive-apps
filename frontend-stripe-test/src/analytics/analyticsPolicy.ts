import type { RuntimeAnalyticsParams } from "./analyticsRuntime";

export type AnalyticsMode = "buy" | "sell" | "connector";
export type AnalyticsDiscovery = {
  surface: "search" | "offers" | "market_requests" | "shopping_lists" | "my_requests";
  app_mode: AnalyticsMode; query_present: boolean; filter_count: number; result_count: number;
  category_filter: boolean; location_filter: boolean; price_filter: boolean; status_filter: boolean;
};
export type AnalyticsEventMap = {
  app_mode_changed: { app_mode: AnalyticsMode };
  login: { method: "password" | "google" | "apple" };
  sign_up: { method: "password" | "google" | "apple" };
  offer_created: { offer_type: "goods" | "food" | "service" | "other" };
  request_created: { source: "camera" | "image" | "barcode" | "text" | "guide" | "manual" };
  proposal_submitted: { source: "request" | "shopping_list" };
  begin_checkout: { currency: string; value: number; delivery_method: "local_connector" | "carrier" | "pickup" | "seller" | "other"; payment_mode: "payment" | "preorder" };
  checkout_opened: { payment_mode: "payment" | "setup" };
  purchase: { transaction_id: string; currency: string; value: number; payment_environment: "test" | "live" };
  connector_activated: { radius_km: number };
  delivery_accepted: { delivery_kind: "local_connector" };
  chat_started: { context: "direct" | "offer" | "request" | "order" };
  chat_message_translated: { target_locale: string; cached: boolean };
  chat_auto_translation_changed: { enabled: boolean; target_locale: string };
  analytics_consent_updated: { granted: boolean };
  search_executed: AnalyticsDiscovery;
  filters_applied: AnalyticsDiscovery;
  search_zero_results: AnalyticsDiscovery;
  publication_withdrawn: { publication_type: "request" | "catalog" | "proposal" | "shopping_list"; app_mode: AnalyticsMode };
};

type Rule = (value: unknown) => boolean;
const oneOf = (...values: string[]): Rule => value => typeof value === "string" && values.includes(value);
const boolean: Rule = value => typeof value === "boolean";
const amount: Rule = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
const count: Rule = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
const currency: Rule = value => typeof value === "string" && /^[A-Z]{3}$/.test(value);
const locale = oneOf("es", "en", "fr", "it", "zh", "ar");
const mode = oneOf("buy", "sell", "connector");
const discovery = { surface: oneOf("search", "offers", "market_requests", "shopping_lists", "my_requests"), app_mode: mode,
  query_present: boolean, filter_count: count, result_count: count, category_filter: boolean, location_filter: boolean, price_filter: boolean, status_filter: boolean };
const rules: Record<keyof AnalyticsEventMap, Record<string, Rule>> = {
  app_mode_changed: { app_mode: mode }, login: { method: oneOf("password", "google", "apple") }, sign_up: { method: oneOf("password", "google", "apple") },
  offer_created: { offer_type: oneOf("goods", "food", "service", "other") }, request_created: { source: oneOf("camera", "image", "barcode", "text", "guide", "manual") },
  proposal_submitted: { source: oneOf("request", "shopping_list") },
  begin_checkout: { currency, value: amount, delivery_method: oneOf("local_connector", "carrier", "pickup", "seller", "other"), payment_mode: oneOf("payment", "preorder") },
  checkout_opened: { payment_mode: oneOf("payment", "setup") },
  purchase: { transaction_id: value => typeof value === "string" && /^aw_(test|live)_[a-f0-9]{32}$/.test(value), currency, value: amount, payment_environment: oneOf("test", "live") },
  connector_activated: { radius_km: value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000 },
  delivery_accepted: { delivery_kind: oneOf("local_connector") }, chat_started: { context: oneOf("direct", "offer", "request", "order") },
  chat_message_translated: { target_locale: locale, cached: boolean }, chat_auto_translation_changed: { enabled: boolean, target_locale: locale },
  analytics_consent_updated: { granted: boolean }, search_executed: discovery, filters_applied: discovery, search_zero_results: discovery,
  publication_withdrawn: { publication_type: oneOf("request", "catalog", "proposal", "shopping_list"), app_mode: mode },
};

/** Required fields are checked, unknown fields discarded. No arbitrary text, IDs,
 * coordinates, URLs, errors, device identifiers or document payloads are allowed. */
export function sanitizeAnalyticsEvent(name: string, input: unknown): RuntimeAnalyticsParams | null {
  if (!Object.hasOwn(rules, name) || !input || typeof input !== "object" || Array.isArray(input)) return null;
  const schema = rules[name as keyof AnalyticsEventMap];
  const value = input as Record<string, unknown>, result: RuntimeAnalyticsParams = {};
  for (const [key, valid] of Object.entries(schema)) {
    if (!valid(value[key])) return null;
    result[key] = value[key] as string | number | boolean;
  }
  if (name === "purchase" && !String(result.transaction_id).startsWith(`aw_${result.payment_environment}_`)) return null;
  if (name === "search_zero_results" && result.result_count !== 0) return null;
  return result;
}

const screens = new Set(["Splash", "Auth", "MainTabs", "Inicio", "Ofertas", "Demandas", "ProgramaRecomendados", "GuiaIA", "Perfil",
  "MyRequests", "Search", "ManualRequest", "HowAllwainWorks", "Notifications", "ShoppingLists", "ChatList", "ChatThread", "VideoCall", "Legal",
  "Scan", "ScanResult", "DemoLanding", "DemoScanResult", "ActivateSeller", "ActivateConnector", "AdminDashboard"]);
export function sanitizeAnalyticsScreen(value: unknown): string | null { return typeof value === "string" && screens.has(value) ? value : null; }
export function sanitizeAnalyticsContext(input: Record<string, unknown>): Record<string, string | null> {
  return { app_mode: mode(input.app_mode) ? input.app_mode as string : null, app_locale: locale(input.app_locale) ? input.app_locale as string : null };
}
export function analyticsGuardCurrent(current?: () => boolean): boolean { try { return current ? current() === true : true; } catch { return false; } }
