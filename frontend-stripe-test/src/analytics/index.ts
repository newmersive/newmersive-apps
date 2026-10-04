import {
  configureRuntimeConsent,
  isRuntimeAnalyticsConfigured,
  setRuntimeContext,
  trackRuntimeEvent,
  trackRuntimeScreen,
  type RuntimeAnalyticsParams,
} from "./analyticsRuntime";

export const ANALYTICS_CONSENT_VERSION = "allwain-analytics-v1-2026-09-06";

export type AnalyticsConsentState = "unknown" | "granted" | "denied";

export type AnalyticsEventMap = {
  app_mode_changed: { app_mode: "buy" | "sell" | "connector" };
  login: { method: "password" | "google" | "apple" };
  sign_up: { method: "password" | "google" | "apple" };
  offer_created: { offer_type: "goods" | "food" | "service" | "other" };
  request_created: {
    source: "camera" | "image" | "barcode" | "text" | "guide" | "manual";
  };
  proposal_submitted: { source: "request" | "shopping_list" };
  begin_checkout: {
    currency: string;
    value: number;
    delivery_method: "local_connector" | "carrier" | "pickup" | "seller" | "other";
    payment_mode: "payment" | "preorder";
  };
  checkout_opened: { payment_mode: "payment" | "setup" };
  purchase_completed: { currency: string; value: number };
  connector_activated: { radius_km: number };
  delivery_accepted: { delivery_kind: "local_connector" };
  chat_started: { context: "direct" | "offer" | "request" | "order" };
  chat_message_translated: { target_locale: string; cached: boolean };
  chat_auto_translation_changed: { enabled: boolean; target_locale: string };
  analytics_consent_updated: { granted: boolean };
};

function safeParams(value: Record<string, unknown>): RuntimeAnalyticsParams {
  return Object.entries(value).reduce<RuntimeAnalyticsParams>(
    (result, [key, item]) => {
      if (typeof item === "boolean") result[key] = item;
      if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
      if (typeof item === "string") result[key] = item.slice(0, 80);
      return result;
    },
    {},
  );
}

export async function configureAnalyticsConsent(granted: boolean) {
  await configureRuntimeConsent(granted);
}

export async function trackAnalyticsScreen(screenName: string) {
  const safeName = String(screenName || "Unknown")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .slice(0, 40);
  await trackRuntimeScreen(safeName || "Unknown");
}

export async function trackAnalyticsEvent<Name extends keyof AnalyticsEventMap>(
  name: Name,
  params: AnalyticsEventMap[Name],
) {
  await trackRuntimeEvent(name, safeParams(params as Record<string, unknown>));
}

export async function setAnalyticsContext(input: {
  appMode?: string | null;
  locale?: string | null;
}) {
  await setRuntimeContext({
    app_mode: input.appMode?.slice(0, 24) || null,
    app_locale: input.locale?.slice(0, 8) || null,
  });
}

export { isRuntimeAnalyticsConfigured as isAnalyticsConfigured };
