const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('./helpers/load-typescript.cjs');
const { createWebAuthCoordination } = load('src/utils/webAuthCoordination.ts');

function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const identity = (id, suffix = 'initial') => ({ token: 'TEST_access_' + id + '_' + suffix,
  refreshToken: null, user: { id, email: id + '@test.invalid', role: 'admin', preferredLocale: 'es' } });
function origin() {
  let epoch = null; let sequence = 0; let tail = Promise.resolve();
  const tabs = []; const signals = []; const disk = { value: null }; const values = new Map();
  const lock = work => {
    const pending = tail.catch(() => undefined).then(work); tail = pending.catch(() => undefined); return pending;
  };
  function tab() {
    const state = { missed: false, noStorage: false, writeFails: false, wake: null, removals: 0, saves: [], api: [], onApi: null, onSave: null, onLoad: null };
    const coordinator = createWebAuthCoordination({
      read: () => { state.onRead?.(); if (state.noStorage) throw new Error('TEST_STORAGE_UNAVAILABLE'); return epoch; },
      write: value => { if (state.noStorage || state.writeFails) throw new Error('TEST_STORAGE_UNAVAILABLE'); epoch = value; },
      random: () => 'TEST_epoch_' + String(++sequence).padStart(24, '0'),
      post: value => { signals.push(value); for (const peer of tabs) if (peer !== state && !peer.missed) peer.wake(value); },
      listen: wake => { state.wake = wake; return () => { state.wake = () => {}; }; }, lock,
    });
    state.coordinator = coordinator; tabs.push(state); return state;
  }
  function store(state, realApi = null) {
    const bridge = load('src/store/authSessionBridge.ts');
    const call = (route, body) => { state.api.push({ route, body }); return state.onApi ? state.onApi(route, body) : Promise.resolve({ ok: true }); };
    const api = realApi ? load('src/config/api.ts', { '../store/authSessionBridge': bridge,
      '../store/adminMfaBridge': { requireAdminMfa: () => { state.mfa = (state.mfa || 0) + 1; } },
      '../utils/webAuthCoordination': { webAuthCoordination: state.coordinator } })
      : { apiPost: call, apiAuthPost: call, apiAuthPatch: call };
    const auth = load('src/store/auth.store.ts', {
      '../config/api': api, './authSessionBridge': bridge,
      '../utils/webAuthCoordination': { webAuthCoordination: state.coordinator },
      '@react-native-async-storage/async-storage': { getItem: async key => values.get(key) || null,
        setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } },
      '../i18n': { detectAppLocale: () => 'es', normalizeAppLocale: value => ['es', 'en', 'fr'].includes(value) ? value : null },
      '../utils/allwainParticipation': { normalizeAllwainParticipation: value => value || { TEST: true } },
      '../utils/sessionStorage': {
        saveSession: async (_key, refreshToken, data) => {
          if (state.onSave) await state.onSave(data);
          disk.value = structuredClone({ refreshToken, data }); state.saves.push(disk.value);
        },
        removeSession: async () => { state.removals++; disk.value = null; },
        loadSession: async () => state.onLoad ? state.onLoad() : structuredClone(disk.value),
      },
      '../analytics': { trackAnalyticsEvent: async () => undefined },
    }).useAuthStore;
    return Object.assign(state, { auth, get: () => auth.getState(), bridge, transport: api });
  }
  return { tab, store, signals, disk, getEpoch: () => epoch, setEpoch: value => { epoch = value; }, lock };
}

test('only opaque random epochs are sent and own announce does not invalidate its session', () => {
  const o = origin(); const a = o.tab(); const b = o.tab(); let own = 0; let peer = 0;
  a.coordinator.subscribe(() => own++); b.coordinator.subscribe(() => peer++);
  a.coordinator.announce(); assert.equal(own, 0); assert.equal(peer, 1);
  assert.deepEqual(o.signals, [o.getEpoch()]); assert.match(o.signals[0], /^TEST_epoch_\d{24}$/);
  assert.equal(JSON.stringify(o.signals).includes('@'), false);
});

test('missed channel and storage events are recovered by persisted epoch on resume', () => {
  const o = origin(); const a = o.tab(); const b = o.tab(); let invalidations = 0;
  a.coordinator.subscribe(() => invalidations++); a.missed = true;
  b.coordinator.announce(); assert.equal(invalidations, 0); a.wake(); assert.equal(invalidations, 1);
  a.wake(); assert.equal(invalidations, 1);
});

test('late old signals cannot roll back a newer local epoch or invalidate it again', () => {
  const o = origin(); const a = o.tab(); const b = o.tab(); b.coordinator.announce(); const old = o.getEpoch();
  a.coordinator.announce(); const current = o.getEpoch(); let invalidations = 0; a.coordinator.subscribe(() => invalidations++);
  a.wake(old); assert.equal(o.getEpoch(), current); assert.equal(invalidations, 0);
});

test('persisted epoch removal invalidates a current tab, even without a channel payload', () => {
  const o = origin(); const a = o.tab(); a.coordinator.announce(); const current = a.coordinator.capture();
  o.setEpoch(null); assert.equal(current(), false);
});

test('unavailable peer reads fall back to channel invalidation and suppress duplicate epochs', () => {
  const o = origin(); const a = o.tab(); const b = o.tab(); a.noStorage = true;
  let invalidations = 0; a.coordinator.subscribe(() => invalidations++);
  b.coordinator.announce(); a.wake(o.signals[0]); a.wake({ token: 'TEST_NEVER_ACCEPT' });
  assert.equal(invalidations, 1);
});

test('epoch write quota failure prevents a new identity request even if profile writes still work', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A'));
  const b = o.store(o.tab()); b.writeFails = true; b.onApi = async () => identity('B');
  await assert.rejects(b.get().login('B@test.invalid', 'TEST_PASSWORD'), /almacenamiento/);
  assert.equal(b.api.length, 0); assert.equal(b.bridge.captureAuthSession().isCurrent(), false);
  assert.equal(a.get().user.id, 'A'); assert.equal(o.disk.value.data.user.id, 'A');
  b.writeFails = false; await b.get().login('B@test.invalid', 'TEST_PASSWORD'); assert.equal(b.get().user.id, 'B');
});

test('logout with unavailable epoch storage clears only local memory and reports unconfirmed server revocation', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A')); a.writeFails = true;
  await a.get().clearAuth(); assert.equal(a.get().user, null); assert.equal(a.api.length, 0); assert.equal(a.removals, 0);
  assert.match(a.get().sessionMessage, /no se ha podido confirmar/); assert.equal(o.disk.value.data.user.id, 'A');
});

test('same-tab changes retain remote cookie fence but remote changes invalidate it', () => {
  const o = origin(); const a = o.tab(); const b = o.tab(); const remote = a.coordinator.captureRemote();
  const identityFence = a.coordinator.capture(); a.coordinator.announce();
  assert.equal(remote(), true); assert.equal(identityFence(), false);
  b.coordinator.announce(); assert.equal(remote(), false);
});

test('native no-op preserves generations without storage, locks or signals', async () => {
  const native = createWebAuthCoordination(null); const current = native.capture(); const remote = native.captureRemote();
  native.announce(); assert.equal(current(), true); assert.equal(remote(), true);
  assert.equal(await native.withProfileLock(async () => 'TEST_NATIVE'), 'TEST_NATIVE');
});

test('a peer explicit login clears memory and snapshots without logout, profile deletion, or auto-restore', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A'));
  const captured = a.bridge.captureAuthSession(); const b = o.store(o.tab());
  await b.get().setAuth(identity('B'));
  assert.equal(a.get().user, null); assert.equal(a.get().token, null); assert.equal(a.get().hydrated, true);
  assert.equal(captured.isCurrent(), false); assert.equal(a.removals, 0); assert.equal(a.api.length, 0);
  await a.get().restoreSession(); assert.equal(a.api.length, 0); assert.equal(o.disk.value.data.user.id, 'B');
  assert.match(a.get().sessionMessage, /otra pestana/);
});

test('ordinary peer refresh and automatic restoration do not broadcast or clear the first tab', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A')); const signalCount = o.signals.length;
  const b = o.store(o.tab()); b.onApi = async () => identity('A', 'restored'); await b.get().restoreSession();
  b.onApi = async () => identity('A', 'rotated'); await b.get().refreshAccessToken();
  assert.equal(a.get().user.id, 'A'); assert.equal(o.signals.length, signalCount);
});

test('explicit logout in one tab clears the peer and only the initiating tab requests logout', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A'));
  const b = o.store(o.tab()); b.onApi = async route => route === '/auth/refresh' ? identity('A') : { ok: true };
  await b.get().restoreSession(); await b.get().clearAuth();
  assert.equal(a.get().user, null); assert.equal(a.api.length, 0); assert.equal(a.removals, 0);
  assert.equal(b.api.filter(call => call.route === '/auth/logout').length, 1); assert.equal(o.disk.value, null);
});

for (const missed of [false, true]) test('a stale logout handler cannot retire peer B after ' + (missed ? 'missed' : 'delivered') + ' identity events', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A')); const staleLogout = a.get().clearAuth;
  a.missed = missed; const b = o.store(o.tab()); await b.get().setAuth(identity('B'));
  const signals = o.signals.length; const epoch = o.getEpoch(); await staleLogout();
  assert.equal(a.get().user, null); assert.equal(a.removals, 0); assert.equal(a.api.length, 0);
  assert.equal(o.disk.value.data.user.id, 'B'); assert.equal(b.get().user.id, 'B');
  assert.equal(o.signals.length, signals); assert.equal(o.getEpoch(), epoch);
});

test('logout still cancels this tab pending initial login without reopening its identity', async () => {
  const o = origin(); const a = o.store(o.tab()); const held = deferred(); a.onApi = () => held.promise;
  const pending = a.get().login('A@test.invalid', 'TEST_PASSWORD'); await a.get().clearAuth();
  held.resolve(identity('A')); await pending; assert.equal(a.get().user, null); assert.equal(o.disk.value, null);
});

test('logout in an unowned web tab cannot invalidate a peer session', async () => {
  const o = origin(); const b = o.store(o.tab()); await b.get().setAuth(identity('B')); const a = o.store(o.tab());
  const epoch = o.getEpoch(); await a.get().clearAuth();
  assert.equal(o.disk.value.data.user.id, 'B'); assert.equal(b.get().user.id, 'B'); assert.equal(o.getEpoch(), epoch);
  assert.equal(a.removals, 0); assert.equal(a.api.length, 0);
});

test('a peer transition discovered after logout announcement cannot be adopted as its deletion generation', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A')); a.missed = true;
  const b = o.store(o.tab()); let reads = 0; let publishing;
  a.onRead = () => { if (++reads === 2) publishing = b.get().setAuth(identity('B')); };
  await a.get().clearAuth(); await publishing;
  assert.ok(publishing); assert.equal(a.get().user, null); assert.equal(a.api.length, 0); assert.equal(a.removals, 0);
  assert.equal(b.get().user.id, 'B'); assert.equal(o.disk.value.data.user.id, 'B');
});

test('pending peer refresh response cannot reopen access or overwrite the new profile', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A')); const held = deferred();
  a.onApi = () => held.promise; const refreshing = a.get().refreshAccessToken();
  const b = o.store(o.tab()); await b.get().setAuth(identity('B'));
  held.resolve(identity('A', 'late')); assert.equal(await refreshing, null);
  assert.equal(a.get().user, null); assert.equal(o.disk.value.data.user.id, 'B'); assert.equal(a.removals, 0);
});

for (const failure of [false, true]) test('pending peer restore ' + (failure ? 'failure' : 'success') + ' cannot delete or replace the new profile', async () => {
  const o = origin(); const a = o.store(o.tab()); const held = deferred(); const entered = deferred();
  a.onApi = () => { entered.resolve(); return held.promise; }; const restoring = a.get().restoreSession(); await entered.promise;
  const b = o.store(o.tab()); await b.get().setAuth(identity('B'));
  if (failure) held.reject(new Error('TEST_RESTORE_FAILED')); else held.resolve(identity('A', 'late'));
  await restoring; assert.equal(a.get().user, null); assert.equal(a.removals, 0); assert.equal(o.disk.value.data.user.id, 'B');
});

test('pending peer login cannot publish its older identity after another tab wins', async () => {
  const o = origin(); const a = o.store(o.tab()); const held = deferred(); a.onApi = () => held.promise;
  const logging = a.get().login('A@test.invalid', 'TEST_PASSWORD'); const b = o.store(o.tab());
  await b.get().setAuth(identity('B')); held.resolve(identity('A'));
  await logging; assert.equal(a.get().user, null); assert.equal(o.disk.value.data.user.id, 'B');
});

test('missed events invalidate pending snapshots and profiles at the next guarded operation', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A')); const captured = a.bridge.captureAuthSession();
  a.missed = true; const b = o.store(o.tab()); await b.get().setAuth(identity('B'));
  assert.equal(a.get().user.id, 'A'); assert.equal(captured.isCurrent(), false);
  assert.equal(a.get().user, null); assert.equal(a.removals, 0); assert.equal(o.disk.value.data.user.id, 'B');
});

test('an in-flight profile write is a cross-tab barrier before the new identity is saved', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A'));
  const held = deferred(); const entered = deferred(); a.onSave = async () => { entered.resolve(); await held.promise; };
  const saving = a.get().setAppMode('sell'); await entered.promise;
  const b = o.store(o.tab()); const logging = b.get().setAuth(identity('B'));
  assert.equal(a.get().user, null); assert.equal(b.get().user, null); held.resolve(); await Promise.all([saving, logging]);
  assert.equal(o.disk.value.data.user.id, 'B'); assert.equal(b.get().user.id, 'B');
});

test('an old queued removal cannot delete a new peer profile after storage lock contention', async () => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A'));
  const held = deferred(); const entered = deferred(); const blocking = o.lock(async () => { entered.resolve(); await held.promise; }); await entered.promise;
  const clearing = a.get().clearAuth(); const b = o.store(o.tab()); const logging = b.get().setAuth(identity('B'));
  held.resolve(); await Promise.all([blocking, clearing, logging]);
  assert.equal(a.removals, 0); assert.equal(o.disk.value.data.user.id, 'B');
});

test('legacy profile migration already in progress finishes before the next peer publication', async () => {
  const o = origin(); const a = o.store(o.tab()); const held = deferred(); const entered = deferred();
  a.onLoad = async () => { entered.resolve(); await held.promise; o.disk.value = { data: { user: identity('A').user } }; return o.disk.value; };
  const restoring = a.get().restoreSession(); await entered.promise;
  const b = o.store(o.tab()); const logging = b.get().setAuth(identity('B')); held.resolve();
  await Promise.all([restoring, logging]); assert.equal(a.api.length, 0); assert.equal(o.disk.value.data.user.id, 'B');
});

for (const route of ['/auth/logout', '/auth/logout-all', '/auth/sessions/TEST_OLD']) test('remote epoch retires queued cookie revocation ' + route + ' before dispatch', { timeout: 3000 }, async t => {
  const o = origin(); const a = o.store(o.tab(), true); await a.get().setAuth(identity('A'));
  const held = deferred(); const entered = deferred(); const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    requests.push({ path: new URL(input).pathname, method: init.method });
    entered.resolve(); await held.promise; return { status: 200, ok: true, json: async () => identity('A', 'rotated') };
  });
  const blocked = a.transport.apiPost('/auth/refresh', {}); const stale = assert.rejects(blocked, /SESSION_CHANGED/); await entered.promise;
  const old = route.includes('/sessions/') ? a.transport.apiAuthDelete(route) : a.transport.apiAuthPost(route, {});
  const canceled = assert.rejects(old, /SESSION_CHANGED/); const b = o.store(o.tab()); await b.get().setAuth(identity('B'));
  held.resolve(); await Promise.all([stale, canceled]); assert.equal(requests.length, 1); assert.equal(o.disk.value.data.user.id, 'B');
});

test('queued public login is rejected after remote identity change without changing its cookie', { timeout: 3000 }, async t => {
  const o = origin(); const a = o.store(o.tab(), true); await a.get().setAuth(identity('A')); const held = deferred(); const entered = deferred();
  const requests = []; t.mock.method(globalThis, 'fetch', async input => { requests.push(input); entered.resolve(); await held.promise;
    return { status: 200, ok: true, json: async () => identity('A', 'rotated') }; });
  const first = assert.rejects(a.transport.apiPost('/auth/refresh', {}), /SESSION_CHANGED/); await entered.promise;
  const login = assert.rejects(a.get().login('A@test.invalid', 'TEST_PASSWORD'), /SESSION_CHANGED/);
  const b = o.store(o.tab()); await b.get().setAuth(identity('B')); held.resolve();
  await Promise.all([first, login]); assert.equal(requests.length, 1); assert.equal(o.disk.value.data.user.id, 'B');
});

for (const status of [200, 401, 403]) test('late private response ' + status + ' cannot deliver data, expire, refresh or trigger MFA after a peer transition', { timeout: 3000 }, async t => {
  const o = origin(); const a = o.store(o.tab(), true); await a.get().setAuth(identity('A')); const held = deferred(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; await held.promise; return { status, ok: status === 200,
    json: async () => status === 200 ? { private: 'TEST_OLD_SECRET' } : { error: 'ADMIN_MFA_REQUIRED' } }; });
  const response = assert.rejects(a.transport.apiAuthGet('/admin/users'), /SESSION_CHANGED/);
  const b = o.store(o.tab()); await b.get().setAuth(identity('B')); held.resolve(); await response;
  assert.equal(calls, 1); assert.equal(a.removals, 0); assert.equal(a.mfa || 0, 0); assert.equal(o.disk.value.data.user.id, 'B');
});

test('web profile persistence and removal complete synchronously inside the checked operation', async t => {
  const data = new Map(); const prior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: key => data.get(key) || null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } } });
  t.after(() => { if (prior) Object.defineProperty(globalThis, 'window', prior); else delete globalThis.window; });
  const storage = load('src/utils/sessionStorage.web.ts');
  data.set('TEST_AUTH.refresh', 'TEST_LEGACY_REFRESH'); const saving = storage.saveSession('TEST_AUTH', 'TEST_NEVER_STORE', { user: { id: 'A' } });
  assert.equal(JSON.parse(data.get('TEST_AUTH.profile')).user.id, 'A'); assert.equal(data.has('TEST_AUTH.refresh'), false); await saving;
  assert.deepEqual(await storage.loadSession('TEST_AUTH'), { refreshToken: null, data: { user: { id: 'A' } } });
  const removal = storage.removeSession('TEST_AUTH'); assert.equal(data.size, 0); await removal;
});

for (const delay of ['headers', 'blob']) test('peer transition prevents an old private download at delayed ' + delay, { timeout: 3000 }, async t => {
  const o = origin(); const a = o.store(o.tab()); await a.get().setAuth(identity('A'));
  const held = deferred(); const entered = deferred(); let objects = 0; let clicks = 0;
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    body: { appendChild() {} }, createElement: () => ({ click: () => clicks++ }),
  } });
  t.after(() => { if (prior) Object.defineProperty(globalThis, 'document', prior); else delete globalThis.document; });
  t.mock.method(globalThis.URL, 'createObjectURL', () => { objects++; return 'blob:TEST_PRIVATE'; });
  t.mock.method(globalThis, 'fetch', async () => {
    if (delay === 'headers') { entered.resolve(); await held.promise; }
    return { status: 200, ok: true, blob: async () => { if (delay === 'blob') { entered.resolve(); await held.promise; } return {}; } };
  });
  const { downloadAuthenticatedFile } = load('src/utils/downloadAuthenticatedFile.ts', {
    'react-native': { Platform: { OS: 'web' } }, '../store/authSessionBridge': a.bridge,
  });
  const pending = assert.rejects(downloadAuthenticatedFile({ url: 'https://test.invalid/TEST_ONLY', token: a.get().token,
    filename: 'TEST_ONLY.pdf' }), /SESSION_CHANGED/);
  await entered.promise; const b = o.store(o.tab()); await b.get().setAuth(identity('B'));
  held.resolve(); await pending; assert.equal(objects, 0); assert.equal(clicks, 0); assert.equal(a.api.length, 0);
});
