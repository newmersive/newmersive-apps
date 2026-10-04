import type { RuntimeAnalyticsParams } from "./analyticsRuntime";

const measurementId = String(
  process.env.EXPO_PUBLIC_GA_MEASUREMENT_ID || "",
).trim();
const configured = /^G-[A-Z0-9]+$/i.test(measurementId);
const disableKey = `ga-disable-${measurementId}`;

let granted = false;
let initialized = false;

function browserWindow(): any | null {
  const candidate = globalThis as any;
  return candidate?.window && candidate?.document ? candidate.window : null;
}

function getGtag() {
  const target = browserWindow();
  if (!target) return null;
  target.dataLayer = target.dataLayer || [];
  target.gtag =
    target.gtag ||
    function gtag(...args: unknown[]) {
      target.dataLayer.push(args);
    };
  return target.gtag as (...args: unknown[]) => void;
}

function clearAnalyticsCookies() {
  const target = browserWindow();
  const document = target?.document;
  if (!target || !document) return;
  const host = String(target.location?.hostname || "");
  const domains = ["", host, host ? `.${host}` : "", ".allwain.es"].filter(
    (value, index, values) => values.indexOf(value) === index,
  );
  document.cookie.split(";").forEach((entry: string) => {
    const name = entry.split("=")[0]?.trim();
    if (
      !name ||
      (!name.startsWith("_ga") && name !== "_gid" && !name.startsWith("_gat"))
    ) {
      return;
    }
    domains.forEach((domain) => {
      const domainPart = domain ? `; domain=${domain}` : "";
      document.cookie = `${name}=; Max-Age=0; path=/${domainPart}; SameSite=Lax; Secure`;
    });
  });
}

function initializeTag() {
  if (!configured || initialized) return;
  const target = browserWindow();
  const document = target?.document;
  const gtag = getGtag();
  if (!target || !document || !gtag) return;

  target[disableKey] = false;
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  gtag("consent", "update", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  gtag("js", new Date());
  gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  if (!document.getElementById("allwain-google-analytics")) {
    const script = document.createElement("script");
    script.id = "allwain-google-analytics";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      measurementId,
    )}`;
    document.head.appendChild(script);
  }
  initialized = true;
}

export async function configureRuntimeConsent(nextGranted: boolean) {
  granted = nextGranted;
  if (!configured) return;
  const target = browserWindow();
  if (!target) return;

  if (nextGranted) {
    initializeTag();
    target[disableKey] = false;
    getGtag()?.("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    return;
  }

  target[disableKey] = true;
  if (initialized) {
    getGtag()?.("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }
  clearAnalyticsCookies();
}

export async function trackRuntimeScreen(screenName: string) {
  if (!configured || !granted) return;
  initializeTag();
  const target = browserWindow();
  const origin = String(target?.location?.origin || "https://allwain.es");
  getGtag()?.("event", "page_view", {
    page_title: screenName,
    page_location: `${origin}/app/${screenName.toLowerCase()}`,
  });
}

export async function trackRuntimeEvent(
  eventName: string,
  params: RuntimeAnalyticsParams,
) {
  if (!configured || !granted) return;
  initializeTag();
  getGtag()?.("event", eventName, params);
}

export async function setRuntimeContext(
  properties: Record<string, string | null>,
) {
  if (!configured || !granted) return;
  initializeTag();
  getGtag()?.("set", "user_properties", properties);
}

export function isRuntimeAnalyticsConfigured() {
  return configured;
}
