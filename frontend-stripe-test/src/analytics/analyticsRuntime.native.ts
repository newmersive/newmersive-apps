import type { RuntimeAnalyticsParams } from "./analyticsRuntime";

type NativeAnalyticsBundle = {
  analytics: any;
  module: typeof import("@react-native-firebase/analytics");
};

let granted = false;
let nativeBundlePromise: Promise<NativeAnalyticsBundle | null> | null = null;
let consentRevision = 0;
let consentTask: Promise<void> = Promise.resolve();

function loadNativeAnalytics() {
  if (!nativeBundlePromise) {
    nativeBundlePromise = import("@react-native-firebase/analytics")
      .then((module) => ({ module, analytics: module.getAnalytics() }))
      .catch((error) => {
        console.warn("Allwain Analytics is unavailable in this build", error);
        return null;
      });
  }
  return nativeBundlePromise;
}

export async function configureRuntimeConsent(nextGranted: boolean) {
  granted = nextGranted;
  const revision = ++consentRevision;
  if (!nextGranted && !nativeBundlePromise) return;
  consentTask = consentTask.catch(() => {}).then(async () => {
    if (revision !== consentRevision) return;
    const bundle = await loadNativeAnalytics();
    if (!bundle || revision !== consentRevision) return;

    const { analytics, module } = bundle;
    if (nextGranted) {
      await module.setConsent(analytics, {
        analytics_storage: true,
        ad_storage: false,
        ad_user_data: false,
        ad_personalization: false,
      });
      if (revision !== consentRevision) return;
      await module.setAnalyticsCollectionEnabled(analytics, true);
      return;
    }

    await module.setAnalyticsCollectionEnabled(analytics, false);
    await module.setConsent(analytics, {
      analytics_storage: false,
      ad_storage: false,
      ad_user_data: false,
      ad_personalization: false,
    });
    await module.resetAnalyticsData(analytics);
  });
  return consentTask;
}

export async function trackRuntimeScreen(screenName: string) {
  if (!granted) return;
  await consentTask;
  const bundle = await loadNativeAnalytics();
  if (!bundle || !granted) return;
  await bundle.module.logScreenView(bundle.analytics, {
    screen_name: screenName,
    screen_class: screenName,
  });
}

export async function trackRuntimeEvent(
  eventName: string,
  params: RuntimeAnalyticsParams,
) {
  if (!granted) return;
  await consentTask;
  const bundle = await loadNativeAnalytics();
  if (!bundle || !granted) return;
  await bundle.module.logEvent(bundle.analytics, eventName, params);
}

export async function setRuntimeContext(
  properties: Record<string, string | null>,
) {
  if (!granted) return;
  await consentTask;
  const bundle = await loadNativeAnalytics();
  if (!bundle || !granted) return;
  await bundle.module.setUserProperties(bundle.analytics, properties);
}

export function isRuntimeAnalyticsConfigured() {
  return true;
}
