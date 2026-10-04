export type RuntimeAnalyticsParams = Record<string, string | number | boolean>;
export async function configureRuntimeConsent(_granted: boolean) {}
export async function trackRuntimeScreen(_screenName: string, _current?: () => boolean): Promise<boolean> { return false; }
export async function trackRuntimeEvent(_eventName: string, _params: RuntimeAnalyticsParams, _current?: () => boolean): Promise<boolean> { return false; }
export async function setRuntimeContext(_properties: Record<string, string | null>, _current?: () => boolean): Promise<boolean> { return false; }
export function isRuntimeAnalyticsConfigured() { return false; }
