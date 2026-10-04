import publicConfig from "../../public/analytics-config.json";

export type AnalyticsBuildEnvironment = "test" | "live";
export type AnalyticsPlatform = "web" | "android" | "ios" | "native_unknown";
export type AnalyticsPaymentEnvironment = "test" | "live" | "unknown";

// Expo replaces explicit public accesses at compilation. Never read secrets or
// infer live from a hostname. An explicit invalid value fails closed.
const environment = String(process.env.EXPO_PUBLIC_ANALYTICS_BUILD_ENVIRONMENT || "test").trim();
const explicitMeasurementId = String(process.env.EXPO_PUBLIC_GA_MEASUREMENT_ID || "").trim();
const candidate = publicConfig as { measurementId?: unknown; appMeasurementId?: unknown };
const publicAppMeasurementId = typeof candidate.appMeasurementId === "string" ? candidate.appMeasurementId.trim() : "";
const measurementId = explicitMeasurementId || publicAppMeasurementId;
const validEnvironment = environment === "test" || environment === "live";
const validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId);

export const analyticsBuildConfig = Object.freeze({
  buildEnvironment: (validEnvironment ? environment : "test") as AnalyticsBuildEnvironment,
  validEnvironment,
  webMeasurementId: validMeasurementId ? measurementId : "",
  webConfigured: validEnvironment && validMeasurementId,
  webConfigurationSource: explicitMeasurementId ? "compilation" : publicAppMeasurementId ? "public_app_config" : "missing",
  informationalWebMeasurementId: typeof candidate.measurementId === "string" ? candidate.measurementId : null,
  nativeConfigurationSource: "existing_firebase_native_distribution",
});

export function analyticsEnvironmentParams(platform: AnalyticsPlatform, paymentEnvironment: AnalyticsPaymentEnvironment = "unknown") {
  return { app_platform: platform, source_platform: platform, app_surface: "app", build_environment: analyticsBuildConfig.buildEnvironment,
    payment_environment: paymentEnvironment, ...(analyticsBuildConfig.buildEnvironment === "test" ? { debug_mode: true } : {}) };
}
