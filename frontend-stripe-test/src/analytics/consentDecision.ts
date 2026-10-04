export type ConsentState = "unknown" | "granted" | "denied";

export function resolveAnalyticsConsent(local: ConsentState, remote: boolean | null | undefined): ConsentState {
  // An account preference cannot grant consent on a device that has not agreed.
  if (local === "denied" || remote === false) return "denied";
  return local;
}

export async function applyAnalyticsConsentDecision(
  granted: boolean,
  effects: {
    configure: (granted: boolean) => Promise<void>;
    store: (state: ConsentState) => Promise<void>;
    sync?: () => Promise<void>;
    current?: () => boolean;
  },
) {
  try {
    // Stop collection immediately; a failed write must never enable tracking.
    await effects.configure(false);
    if (effects.current && !effects.current()) throw new Error("ANALYTICS_CONSENT_SUPERSEDED");
    await effects.store(granted ? "granted" : "denied");
    if (effects.current && !effects.current()) throw new Error("ANALYTICS_CONSENT_SUPERSEDED");
    await effects.sync?.();
    if (effects.current && !effects.current()) throw new Error("ANALYTICS_CONSENT_SUPERSEDED");
    if (granted) await effects.configure(true);
  } catch (error) {
    await effects.configure(false).catch(() => {});
    await effects.store("denied").catch(() => {});
    throw error;
  }
}
