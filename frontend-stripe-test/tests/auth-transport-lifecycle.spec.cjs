const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, replacements = {}) {
  const filename = path.resolve(__dirname, relative);
  const compiled = new Module(filename, module); compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = compiled.require.bind(compiled);
  compiled.require = name => Object.hasOwn(replacements, name) ? replacements[name] : original(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return compiled.exports;
}
function deferred(t, fallback = null) {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  t.after(() => resolve(fallback));
  return { promise, resolve, reject };
}
const response = (status, body = { ok: true }) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function fixture(t) {
  const state = { generation: 1, token: 'TEST_A_access', refreshCalls: [], expired: [], mfa: 0, requests: [],
    transport: null, onRefresh: async () => null };
  const bridge = load('../src/store/authSessionBridge.ts');
  bridge.registerAuthSessionBridge({
    getGeneration: () => state.generation,
    getIsTransitioning: () => false,
    getToken: () => state.token,
    refreshToken: () => { state.refreshCalls.push({ generation: state.generation, token: state.token }); return state.onRefresh(); },
    expireSession: async message => { state.expired.push({ generation: state.generation, message }); state.generation++; state.token = null; },
  });
  const api = load('../src/config/api.ts', {
    '../utils/webAuthCoordination': load('../src/utils/webAuthCoordination.ts'),
    '../store/authSessionBridge': bridge,
    '../store/adminMfaBridge': { requireAdminMfa: () => { state.mfa++; } },
  });
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const call = { path: new URL(input).pathname, method: init.method,
      authorization: new Headers(init.headers).get('authorization'), body: init.body,
      credentials: init.credentials, signal: init.signal };
    state.requests.push(call);
    if (!state.transport) throw new Error('TEST_UNEXPECTED_EXTERNAL_REQUEST');
    return state.transport(call);
  });
  const change = (token = 'TEST_B_access') => { state.generation++; state.token = token; };
  return { api, bridge, state, change };
}
function fixtureWithStore(t) {
  const f = fixture(t); const values = new Map(); const storage = { disk: null, onSave: null };
  const { useAuthStore: store } = load('../src/store/auth.store.ts', {
    '../utils/webAuthCoordination': load('../src/utils/webAuthCoordination.ts'),
    '../config/api': f.api,
    './authSessionBridge': f.bridge,
    '@react-native-async-storage/async-storage': {
      getItem: async key => values.get(key) || null,
      setItem: async (key, value) => { values.set(key, value); },
      removeItem: async key => { values.delete(key); },
    },
    '../i18n': { detectAppLocale: () => 'es', normalizeAppLocale: value => ['es', 'en', 'fr'].includes(value) ? value : null },
    '../utils/allwainParticipation': { normalizeAllwainParticipation: value => value || { TEST: true } },
    '../utils/sessionStorage': {
      saveSession: async (_key, refreshToken, data) => {
        if (storage.onSave) await storage.onSave(data);
        storage.disk = structuredClone({ refreshToken, data });
      },
      loadSession: async () => structuredClone(storage.disk),
      removeSession: async () => { storage.disk = null; },
    },
    '../analytics': { trackAnalyticsEvent: async () => undefined },
  });
  return { ...f, storage, store, auth: () => store.getState() };
}
const identity = (id, version = 'initial') => ({ token: `TEST_${id}_${version}`, refreshToken: `TEST_refresh_${id}_${version}`,
  user: { id, email: id + '@test.local', role: 'admin', preferredLocale: 'es' } });
const options = { timeout: 3000 };

for (const method of ['Get', 'Post', 'Patch', 'Delete']) test(`late ${method} 401 from A cannot retry or expire B`, options, async t => {
  const f = fixture(t); const held = deferred(t, response(500)); f.state.transport = () => held.promise;
  const pending = f.api['apiAuth' + method]('/allwain/participation', { TEST: true });
  const rejected = assert.rejects(pending, /SESSION_CHANGED/);
  f.change(); held.resolve(response(401, { error: 'UNAUTHORIZED' })); await rejected;
  assert.equal(f.state.requests.length, 1); assert.equal(f.state.requests[0].authorization, 'Bearer TEST_A_access');
  assert.equal(f.state.refreshCalls.length, 0); assert.equal(f.state.expired.length, 0); assert.equal(f.state.token, 'TEST_B_access');
});

test('logout captures A before local clearing and its delayed 401 never logs out B', options, async t => {
  const f = fixture(t); const held = deferred(t, response(500)); const entered = deferred(t);
  f.state.transport = () => { entered.resolve(); return held.promise; };
  const logout = f.api.apiAuthPost('/auth/logout', {}).catch(error => error.message);
  f.change(null); f.change(); await entered.promise;
  assert.equal(f.state.requests[0].authorization, 'Bearer TEST_A_access');
  held.resolve(response(401, { error: 'UNAUTHORIZED' }));
  assert.equal(await logout, 'LOGOUT_NOT_CONFIRMED'); assert.equal(f.state.token, 'TEST_B_access');
  assert.equal(f.state.requests.length, 1); assert.equal(f.state.refreshCalls.length, 0); assert.equal(f.state.expired.length, 0);
});

test('a late successful A response is not delivered to the next identity', options, async t => {
  const f = fixture(t); const held = deferred(t, response(500)); f.state.transport = () => held.promise;
  const result = assert.rejects(f.api.apiAuthGet('/admin/users'), /SESSION_CHANGED/);
  f.change(); held.resolve(response(200, { private: 'TEST_A_ONLY' })); await result;
  assert.equal(f.state.token, 'TEST_B_access'); assert.equal(f.state.mfa, 0);
});

for (const status of [200, 401, 403]) test(`identity changing during ${status} body parsing cannot publish data or auth effects`, options, async t => {
  const f = fixture(t); const body = deferred(t); const entered = deferred(t);
  f.state.transport = async () => ({ status, ok: status === 200, json: () => { entered.resolve(); return body.promise; } });
  // Logout avoids an automatic refresh before this test reaches a 401 body.
  const pending = status === 401 ? f.api.apiAuthPost('/auth/logout', {}) : f.api.apiAuthGet('/admin/users');
  const rejected = assert.rejects(pending, status === 401 ? /LOGOUT_NOT_CONFIRMED/ : /SESSION_CHANGED/);
  await entered.promise; f.change(); body.resolve(status === 200 ? { private: 'TEST_A_ONLY' } : { error: 'ADMIN_MFA_REQUIRED' });
  await rejected; assert.equal(f.state.expired.length, 0); assert.equal(f.state.mfa, 0);
  assert.equal(f.state.token, 'TEST_B_access'); assert.equal(f.state.requests.length, 1);
});

test('current-session 401 refreshes once and retries using its rotated access token', options, async t => {
  const f = fixture(t);
  f.state.transport = async () => response(f.state.requests.length === 1 ? 401 : 200);
  f.state.onRefresh = async () => { f.state.token = 'TEST_A_rotated'; return f.state.token; };
  assert.deepEqual(await f.api.apiAuthPost('/allwain/action', { TEST: 1 }), { ok: true });
  assert.deepEqual(f.state.requests.map(call => call.authorization), ['Bearer TEST_A_access', 'Bearer TEST_A_rotated']);
  assert.equal(f.state.refreshCalls.length, 1); assert.equal(f.state.expired.length, 0);
  assert.equal(f.state.requests[0].body, f.state.requests[1].body);
});

test('a genuinely expired current session is still cleared without an infinite retry', options, async t => {
  const f = fixture(t); f.state.transport = async () => response(401);
  await assert.rejects(f.api.apiAuthGet('/allwain/orders'), /SESSION_EXPIRED/);
  assert.equal(f.state.requests.length, 1); assert.equal(f.state.refreshCalls.length, 1);
  assert.equal(f.state.expired.length, 1); assert.equal(f.state.token, null);
});

test('logout 401 reports unconfirmed revocation without a refresh or global expiry', options, async t => {
  const f = fixture(t); f.state.transport = async () => response(401);
  await assert.rejects(f.api.apiAuthPost('/auth/logout', {}), /LOGOUT_NOT_CONFIRMED/);
  assert.equal(f.state.requests.length, 1); assert.equal(f.state.refreshCalls.length, 0); assert.equal(f.state.expired.length, 0);
});

test('a B refresh does not join an unresolved refresh owned by A', options, async t => {
  const f = fixture(t); const old = deferred(t); const entered = deferred(t);
  f.state.transport = async call => response(call.authorization === 'Bearer TEST_B_rotated' ? 200 : 401);
  f.state.onRefresh = () => { entered.resolve(); return old.promise; };
  const first = assert.rejects(f.api.apiAuthGet('/allwain/a'), /SESSION_CHANGED/); await entered.promise;
  f.change(); f.state.onRefresh = async () => { f.state.token = 'TEST_B_rotated'; return f.state.token; };
  assert.deepEqual(await f.api.apiAuthGet('/allwain/b'), { ok: true });
  old.resolve('TEST_A_late'); await first;
  assert.equal(f.state.refreshCalls.length, 2); assert.equal(f.state.expired.length, 0);
  assert.equal(f.state.token, 'TEST_B_rotated');
  assert.equal(f.state.requests.filter(call => call.path.endsWith('/allwain/a')).length, 1);
});

test('same-session concurrent 401s share one refresh and both retries remain bound to A', options, async t => {
  const f = fixture(t); const renewed = deferred(t); const entered = deferred(t);
  f.state.transport = async call => response(call.authorization === 'Bearer TEST_A_rotated' ? 200 : 401);
  f.state.onRefresh = () => { entered.resolve(); return renewed.promise; };
  const first = f.api.apiAuthGet('/allwain/one'); const second = f.api.apiAuthGet('/allwain/two');
  await entered.promise; f.state.token = 'TEST_A_rotated'; renewed.resolve(f.state.token);
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
  assert.equal(f.state.refreshCalls.length, 1); assert.equal(f.state.requests.length, 4); assert.equal(f.state.expired.length, 0);
});

test('a queued browser lock rechecks the captured generation before touching refresh credentials', options, async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let run;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: (_name, action) => {
    run = action; return release.promise.then(action);
  } } } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'navigator', descriptor) : delete globalThis.navigator);
  const release = deferred(t); const f = fixture(t);
  const pending = f.bridge.refreshAuthToken(); assert.equal(typeof run, 'function');
  f.change(); release.resolve(); assert.equal(await pending, null); assert.equal(f.state.refreshCalls.length, 0);
});

test('a new login by the same user invalidates old requests even if the token string is repeated', options, async t => {
  const f = fixture(t); const held = deferred(t, response(500)); f.state.transport = () => held.promise;
  const rejected = assert.rejects(f.api.apiAuthGet('/admin/users'), /SESSION_CHANGED/);
  f.change('TEST_A_access'); held.resolve(response(200)); await rejected;
});

test('an ordinary access rotation within the same generation does not discard a valid response', options, async t => {
  const f = fixture(t); const held = deferred(t, response(500)); f.state.transport = () => held.promise;
  const pending = f.api.apiAuthGet('/allwain/orders'); f.state.token = 'TEST_A_rotated'; held.resolve(response(200));
  assert.deepEqual(await pending, { ok: true }); assert.equal(f.state.expired.length, 0);
});

test('signed-out authenticated calls cannot fall back to ambient browser cookies', options, async t => {
  const f = fixture(t); f.change(null);
  await assert.rejects(f.api.apiAuthGet('/admin/users'), /SESSION_EXPIRED/);
  assert.equal(f.state.requests.length, 0); assert.equal(f.state.expired.length, 0);
});

test('real store: a request made with A while login B waits cannot publish after B commits', options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A'));
  const login = deferred(t, response(500)); const privateData = deferred(t, response(500));
  f.state.transport = call => call.path.endsWith('/auth/login') ? login.promise : privateData.promise;
  const signingIn = f.auth().login('B@test.local', 'TEST_password');
  const rejected = assert.rejects(f.api.apiAuthGet('/admin/users'), /SESSION_CHANGED/);
  login.resolve(response(200, identity('B'))); await signingIn;
  privateData.resolve(response(200, { private: 'TEST_A_ONLY' })); await rejected;
  assert.equal(f.auth().user.id, 'B'); assert.equal(f.storage.disk.data.user.id, 'B');
  assert.equal(f.state.requests.filter(call => call.path.endsWith('/admin/users')).length, 0);
});

test('real store: an A request during B persistence cannot renew or expire the newly published B', options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A'));
  const saving = deferred(t); const entered = deferred(t); const old = deferred(t, response(500));
  f.storage.onSave = async data => { if (data.user.id === 'B') { entered.resolve(); await saving.promise; } };
  f.state.transport = () => old.promise;
  const settingB = f.auth().setAuth(identity('B')); await entered.promise;
  const rejected = assert.rejects(f.api.apiAuthPost('/allwain/action', { TEST: 'A' }), /SESSION_CHANGED/);
  saving.resolve(); await settingB; old.resolve(response(401, { error: 'UNAUTHORIZED' })); await rejected;
  assert.equal(f.auth().user.id, 'B'); assert.equal(f.auth().token, 'TEST_B_initial');
  assert.equal(f.state.requests.length, 0); assert.equal(f.storage.disk.data.user.id, 'B');
});

test('real store: a new login of A also fences pending responses emitted before its publication', options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A'));
  const login = deferred(t, response(500)); const old = deferred(t, response(500));
  f.state.transport = call => call.path.endsWith('/auth/login') ? login.promise : old.promise;
  const signingIn = f.auth().login('A@test.local', 'TEST_password');
  const rejected = assert.rejects(f.api.apiAuthGet('/admin/users'), /SESSION_CHANGED/);
  login.resolve(response(200, identity('A', 'new_session'))); await signingIn;
  old.resolve(response(403, { error: 'ADMIN_MFA_REQUIRED' })); await rejected;
  assert.equal(f.state.mfa, 0); assert.equal(f.auth().token, 'TEST_A_new_session');
  assert.equal(f.state.requests.filter(call => call.path.endsWith('/admin/users')).length, 0);
});

test('cookie order: refresh A headers and body finish before logout A and login B are emitted', options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A'));
  const headers = deferred(t); const body = deferred(t); const entered = deferred(t); const parsing = deferred(t);
  let cookie = 'TEST_cookie_A';
  f.state.transport = async call => {
    assert.equal(call.credentials, 'include');
    if (call.path.endsWith('/auth/refresh')) {
      entered.resolve(); await headers.promise; cookie = 'TEST_cookie_A_rotated';
      return { status: 200, ok: true, json: () => { parsing.resolve(); return body.promise; } };
    }
    if (call.path.endsWith('/auth/logout')) {
      assert.equal(call.authorization, 'Bearer TEST_A_initial'); cookie = null; return response(200);
    }
    assert.ok(call.path.endsWith('/auth/login')); cookie = 'TEST_cookie_B'; return response(200, identity('B'));
  };
  const refreshing = f.auth().refreshAccessToken(); await entered.promise;
  const logout = f.auth().clearAuth(); const login = f.auth().login('B@test.local', 'TEST_password');
  assert.equal(f.auth().user, null); assert.equal(f.state.requests.length, 1);
  headers.resolve(); await parsing.promise; assert.equal(f.state.requests.length, 1);
  body.resolve(identity('A', 'rotated')); await Promise.all([refreshing, logout, login]);
  assert.equal(cookie, 'TEST_cookie_B'); assert.equal(f.auth().user.id, 'B');
  assert.deepEqual(f.state.requests.map(call => call.path.split('/').at(-1)), ['refresh', 'logout', 'login']);
});

test('cookie order: delayed logout A cannot clear a cookie issued by the following login B', options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A'));
  const release = deferred(t); const entered = deferred(t); let cookie = 'TEST_cookie_A';
  f.state.transport = async call => {
    if (call.path.endsWith('/auth/logout')) { entered.resolve(); await release.promise; cookie = null; return response(200); }
    assert.ok(call.path.endsWith('/auth/login')); cookie = 'TEST_cookie_B'; return response(200, identity('B'));
  };
  const logout = f.auth().clearAuth(); await entered.promise;
  const login = f.auth().login('B@test.local', 'TEST_password');
  assert.equal(f.state.requests.length, 1); release.resolve(); await Promise.all([logout, login]);
  assert.equal(cookie, 'TEST_cookie_B'); assert.equal(f.auth().user.id, 'B');
});

test('all login providers and registration share the cookie mutation queue', options, async t => {
  const f = fixture(t); const release = deferred(t); const entered = deferred(t);
  f.state.transport = async () => { if (f.state.requests.length === 1) { entered.resolve(); await release.promise; } return response(200); };
  const paths = ['/auth/google', '/auth/apple', '/auth/register', '/auth/refresh', '/auth/login'];
  const calls = paths.map(route => f.api.apiPost(route, { TEST: true }));
  await entered.promise; assert.equal(f.state.requests.length, 1); release.resolve(); await Promise.all(calls);
  assert.deepEqual(f.state.requests.map(call => call.path.split('/').at(-1)), paths.map(route => route.split('/').at(-1)));
});

for (const method of ['logout-all', 'revoke']) test(`cookie order and stale continuation for ${method} cannot clear B`, options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A'));
  const release = deferred(t); const entered = deferred(t); let cookie = 'TEST_cookie_A'; let cleared = false;
  f.state.transport = async call => {
    if (call.path.endsWith('/auth/login')) { cookie = 'TEST_cookie_B'; return response(200, identity('B')); }
    entered.resolve(); await release.promise; cookie = null; return response(200, { ok: true, currentRevoked: true });
  };
  const request = method === 'logout-all' ? f.api.apiAuthPost('/auth/logout-all', {}) : f.api.apiAuthDelete('/auth/sessions/TEST_A');
  // This is the modal's continuation: a stale success must never reach clearAuth.
  const rejected = assert.rejects(request.then(() => { cleared = true; return f.auth().clearAuth(); }), /SESSION_CHANGED/);
  await entered.promise; const login = f.auth().login('B@test.local', 'TEST_password');
  assert.equal(f.state.requests.length, 1); release.resolve(); await Promise.all([rejected, login]);
  assert.equal(cleared, false); assert.equal(f.auth().user.id, 'B'); assert.equal(cookie, 'TEST_cookie_B');
  assert.equal(f.state.requests.length, 2);
});

test('cookie-writing session revocation releases its first attempt before a real refresh and retry', options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A')); let deletions = 0;
  f.state.transport = async call => {
    if (call.path.endsWith('/auth/refresh')) return response(200, identity('A', 'rotated'));
    assert.equal(call.method, 'DELETE'); deletions++;
    return response(deletions === 1 ? 401 : 200);
  };
  assert.deepEqual(await f.api.apiAuthDelete('/auth/sessions/TEST_other'), { ok: true });
  assert.equal(f.state.requests.length, 3); assert.equal(deletions, 2);
  assert.equal(f.state.requests[2].authorization, 'Bearer TEST_A_rotated'); assert.equal(f.auth().user.id, 'A');
});

test('a timed-out cookie request that ignores abort remains a barrier until its response is finished', options, async t => {
  const f = fixture(t); const release = deferred(t, response(200)); const entered = deferred(t);
  f.state.transport = async call => {
    if (call.path.endsWith('/auth/logout')) { entered.resolve(); return release.promise; }
    return response(200, identity('B'));
  };
  const timedOut = assert.rejects(f.api.apiAuthPost('/auth/logout', {}, 25), /conexión ha tardado/); await entered.promise;
  const login = f.api.apiPost('/auth/login', { email: 'B@test.local' });
  await timedOut; assert.equal(f.state.requests.length, 1); assert.equal(f.state.requests[0].signal.aborted, true);
  release.resolve(response(200)); await login;
  assert.equal(f.state.requests.length, 2);
});

test('a cookie operation expiring in the queue never sends its captured bearer later', options, async t => {
  const f = fixture(t); const release = deferred(t, response(200)); const entered = deferred(t);
  f.state.transport = () => { entered.resolve(); return release.promise; };
  const first = f.api.apiPost('/auth/refresh', {}); await entered.promise;
  await assert.rejects(f.api.apiAuthPost('/auth/logout', {}, 20), /conexión ha tardado/);
  release.resolve(response(200)); await first;
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.state.requests.length, 1);
});

test('cookie operations share an abortable browser lock separate from the refresh lock', options, async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); const lockCalls = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request: async (name, lockOptions, run) => {
      lockCalls.push({ name, signal: lockOptions.signal }); return run();
    },
  } } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'navigator', descriptor) : delete globalThis.navigator);
  const f = fixture(t); f.state.transport = async () => response(200);
  await f.api.apiPost('/auth/login', {}); await f.api.apiAuthPost('/auth/logout', {});
  assert.equal(lockCalls.length, 2); assert.ok(lockCalls.every(call => call.name === 'newmersive-allwain-auth-cookie'));
  assert.ok(lockCalls.every(call => call.signal instanceof AbortSignal));
});

test('queued logout-all A is rejected before dispatch when setAuth publishes B first', options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A'));
  const release = deferred(t, response(200)); const entered = deferred(t);
  f.state.transport = call => {
    assert.ok(call.path.endsWith('/auth/refresh'), 'Stale logout-all must never reach HTTP');
    entered.resolve(); return release.promise;
  };
  const occupying = f.api.apiPost('/auth/refresh', {}); await entered.promise;
  const rejected = assert.rejects(f.api.apiAuthPost('/auth/logout-all', {}), /SESSION_CHANGED/);
  await f.auth().setAuth(identity('B')); release.resolve(response(200));
  await Promise.all([occupying, rejected]);
  assert.equal(f.state.requests.length, 1); assert.equal(f.auth().user.id, 'B');
  assert.equal(f.storage.disk.data.user.id, 'B');
});

test('logout-all captured during login B cannot clear its cookie while B persistence is still pending', options, async t => {
  const f = fixtureWithStore(t); await f.auth().setAuth(identity('A'));
  const loginResponse = deferred(t); const loginEntered = deferred(t); const savingB = deferred(t); const saveEntered = deferred(t);
  let cookie = 'TEST_cookie_A'; let logoutPosts = 0;
  f.storage.onSave = async data => { if (data.user.id === 'B') { saveEntered.resolve(); await savingB.promise; } };
  f.state.transport = async call => {
    if (call.path.endsWith('/auth/login')) {
      loginEntered.resolve(); await loginResponse.promise; cookie = 'TEST_cookie_B'; return response(200, identity('B'));
    }
    assert.ok(call.path.endsWith('/auth/logout-all'));
    logoutPosts++; cookie = null; return response(200, { ok: true });
  };
  const login = f.auth().login('B@test.local', 'TEST_password'); await loginEntered.promise;
  assert.equal(f.auth().user.id, 'A');
  const outcome = f.api.apiAuthPost('/auth/logout-all', {}).then(() => ({ accepted: true }), error => ({ accepted: false, code: error.message }));
  try {
    loginResponse.resolve(); await saveEntered.promise;
    const result = await outcome;
    assert.equal(logoutPosts, 0, 'An old bearer must not clear the new cookie before the new session is published');
    assert.equal(result.accepted, false); assert.match(result.code, /SESSION_CHANGED|SESSION_EXPIRED/);
    assert.equal(cookie, 'TEST_cookie_B');
  } finally { savingB.resolve(); loginResponse.resolve(); await login; }
  assert.equal(f.auth().user.id, 'B'); assert.equal(cookie, 'TEST_cookie_B');
});
