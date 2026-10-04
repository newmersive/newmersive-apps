// Other feature suites intentionally isolate telemetry. The instrumentation suite
// replaces this exact import with the real source helper and an isolated SDK/store.
module.exports = {
  captureAnalyticsGuard: current => current,
  createDiscoveryAnalyticsState: () => new Map(),
  observeConfirmedPurchases: async () => {},
  recordAppliedFilters: async () => {},
  recordDiscoveryResults: async () => {},
  recordPublicationWithdrawal: async () => {},
};
