import type { RuntimeAnalyticsParams } from "./analyticsRuntime";
import { analyticsBuildConfig, analyticsEnvironmentParams, type AnalyticsPaymentEnvironment } from "./analyticsConfig";
import { analyticsGuardCurrent, sanitizeAnalyticsContext, sanitizeAnalyticsEvent, sanitizeAnalyticsScreen } from "./analyticsPolicy";

const measurementId = analyticsBuildConfig.webMeasurementId;
const configured = analyticsBuildConfig.webConfigured;
const disableKey = `ga-disable-${measurementId}`;
const canonicalAppUrl = "https://allwain.es/app";
let granted = false, initialized = false, consentRevision = 0;
let listeningWindow: any | null = null;
const queued = new Set<unknown>();

function browserWindow(): any | null {
  const candidate = globalThis as any;
  return candidate?.window && candidate?.document ? candidate.window : null;
}
function getGtag() {
  const target = browserWindow();
  if (!target) return null;
  target.dataLayer = target.dataLayer || [];
  // gtag.js consumes command Arguments objects, as in Google's installation
  // snippet. A rest-parameter Array looks similar but is not a gtag command.
  target.gtag = target.gtag || function gtag() { queued.add(arguments); target.dataLayer.push(arguments); };
  return target.gtag as (...args: unknown[]) => void;
}
function clearAnalyticsCookies() {
  const target = browserWindow(), document = target?.document;
  if (!target || !document) return;
  const host = String(target.location?.hostname || "");
  const domains = ["", host, host ? `.${host}` : "", ".allwain.es"].filter((value, index, values) => values.indexOf(value) === index);
  document.cookie.split(";").forEach((entry: string) => {
    const name = entry.split("=")[0]?.trim();
    if (!name || (!name.startsWith("_ga") && name !== "_gid" && !name.startsWith("_gat"))) return;
    domains.forEach(domain => {
      for (const path of ["/", "/app", "/app/"]) document.cookie = `${name}=; Max-Age=0; path=${path}${domain ? `; domain=${domain}` : ""}; SameSite=Lax; Secure`;
    });
  });
}
const deniedConsent = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
function initializeTag() {
  if (!configured || !granted || initialized) return;
  const target = browserWindow(), document = target?.document, gtag = getGtag();
  if (!target || !document || !gtag) return;
  target[disableKey] = false;
  gtag("consent", "default", deniedConsent);
  gtag("consent", "update", { ...deniedConsent, analytics_storage: "granted" });
  gtag("js", new Date());
  // Suppress implicit browser URL/referrer/title capture and automatic page views.
  gtag("config", measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
    page_location: canonicalAppUrl, page_referrer: "", page_title: "allwain app", ...analyticsEnvironmentParams("web") });
  if (!document.getElementById("allwain-google-analytics")) {
    const script = document.createElement("script");
    script.id = "allwain-google-analytics"; script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }
  initialized = true;
}
export async function configureRuntimeConsent(nextGranted: boolean) {
  granted = nextGranted === true && configured; ++consentRevision;
  try {
    const target = browserWindow();
    if (!target || !configured) return;
    if (target !== listeningWindow && target.addEventListener) {
      listeningWindow = target;
      target.addEventListener("storage", (event: any) => {
        if (event.key === "allwain:analytics-consent:allwain-analytics-v1-2026-09-06" && event.newValue !== "granted") void configureRuntimeConsent(false);
      });
    }
    if (granted) { initializeTag(); target[disableKey] = false; getGtag()?.("consent", "update", { ...deniedConsent, analytics_storage: "granted" }); return; }
    target[disableKey] = true;
    // Remove commands still waiting for gtag.js before pushing the refusal.
    if (Array.isArray(target.dataLayer)) target.dataLayer.splice(0, target.dataLayer.length,
      ...target.dataLayer.filter((item: any) => !queued.has(item) && !(item && (item[0] === "event" || (item[0] === "config" && item[1] === measurementId) || (item[0] === "consent" && item[2]?.analytics_storage === "granted")))));
    queued.clear();
    if (initialized) { try { getGtag()?.("consent", "update", deniedConsent); } catch { /* Cookie cleanup still runs. */ } }
    clearAnalyticsCookies();
  } catch { granted = false; ++consentRevision; }
}
function canEmit(revision: number, current?: () => boolean) {
  try {
    const storage = browserWindow()?.localStorage;
    const persisted = !storage || storage.getItem("allwain:analytics-consent:allwain-analytics-v1-2026-09-06") === "granted";
    return configured && granted && persisted && revision === consentRevision && analyticsGuardCurrent(current);
  } catch { return false; }
}
function safePageParams(screenName?: string) {
  return { page_title: screenName || "allwain app", page_location: screenName ? `${canonicalAppUrl}/${screenName.toLowerCase()}` : canonicalAppUrl, page_referrer: "" };
}
export async function trackRuntimeScreen(screenName: string, current?: () => boolean): Promise<boolean> {
  try {
    const safe = sanitizeAnalyticsScreen(screenName), revision = consentRevision;
    if (!safe || !canEmit(revision, current)) return false;
    initializeTag();
    const gtag = getGtag(); if (!gtag || !canEmit(revision, current)) return false;
    gtag("event", "page_view", { ...safePageParams(safe), ...analyticsEnvironmentParams("web") });
    return true;
  } catch { return false; }
}
export async function trackRuntimeEvent(eventName: string, params: RuntimeAnalyticsParams, current?: () => boolean): Promise<boolean> {
  try {
    const safe = sanitizeAnalyticsEvent(eventName, params), revision = consentRevision;
    if (!safe || !canEmit(revision, current)) return false;
    initializeTag();
    const gtag = getGtag(); if (!gtag || !canEmit(revision, current)) return false;
    const paymentEnvironment = eventName === "purchase" ? safe.payment_environment as AnalyticsPaymentEnvironment : "unknown";
    gtag("event", eventName, { ...safe, ...safePageParams(), ...analyticsEnvironmentParams("web", paymentEnvironment) });
    return true;
  } catch { return false; }
}
export async function setRuntimeContext(properties: Record<string, string | null>, current?: () => boolean): Promise<boolean> {
  try { const safe = sanitizeAnalyticsContext(properties), revision = consentRevision;
    if (!canEmit(revision, current)) return false;
    initializeTag(); const gtag = getGtag();
    if (!gtag || !canEmit(revision, current)) return false;
    gtag("set", "user_properties", safe); return true;
  } catch { return false; }
}
export function isRuntimeAnalyticsConfigured() { return configured; }
