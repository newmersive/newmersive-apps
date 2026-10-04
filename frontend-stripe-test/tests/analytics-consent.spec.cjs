const assert = require('node:assert/strict');
const { it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, replacements = {}) {
  const source = path.resolve(__dirname, relative); const compiled = new Module(source, module);
  compiled.filename = source; compiled.paths = Module._nodeModulePaths(path.dirname(source));
  const originalRequire = compiled.require.bind(compiled);
  compiled.require = name => Object.hasOwn(replacements, name) ? replacements[name] : originalRequire(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, source);
  return compiled.exports;
}
const { resolveAnalyticsConsent, applyAnalyticsConsentDecision } = load('../src/analytics/consentDecision.ts');

it('never lets an old account grant override a device refusal or missing consent', () => {
  assert.equal(resolveAnalyticsConsent('denied', true), 'denied');
  assert.equal(resolveAnalyticsConsent('unknown', true), 'unknown');
  assert.equal(resolveAnalyticsConsent('granted', false), 'denied');
  assert.equal(resolveAnalyticsConsent('granted', undefined), 'granted');
});
it('disables tracking before persisting refusal even when storage fails', async () => {
  const calls = [];
  await assert.rejects(() => applyAnalyticsConsentDecision(false, {
    configure: async value => { calls.push(['configure', value]); },
    store: async value => { calls.push(['store', value]); throw new Error('storage'); },
  }), /storage/);
  assert.deepEqual(calls[0], ['configure', false]); assert.ok(calls.every(([name,value]) => name !== 'configure' || !value));
});
it('does not enable tracking when a grant cannot be persisted', async () => {
  const calls = [];
  await assert.rejects(() => applyAnalyticsConsentDecision(true, {
    configure: async value => { calls.push(value); }, store: async () => { throw new Error('storage'); },
  }), /storage/);
  assert.deepEqual(calls, [false, false]);
});
it('reverts a stored grant when account synchronization fails', async () => {
  const stored = []; const configured = [];
  await assert.rejects(() => applyAnalyticsConsentDecision(true, {
    configure: async value => { configured.push(value); }, store: async value => { stored.push(value); },
    sync: async () => { throw new Error('offline'); },
  }), /offline/);
  assert.deepEqual(stored, ['granted', 'denied']); assert.deepEqual(configured, [false, false]);
});
it('enables tracking only after the explicit choice is saved and synchronized', async () => {
  const calls = [];
  await applyAnalyticsConsentDecision(true, {
    configure: async value => { calls.push(`configure:${value}`); }, store: async value => { calls.push(`store:${value}`); },
    sync: async () => { calls.push('sync'); },
  });
  assert.deepEqual(calls, ['configure:false', 'store:granted', 'sync', 'configure:true']);
});

function nativeFixture(setConsent = async () => {}) {
  const calls = []; let imports = 0;
  const sdk = { getAnalytics: () => { imports++; return {}; }, setConsent,
    setAnalyticsCollectionEnabled: async (_, value) => { calls.push(['enabled', value]); },
    resetAnalyticsData: async () => { calls.push(['reset']); },
    logEvent: async () => { calls.push(['event']); }, logScreenView: async () => { calls.push(['screen']); },
    setUserProperties: async () => { calls.push(['context']); } };
  const runtime = load('../src/analytics/analyticsRuntime.native.ts', { '@react-native-firebase/analytics': sdk });
  return { runtime, calls, imports: () => imports };
}
it('never initializes native Firebase for an undecided or denied user', async () => {
  const f = nativeFixture(); await f.runtime.configureRuntimeConsent(false);
  await f.runtime.trackRuntimeEvent('login', {}); assert.equal(f.imports(), 0); assert.deepEqual(f.calls, []);
});
it('a revocation wins over pending native initialization and queued events', async () => {
  let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = nativeFixture(async (_, value) => { if (value.analytics_storage) { entered(); await gate; } });
  const grant = f.runtime.configureRuntimeConsent(true); await started;
  const event = f.runtime.trackRuntimeEvent('login', {});
  const revoke = f.runtime.configureRuntimeConsent(false); release();
  await Promise.all([grant, revoke, event]);
  assert.deepEqual(f.calls, [['enabled', false], ['reset']]);
});
