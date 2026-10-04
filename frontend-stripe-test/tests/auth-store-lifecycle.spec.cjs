const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const identity = (id, suffix = 'initial') => ({ token: 'TEST_access_' + id + '_' + suffix,
  refreshToken: 'TEST_refresh_' + id + '_' + suffix, user: { id, email: id + '@test.local', role: 'admin', preferredLocale: 'es' } });

function fixture() {
  const filename = path.resolve(__dirname, '../src/store/auth.store.ts');
  const compiled = new Module(filename, module); compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const events = []; const locale = new Map();
  const control = { disk: null, bridge: null, onSave: null, onRemove: null, onLoad: null, onApi: null, store: null };
  const api = (kind, route, body) => {
    const call = { kind, route, body, token: control.bridge?.getToken() || null };
    events.push(call);
    if (!control.onApi) throw new Error('UNEXPECTED_TEST_TRANSPORT:' + route);
    return control.onApi(call);
  };
  const replacements = {
    '../utils/webAuthCoordination': require('./helpers/load-typescript.cjs')('src/utils/webAuthCoordination.ts'),
    '@react-native-async-storage/async-storage': {
      getItem: async key => locale.get(key) || null,
      setItem: async (key, value) => { locale.set(key, value); },
      removeItem: async key => { locale.delete(key); },
    },
    '../config/api': { apiPost: (route, body) => api('public', route, body),
      apiAuthPost: (route, body) => api('authorized', route, body), apiAuthPatch: (route, body) => api('patch', route, body) },
    '../i18n': { detectAppLocale: () => 'es', normalizeAppLocale: value => ['es', 'en', 'fr'].includes(value) ? value : null },
    '../utils/allwainParticipation': { normalizeAllwainParticipation: value => value || { TEST: true } },
    '../utils/sessionStorage': {
      saveSession: async (key, refreshToken, data) => {
        const value = { refreshToken, data: structuredClone(data) }; events.push({ kind: 'save-start', value });
        if (control.onSave) await control.onSave(value);
        control.disk = value; events.push({ kind: 'save-end', value });
      },
      removeSession: async () => {
        events.push({ kind: 'remove-start' }); if (control.onRemove) await control.onRemove();
        control.disk = null; events.push({ kind: 'remove-end' });
      },
      loadSession: async () => {
        const captured = structuredClone(control.disk); events.push({ kind: 'load-start' });
        return control.onLoad ? control.onLoad(captured) : captured;
      },
    },
    './authSessionBridge': { registerAuthSessionBridge: value => { control.bridge = value; } },
    '../analytics': { trackAnalyticsEvent: async (name, values) => { events.push({ kind: 'analytics', name, values }); } },
  };
  const original = compiled.require.bind(compiled);
  compiled.require = name => Object.hasOwn(replacements, name) ? replacements[name] : original(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  control.store = compiled.exports.useAuthStore;
  const state = () => control.store.getState();
  const assertIdentity = value => {
    assert.equal(state().user?.id, value.user.id); assert.equal(state().token, value.token);
    assert.equal(state().refreshToken, value.refreshToken);
    assert.equal(control.disk?.data.user.id, value.user.id); assert.equal(control.disk?.refreshToken, value.refreshToken);
  };
  return { control, events, state, assertIdentity, store: control.store };
}

test('logout captures token A, clears memory immediately, and a pending refresh cannot repopulate it', async () => {
  const f = fixture(); const a = identity('A'); await f.state().setAuth(a);
  const refresh = deferred(); const logout = deferred();
  f.control.onApi = ({ route }) => route === '/auth/refresh' ? refresh.promise : logout.promise;
  const pending = f.state().refreshAccessToken(); const clearing = f.state().clearAuth('TEST signed out');
  assert.equal(f.state().user, null); assert.equal(f.state().token, null);
  assert.equal(f.events.find(event => event.route === '/auth/logout').token, a.token);
  refresh.resolve(identity('A', 'late')); assert.equal(await pending, null);
  logout.resolve({ ok: true }); await clearing;
  assert.equal(f.control.disk, null); assert.equal(f.state().user, null); assert.equal(f.state().sessionMessage, 'TEST signed out');
});

test('setAuth B supersedes a pending refresh A in both memory and persisted credentials', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const response = deferred();
  f.control.onApi = () => response.promise; const pending = f.state().refreshAccessToken();
  const b = identity('B'); await f.state().setAuth(b); response.resolve(identity('A', 'late'));
  assert.equal(await pending, null); f.assertIdentity(b);
});

test('a late logout completion cannot clear a newer identity B', async () => {
  const f = fixture(); const a = identity('A'); await f.state().setAuth(a); const response = deferred();
  f.control.onApi = () => response.promise; const clearing = f.state().clearAuth();
  const b = identity('B'); await f.state().setAuth(b); response.resolve({ ok: true }); await clearing;
  f.assertIdentity(b); assert.equal(f.events.find(event => event.route === '/auth/logout').token, a.token);
});

for (const failure of [false, true]) test('restore A ' + (failure ? 'failure' : 'success') + ' cannot overwrite or erase setAuth B', async () => {
  const f = fixture(); const a = identity('A'); f.control.disk = { refreshToken: a.refreshToken, data: { user: a.user, appMode: 'buy' } };
  const response = deferred(); const started = deferred();
  f.control.onApi = () => { started.resolve(); return response.promise; };
  const restore = f.state().restoreSession(); await started.promise;
  const b = identity('B'); await f.state().setAuth(b);
  if (failure) response.reject(new Error('TEST_OLD_RESTORE_FAILED')); else response.resolve(identity('A', 'restored'));
  await restore; f.assertIdentity(b); assert.equal(f.state().hydrated, true);
});

test('restore cannot reopen access after clearAuth while its refresh response is pending', async () => {
  const f = fixture(); const a = identity('A'); f.control.disk = { refreshToken: a.refreshToken, data: { user: a.user } };
  const response = deferred(); const started = deferred(); f.control.onApi = () => { started.resolve(); return response.promise; };
  const restore = f.state().restoreSession(); await started.promise; await f.state().clearAuth();
  response.resolve(identity('A', 'restored')); await restore;
  assert.equal(f.state().user, null); assert.equal(f.control.disk, null); assert.equal(f.state().hydrated, true);
});

test('legacy load migration is serialized before B and cannot leave the old profile on disk', async () => {
  const f = fixture(); const a = identity('A'); f.control.disk = { refreshToken: a.refreshToken, data: { user: a.user } };
  const release = deferred(); const entered = deferred();
  f.control.onLoad = async captured => { entered.resolve(); await release.promise; f.control.disk = captured; return captured; };
  const restore = f.state().restoreSession(); await entered.promise;
  const b = identity('B'); const settingB = f.state().setAuth(b); release.resolve();
  await Promise.all([restore, settingB]); f.assertIdentity(b);
  assert.equal(f.events.filter(event => event.kind === 'public').length, 0);
});

for (const action of ['clear', 'set-B']) test('a refresh A write already in progress finishes before ' + action + ' persistence', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const release = deferred(); const entered = deferred();
  f.control.onApi = async ({ route }) => route === '/auth/refresh' ? identity('A', 'refresh') : { ok: true };
  f.control.onSave = async value => { if (value.refreshToken.endsWith('_refresh')) { entered.resolve(); await release.promise; } };
  const refreshing = f.state().refreshAccessToken(); await entered.promise;
  const b = identity('B'); const changing = action === 'clear' ? f.state().clearAuth() : f.state().setAuth(b);
  if (action === 'clear') assert.equal(f.state().user, null);
  release.resolve(); await changing; assert.equal(await refreshing, null);
  if (action === 'clear') { assert.equal(f.control.disk, null); assert.equal(f.state().user, null); }
  else f.assertIdentity(b);
  const lastWrite = f.events.filter(event => ['save-end', 'remove-end'].includes(event.kind)).at(-1);
  assert.equal(lastWrite.kind, action === 'clear' ? 'remove-end' : 'save-end');
  if (action !== 'clear') assert.equal(lastWrite.value.data.user.id, 'B');
});

test('a pending credential removal completes before the next identity save', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); f.control.onApi = async () => ({ ok: true });
  const release = deferred(); const entered = deferred(); f.control.onRemove = async () => { entered.resolve(); await release.promise; };
  const clearing = f.state().clearAuth(); await entered.promise;
  const b = identity('B'); const setting = f.state().setAuth(b); release.resolve(); await Promise.all([clearing, setting]); f.assertIdentity(b);
});

test('setAuth A finishing late cannot overwrite a queued newer setAuth B', async () => {
  const f = fixture(); const release = deferred(); const entered = deferred();
  f.control.onSave = async value => { if (value.data.user.id === 'A') { entered.resolve(); await release.promise; } };
  const a = f.state().setAuth(identity('A')); await entered.promise;
  const b = identity('B'); const changing = f.state().setAuth(b); release.resolve(); await Promise.all([a, changing]); f.assertIdentity(b);
});

test('a new refresh rejects a response bound to a different identity', async () => {
  const f = fixture(); const a = identity('A'); await f.state().setAuth(a);
  f.control.onApi = async () => identity('B'); assert.equal(await f.state().refreshAccessToken(), null); f.assertIdentity(a);
});

test('only the newest concurrent refresh may publish its rotated credential', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const old = deferred(); const fresh = deferred(); let calls = 0;
  f.control.onApi = () => ++calls === 1 ? old.promise : fresh.promise;
  const first = f.state().refreshAccessToken(); const second = f.state().refreshAccessToken();
  const newest = identity('A', 'newest'); fresh.resolve(newest); assert.equal(await second, newest.token);
  old.resolve(identity('A', 'old')); assert.equal(await first, null); f.assertIdentity(newest);
});

test('an expired session cancels a refresh and removes credentials without another logout request', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const response = deferred(); f.control.onApi = () => response.promise;
  const pending = f.state().refreshAccessToken(); const expiry = f.control.bridge.expireSession('TEST expired');
  assert.equal(f.state().user, null); await expiry; response.resolve(identity('A', 'late')); assert.equal(await pending, null);
  assert.equal(f.control.disk, null); assert.equal(f.events.some(event => event.route === '/auth/logout'), false);
});

test('late profile locale synchronization from A cannot replace B or write A credentials', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const response = deferred(); const entered = deferred();
  f.control.onApi = () => { entered.resolve(); return response.promise; };
  const changingLocale = f.state().setLocale('fr'); await entered.promise;
  const b = identity('B'); await f.state().setAuth(b); response.resolve({ user: { ...identity('A').user, preferredLocale: 'fr' } });
  await changingLocale; f.assertIdentity(b); assert.equal(f.state().locale, 'es');
});

for (const method of ['login', 'loginWithGoogle', 'loginWithApple', 'register']) test('a superseded ' + method + ' response cannot publish A or emit its analytics event', async () => {
  const f = fixture(); const response = deferred(); f.control.onApi = () => response.promise;
  const pending = method === 'login' ? f.state().login('A@test.local', 'TEST_password') : method === 'loginWithGoogle'
    ? f.state().loginWithGoogle('TEST_google') : method === 'loginWithApple' ? f.state().loginWithApple('TEST_apple', 'TEST_nonce')
    : f.state().register('TEST A', 'A@test.local', 'TEST_password');
  const b = identity('B'); await f.state().setAuth(b); response.resolve(identity('A')); await pending;
  f.assertIdentity(b); assert.equal(f.events.some(event => event.kind === 'analytics'), false);
});

test('new authentication and refresh still work after logout invalidates older generations', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); f.control.onApi = async () => ({ ok: true }); await f.state().clearAuth();
  const b = identity('B'); await f.state().setAuth(b); const renewed = identity('B', 'new'); f.control.onApi = async () => renewed;
  assert.equal(await f.state().refreshAccessToken(), renewed.token); f.assertIdentity(renewed);
});

test('a storage failure does not break serialization of the following identity save', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); f.control.onApi = async () => ({ ok: true });
  f.control.onRemove = async () => { throw new Error('TEST_STORAGE_UNAVAILABLE'); };
  await assert.rejects(f.state().clearAuth(), /TEST_STORAGE_UNAVAILABLE/); assert.equal(f.state().user, null);
  f.control.onRemove = null; const b = identity('B'); await f.state().setAuth(b); f.assertIdentity(b);
});

test('a queued logout removal still erases A when the next identity B cannot be persisted', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const release = deferred(); const entered = deferred();
  f.control.onApi = async ({ route }) => route === '/auth/refresh' ? identity('A', 'refresh') : { ok: true };
  f.control.onSave = async value => {
    if (value.refreshToken.endsWith('_refresh')) { entered.resolve(); await release.promise; }
    if (value.data.user.id === 'B') throw new Error('TEST_B_SAVE_FAILED');
  };
  const refreshing = f.state().refreshAccessToken(); await entered.promise;
  const clearing = f.state().clearAuth(); const changing = f.state().setAuth(identity('B'));
  const failedSave = assert.rejects(changing, /TEST_B_SAVE_FAILED/);
  release.resolve(); await Promise.all([refreshing, clearing, failedSave]);
  assert.equal(f.state().user, null); assert.equal(f.state().token, null); assert.equal(f.control.disk, null);
});

test('a synchronous signed-out observer starting B cannot put logout removal after the B save', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); f.control.onApi = async () => ({ ok: true });
  const b = identity('B'); let settingB;
  const unsubscribe = f.store.subscribe(state => { if (state.user === null && !settingB) settingB = state.setAuth(b); });
  try { await f.state().clearAuth(); await settingB; f.assertIdentity(b); }
  finally { unsubscribe(); }
});

for (const action of ['mode', 'participation', 'locale', 'analytics']) test('a ' + action + ' change queued behind an in-flight refresh keeps the rotated credential and selected preference', async () => {
  const f = fixture(); await f.state().setAuth(identity('A'));
  const rotated = identity('A', 'rotated'); const release = deferred(); const entered = deferred();
  f.control.onApi = async ({ route }) => route === '/auth/refresh' ? rotated
    : { user: { ...rotated.user, preferredLocale: 'fr', analyticsConsent: true } };
  f.control.onSave = async value => { if (value.refreshToken === rotated.refreshToken) { entered.resolve(); await release.promise; } };
  const refreshing = f.state().refreshAccessToken(); await entered.promise;
  const participation = { seller: { status: 'active' }, connector: { status: 'inactive' } };
  const changing = action === 'mode' ? f.state().setAppMode('sell') : action === 'participation'
    ? f.state().setParticipation(participation) : action === 'locale' ? f.state().setLocale('fr') : f.state().setAnalyticsConsent(true);
  // The remote preference response arrives while the credential save is held.
  await Promise.resolve(); await Promise.resolve();
  release.resolve(); assert.equal(await refreshing, rotated.token); await changing;
  f.assertIdentity(rotated);
  if (action === 'mode') { assert.equal(f.state().appMode, 'sell'); assert.equal(f.control.disk.data.appMode, 'sell'); }
  if (action === 'participation') { assert.deepEqual(f.state().user.participation, participation); assert.deepEqual(f.control.disk.data.user.participation, participation); }
  if (action === 'locale') { assert.equal(f.state().locale, 'fr'); assert.equal(f.state().user.preferredLocale, 'fr'); assert.equal(f.control.disk.data.user.preferredLocale, 'fr'); }
  if (action === 'analytics') { assert.equal(f.state().user.analyticsConsent, true); assert.equal(f.control.disk.data.user.analyticsConsent, true); }
});

test('an offline locale choice survives a refresh already saving its older server profile', async () => {
  const f = fixture(); await f.state().setAuth(identity('A'));
  const rotated = identity('A', 'rotated'); rotated.user.role = 'buyer';
  const release = deferred(); const entered = deferred();
  f.control.onApi = async ({ route }) => {
    if (route === '/auth/refresh') return rotated;
    throw new Error('TEST_OFFLINE_PREFERENCES');
  };
  f.control.onSave = async value => { if (value.refreshToken === rotated.refreshToken) { entered.resolve(); await release.promise; } };
  const refreshing = f.state().refreshAccessToken(); await entered.promise;
  const changing = f.state().setLocale('fr'); release.resolve();
  assert.equal(await refreshing, rotated.token); await changing;
  f.assertIdentity(rotated); assert.equal(f.state().locale, 'fr'); assert.equal(f.state().user.preferredLocale, 'fr');
  assert.equal(f.control.disk.data.user.preferredLocale, 'fr'); assert.equal(f.state().user.role, 'buyer');
});

test('a profile operation queued during setAuth B cannot put the still-visible A credential behind B on disk', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const release = deferred(); const entered = deferred();
  const b = identity('B');
  f.control.onSave = async value => { if (value.data.user.id === 'B') { entered.resolve(); await release.promise; } };
  const setting = f.state().setAuth(b); await entered.promise;
  const changing = f.state().setParticipation({ TEST_A_ONLY: true }); release.resolve(); await Promise.all([setting, changing]);
  f.assertIdentity(b); assert.equal(f.control.disk.data.user.participation.TEST_A_ONLY, undefined);
});

test('the transport generation stays stable for refresh but changes for same-user re-login and logout', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const initial = f.control.bridge.getGeneration();
  f.control.onApi = async ({ route }) => route === '/auth/refresh' ? identity('A', 'refresh') : { ok: true };
  assert.equal(await f.state().refreshAccessToken(), identity('A', 'refresh').token);
  assert.equal(f.control.bridge.getGeneration(), initial);
  await f.state().setAuth(identity('A', 'new-login')); const renewed = f.control.bridge.getGeneration(); assert.ok(renewed > initial);
  await f.state().clearAuth(); assert.ok(f.control.bridge.getGeneration() > renewed);
});

for (const method of ['setAuth', 'login']) test(method + ' publication invalidates requests captured while A remained visible during the B transition', async () => {
  const f = fixture(); const a = identity('A'); const b = identity('B'); await f.state().setAuth(a);
  const release = deferred(); const entered = deferred();
  f.control.onApi = async () => b;
  f.control.onSave = async value => { if (value.data.user.id === 'B') { entered.resolve(); await release.promise; } };
  const initial = f.control.bridge.getGeneration();
  const changing = method === 'setAuth' ? f.state().setAuth(b) : f.state().login('B@test.local', 'TEST_password');
  await entered.promise;
  const captured = { generation: f.control.bridge.getGeneration(), token: f.control.bridge.getToken() };
  assert.equal(f.control.bridge.getIsTransitioning(), true);
  assert.ok(captured.generation > initial); assert.equal(captured.token, a.token);
  release.resolve(); await changing; f.assertIdentity(b);
  assert.equal(f.control.bridge.getIsTransitioning(), false);
  assert.ok(f.control.bridge.getGeneration() > captured.generation);
});

test('session restoration changes the published generation before exposing its identity', async () => {
  const f = fixture(); const a = identity('A'); f.control.disk = { refreshToken: a.refreshToken, data: { user: a.user, appMode: 'buy' } };
  const release = deferred(); const entered = deferred(); f.control.onApi = () => { entered.resolve(); return release.promise; };
  const restoring = f.state().restoreSession(); await entered.promise; const captured = f.control.bridge.getGeneration();
  assert.equal(f.control.bridge.getIsTransitioning(), true);
  release.resolve(identity('A', 'restored')); await restoring;
  f.assertIdentity(identity('A', 'restored')); assert.ok(f.control.bridge.getGeneration() > captured);
  assert.equal(f.control.bridge.getIsTransitioning(), false);
});

for (const method of ['login', 'loginWithGoogle', 'loginWithApple', 'register']) test('failed ' + method + ' releases its transition without permanently blocking the previous session', async () => {
  const f = fixture(); const a = identity('A'); await f.state().setAuth(a); const failure = deferred(); f.control.onApi = () => failure.promise;
  const operation = method === 'login' ? f.state().login('B@test.local', 'TEST_password') : method === 'loginWithGoogle'
    ? f.state().loginWithGoogle('TEST_google') : method === 'loginWithApple' ? f.state().loginWithApple('TEST_apple', 'TEST_nonce')
    : f.state().register('TEST B', 'B@test.local', 'TEST_password');
  const rejection = assert.rejects(operation, /TEST_AUTH_FAILED/);
  assert.equal(f.control.bridge.getIsTransitioning(), true); assert.equal(await f.state().refreshAccessToken(), null);
  failure.reject(new Error('TEST_AUTH_FAILED')); await rejection;
  assert.equal(f.control.bridge.getIsTransitioning(), false); f.assertIdentity(a);
  f.control.onApi = async () => identity('A', 'new'); assert.equal(await f.state().refreshAccessToken(), identity('A', 'new').token);
});

test('failed setAuth persistence releases its transition and leaves the previous identity usable', async () => {
  const f = fixture(); const a = identity('A'); await f.state().setAuth(a); const failure = deferred(); const entered = deferred();
  f.control.onSave = async () => { entered.resolve(); await failure.promise; };
  const operation = f.state().setAuth(identity('B')); const rejection = assert.rejects(operation, /TEST_SAVE_FAILED/); await entered.promise;
  assert.equal(f.control.bridge.getIsTransitioning(), true); failure.reject(new Error('TEST_SAVE_FAILED')); await rejection;
  assert.equal(f.control.bridge.getIsTransitioning(), false); f.assertIdentity(a);
});

test('failed restoration releases its transition and permits a later successful login', async () => {
  const f = fixture(); const failure = deferred(); const entered = deferred(); f.control.onApi = () => { entered.resolve(); return failure.promise; };
  const operation = f.state().restoreSession(); await entered.promise; assert.equal(f.control.bridge.getIsTransitioning(), true);
  failure.reject(new Error('TEST_RESTORE_FAILED')); await operation;
  assert.equal(f.control.bridge.getIsTransitioning(), false); assert.equal(f.state().hydrated, true); assert.equal(f.state().user, null);
  f.control.onApi = async () => identity('B'); await f.state().login('B@test.local', 'TEST_password'); f.assertIdentity(identity('B'));
});

test('an older failed login cannot release the newer identity transition while its save is pending', async () => {
  const f = fixture(); await f.state().setAuth(identity('A')); const oldFailure = deferred(); f.control.onApi = () => oldFailure.promise;
  const previous = f.state().login('OLD@test.local', 'TEST_password'); const rejection = assert.rejects(previous, /TEST_OLD_FAILED/);
  const release = deferred(); const entered = deferred(); f.control.onSave = async () => { entered.resolve(); await release.promise; };
  const next = f.state().setAuth(identity('B')); await entered.promise; oldFailure.reject(new Error('TEST_OLD_FAILED')); await rejection;
  assert.equal(f.control.bridge.getIsTransitioning(), true); release.resolve(); await next;
  assert.equal(f.control.bridge.getIsTransitioning(), false); f.assertIdentity(identity('B'));
});

test('automatic restore does not start another refresh while explicit initial login owns the transition', async () => {
  const f = fixture(); const release = deferred(); f.control.onApi = () => release.promise;
  const login = f.state().login('B@test.local', 'TEST_password'); await f.state().restoreSession();
  assert.equal(f.events.filter(event => event.kind === 'public').length, 1); assert.equal(f.control.bridge.getIsTransitioning(), true);
  release.resolve(identity('B')); await login; f.assertIdentity(identity('B')); assert.equal(f.state().hydrated, true);
});
