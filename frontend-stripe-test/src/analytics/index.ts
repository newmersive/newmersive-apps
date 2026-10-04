import { configureRuntimeConsent, isRuntimeAnalyticsConfigured, setRuntimeContext, trackRuntimeEvent, trackRuntimeScreen } from "./analyticsRuntime";
import { analyticsGuardCurrent, sanitizeAnalyticsContext, sanitizeAnalyticsEvent, sanitizeAnalyticsScreen, type AnalyticsEventMap } from "./analyticsPolicy";
import { captureAuthSession } from "../store/authSessionBridge";
export type { AnalyticsEventMap } from "./analyticsPolicy";
export { analyticsBuildConfig } from "./analyticsConfig";

export const ANALYTICS_CONSENT_VERSION = "allwain-analytics-v1-2026-09-06";
export type AnalyticsConsentState = "unknown" | "granted" | "denied";
let granted = false;
let revision = 0;
let configuredRevision = -1;
type ScreenRequest = { name: string; actorCurrent: () => boolean; dispatching: boolean };
type ContextRequest = { properties: Record<string, string | null>; actorCurrent: () => boolean; dispatching: boolean };
let currentScreen: ScreenRequest | null = null;
let currentContext: ContextRequest | null = null;

export function getAnalyticsConsentSnapshot() {
  const captured = revision;
  const operational = granted && configuredRevision === captured;
  return { granted: operational, revision: captured, isCurrent: () => granted && captured === revision && configuredRevision === captured };
}
export async function configureAnalyticsConsent(nextGranted: boolean) {
  granted = nextGranted === true;
  configuredRevision = -1;
  if (!granted) { currentScreen = null; currentContext = null; }
  const currentRevision = ++revision;
  try { await configureRuntimeConsent(granted); }
  catch { if (currentRevision === revision) { granted = false; ++revision; } return; }
  if (!granted || currentRevision !== revision) return;
  configuredRevision = currentRevision;
  // Navigation announces the current screen in child effects before the provider
  // completes consent configuration. Keep only that enum/context, never actions,
  // and dispatch it once after configuration if its actor is still current.
  const context = currentContext;
  if (context && !context.dispatching && context.actorCurrent()) {
    context.dispatching = true;
    try { await setRuntimeContext(context.properties, () => granted && revision === currentRevision && configuredRevision === currentRevision && currentContext === context && context.actorCurrent()); } catch { /* Optional telemetry. */ }
  }
  const screen = currentScreen;
  if (screen && !screen.dispatching && screen.actorCurrent()) {
    screen.dispatching = true;
    try { await trackRuntimeScreen(screen.name, () => granted && revision === currentRevision && configuredRevision === currentRevision && currentScreen === screen && screen.actorCurrent()); } catch { /* Optional telemetry. */ }
  }
}
function actorGuard(current?: () => boolean) {
  const session = captureAuthSession();
  return () => {
    const next = captureAuthSession();
    const actorCurrent = session.owner === next.owner && session.generation === next.generation &&
      (session.token ? session.isCurrent() : !next.token && !next.owner?.getIsTransitioning());
    return actorCurrent && analyticsGuardCurrent(current);
  };
}
function trackingGuard(current?: () => boolean) {
  const consent = getAnalyticsConsentSnapshot(), actorCurrent = actorGuard(current);
  return () => consent.granted && consent.isCurrent() && actorCurrent();
}
/** true means accepted by the local SDK/queue, not confirmed network delivery. */
export async function trackAnalyticsScreen(screenName: string, current?: () => boolean): Promise<boolean> {
  try {
    const name = sanitizeAnalyticsScreen(screenName), actorCurrent = actorGuard(current);
    if (!name || !actorCurrent()) return false;
    const request = {name, actorCurrent, dispatching: false}; currentScreen = request;
    const valid = trackingGuard(current);
    if (!valid()) return false;
    request.dispatching = true;
    return await trackRuntimeScreen(name, () => currentScreen === request && valid());
  } catch { return false; }
}
export async function trackAnalyticsEvent<Name extends keyof AnalyticsEventMap>(name: Name, params: AnalyticsEventMap[Name], current?: () => boolean): Promise<boolean> {
  try { const safe = sanitizeAnalyticsEvent(name, params), valid = trackingGuard(current);
    return safe && valid() ? await trackRuntimeEvent(name, safe, valid) : false; } catch { return false; }
}
export async function setAnalyticsContext(input: { appMode?: string | null; locale?: string | null }, current?: () => boolean): Promise<boolean> {
  try {
    const actorCurrent = actorGuard(current), properties = sanitizeAnalyticsContext({ app_mode: input.appMode, app_locale: input.locale });
    if (!actorCurrent()) return false;
    const request = {properties, actorCurrent, dispatching: false}; currentContext = request;
    const valid = trackingGuard(current);
    if (!valid()) return false;
    request.dispatching = true;
    return await setRuntimeContext(properties, () => currentContext === request && valid());
  } catch { return false; }
}
export { isRuntimeAnalyticsConfigured as isAnalyticsConfigured };
