export type RuntimeAnalyticsParams = Record<string, string | number | boolean>;

export async function configureRuntimeConsent(_granted: boolean) {}

export async function trackRuntimeScreen(_screenName: string) {}

export async function trackRuntimeEvent(
  _eventName: string,
  _params: RuntimeAnalyticsParams,
) {}

export async function setRuntimeContext(
  _properties: Record<string, string | null>,
) {}

export function isRuntimeAnalyticsConfigured() {
  return false;
}
