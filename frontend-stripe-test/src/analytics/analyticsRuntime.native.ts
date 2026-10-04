import { Platform } from "react-native";
import type { RuntimeAnalyticsParams } from "./analyticsRuntime";
import { analyticsBuildConfig, analyticsEnvironmentParams, type AnalyticsPlatform, type AnalyticsPaymentEnvironment } from "./analyticsConfig";
import { analyticsGuardCurrent, sanitizeAnalyticsContext, sanitizeAnalyticsEvent, sanitizeAnalyticsScreen } from "./analyticsPolicy";

type NativeAnalyticsBundle = { analytics: any; module: typeof import("@react-native-firebase/analytics") };
const platform: AnalyticsPlatform = Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : "native_unknown";
let granted = false, ready = false, unavailable = false;
let nativeBundlePromise: Promise<NativeAnalyticsBundle | null> | null = null;
let consentRevision = 0;
let consentTask: Promise<void> = Promise.resolve();

function loadNativeAnalytics() {
  if (!nativeBundlePromise) nativeBundlePromise = import("@react-native-firebase/analytics")
    .then(module => ({ module, analytics: module.getAnalytics() })).catch(() => { unavailable = true; return null; });
  return nativeBundlePromise;
}
export async function configureRuntimeConsent(nextGranted: boolean) {
  granted = nextGranted === true && analyticsBuildConfig.validEnvironment;
  ready = false;
  const requestedGrant = granted, revision = ++consentRevision;
  if (!requestedGrant && !nativeBundlePromise) return;
  consentTask = consentTask.catch(() => {}).then(async () => {
    // A refusal always reaches the SDK, even if a later grant has been requested.
    if (requestedGrant && revision !== consentRevision) return;
    const bundle = await loadNativeAnalytics();
    if (!bundle || (requestedGrant && revision !== consentRevision)) return;
    const { analytics, module } = bundle;
    if (requestedGrant) {
      if (module.setDefaultEventParameters) await module.setDefaultEventParameters(analytics, analyticsEnvironmentParams(platform));
      if (revision !== consentRevision) return;
      await module.setConsent(analytics, { analytics_storage: true, ad_storage: false, ad_user_data: false, ad_personalization: false });
      if (revision !== consentRevision) return;
      await module.setAnalyticsCollectionEnabled(analytics, true);
      ready = revision === consentRevision && granted;
    } else {
      await module.setAnalyticsCollectionEnabled(analytics, false);
      await module.setConsent(analytics, { analytics_storage: false, ad_storage: false, ad_user_data: false, ad_personalization: false });
      if (module.setUserId) await module.setUserId(analytics, null);
      if (module.setDefaultEventParameters) await module.setDefaultEventParameters(analytics, undefined);
      await module.resetAnalyticsData(analytics);
    }
  }).catch(async () => {
    if (revision === consentRevision) { granted = false; ready = false; ++consentRevision; }
    const bundle = await loadNativeAnalytics();
    if (bundle) {
      await bundle.module.setAnalyticsCollectionEnabled(bundle.analytics, false).catch(() => {});
      await bundle.module.setConsent(bundle.analytics, { analytics_storage: false, ad_storage: false, ad_user_data: false, ad_personalization: false }).catch(() => {});
      await bundle.module.resetAnalyticsData(bundle.analytics).catch(() => {});
    }
  });
  return consentTask;
}
async function authorizedBundle(revision: number, current?: () => boolean) {
  if (!granted || !analyticsGuardCurrent(current)) return null;
  await consentTask;
  const bundle = await loadNativeAnalytics();
  return bundle && ready && granted && revision === consentRevision && analyticsGuardCurrent(current) ? bundle : null;
}
export async function trackRuntimeScreen(screenName: string, current?: () => boolean): Promise<boolean> {
  try {
    const safe = sanitizeAnalyticsScreen(screenName), revision = consentRevision;
    if (!safe) return false;
    const bundle = await authorizedBundle(revision, current);
    if (!bundle) return false;
    await bundle.module.logScreenView(bundle.analytics, { screen_name: safe, screen_class: safe, ...analyticsEnvironmentParams(platform) });
    return true;
  } catch { return false; }
}
export async function trackRuntimeEvent(eventName: string, params: RuntimeAnalyticsParams, current?: () => boolean): Promise<boolean> {
  try {
    const safe = sanitizeAnalyticsEvent(eventName, params), revision = consentRevision;
    if (!safe) return false;
    const bundle = await authorizedBundle(revision, current);
    if (!bundle) return false;
    const paymentEnvironment = eventName === "purchase" ? safe.payment_environment as AnalyticsPaymentEnvironment : "unknown";
    await bundle.module.logEvent(bundle.analytics, eventName, { ...safe, ...analyticsEnvironmentParams(platform, paymentEnvironment) });
    return true;
  } catch { return false; }
}
export async function setRuntimeContext(properties: Record<string, string | null>, current?: () => boolean): Promise<boolean> {
  try {
    const revision = consentRevision, safe = sanitizeAnalyticsContext(properties);
    const bundle = await authorizedBundle(revision, current);
    if (!bundle) return false;
    await bundle.module.setUserProperties(bundle.analytics, safe);
    return true;
  } catch { return false; }
}
export function isRuntimeAnalyticsConfigured() { return analyticsBuildConfig.validEnvironment && !unavailable; }
