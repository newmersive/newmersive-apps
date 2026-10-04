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
function deferred(t) {
  let resolve; const promise = new Promise(done => { resolve = done; });
  t.after(() => resolve()); return { promise, resolve };
}
const options = { timeout: 3000 };
const response = status => ({ status, ok: status >= 200 && status < 300, blob: async () => ({ TEST: 'private-bytes' }) });

// Real helper + bridge, with all browser/native I/O replaced. No files, keychain,
// SecureStore, provider or HTTP connections are used by these tests.
function fixture(t, platform = 'web') {
  const state = { token: 'TEST_A', generation: 1, transitioning: false, requests: [], refreshes: 0, expired: 0,
    clicks: [], objects: [], revoked: [], directories: [], deleted: [], files: new Set(), shares: [],
    transport: async () => response(200), native: null, refresh: async () => null,
    available: async () => true, mkdir: async () => undefined, onClick: null };
  const bridge = load('../src/store/authSessionBridge.ts');
  bridge.registerAuthSessionBridge({
    getToken: () => state.token, getGeneration: () => state.generation,
    getIsTransitioning: () => state.transitioning,
    refreshToken: () => { state.refreshes++; return state.refresh(); },
    expireSession: async () => { state.expired++; state.generation++; state.token = null; },
  });
  const native = {
    cacheDirectory: 'file:///TEST_ONLY_CACHE/',
    makeDirectoryAsync: async directory => { state.directories.push(directory); await state.mkdir(directory); },
    downloadAsync: async (url, destination, config) => {
      const request = { url, destination, token: config.headers.Authorization };
      state.requests.push(request);
      const result = state.native ? await state.native(request) : { status: 200, uri: destination };
      state.files.add(destination); return result;
    },
    deleteAsync: async directory => {
      state.deleted.push(directory);
      for (const file of state.files) if (file.startsWith(directory)) state.files.delete(file);
    },
  };
  const document = {
    body: {
      appendChild(link) { link.parentNode = this; },
      removeChild(link) { link.parentNode = null; },
    },
    createElement: () => ({ parentNode: null, click() {
      if (state.onClick) state.onClick(); state.clicks.push({ href: this.href, download: this.download });
    } }),
  };
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => originalDocument ? Object.defineProperty(globalThis, 'document', originalDocument) : delete globalThis.document);
  t.mock.method(globalThis.URL, 'createObjectURL', blob => { state.objects.push(blob); return 'blob:TEST_PRIVATE'; });
  t.mock.method(globalThis.URL, 'revokeObjectURL', uri => state.revoked.push(uri));
  t.mock.method(globalThis, 'fetch', async (url, config) => {
    assert.equal(platform, 'web', 'Native must never escape its mocked filesystem transport');
    const request = { url, token: config.headers.Authorization };
    state.requests.push(request); return state.transport(request);
  });
  const helper = load('../src/utils/downloadAuthenticatedFile.ts', {
    'react-native': { Platform: { OS: platform } }, '../store/authSessionBridge': bridge,
    'expo-file-system/legacy': native,
    'expo-sharing': { isAvailableAsync: () => state.available(), shareAsync: async (uri, settings) => state.shares.push({ uri, settings }) },
  });
  return { state, change(token = 'TEST_B') { state.generation++; state.token = token; },
    download(extra = {}) { return helper.downloadAuthenticatedFile({
      url: 'https://api.example.invalid/api/allwain/documents/TEST_A/pdf', token: state.token,
      filename: 'TEST-private.pdf', ...extra,
    }); } };
}

test('web downloads using the captured token and revokes its temporary object URL', options, async t => {
  const f = fixture(t); await f.download();
  assert.deepEqual(f.state.requests.map(value => value.token), ['Bearer TEST_A']);
  assert.deepEqual(f.state.clicks, [{ href: 'blob:TEST_PRIVATE', download: 'TEST-private.pdf' }]);
  assert.deepEqual(f.state.revoked, ['blob:TEST_PRIVATE']); assert.equal(f.state.expired, 0);
});

for (const status of [200, 401]) test(`web ${status} from A arriving after B never refreshes or exposes A bytes`, options, async t => {
  const f = fixture(t); const held = deferred(t); let blobs = 0; f.state.transport = () => held.promise;
  const pending = assert.rejects(f.download(), /SESSION_CHANGED/);
  f.change(); held.resolve({ ...response(status), blob: async () => { blobs++; return {}; } }); await pending;
  assert.equal(f.state.requests.length, 1); assert.equal(f.state.refreshes, 0); assert.equal(blobs, 0);
  assert.equal(f.state.objects.length, 0); assert.equal(f.state.clicks.length, 0); assert.equal(f.state.token, 'TEST_B');
});

test('web identity change during blob parsing prevents object URL creation and click', options, async t => {
  const f = fixture(t); const held = deferred(t); const entered = deferred(t);
  f.state.transport = async () => ({ ...response(200), blob: () => { entered.resolve(); return held.promise; } });
  const pending = assert.rejects(f.download(), /SESSION_CHANGED/); await entered.promise;
  f.change(); held.resolve({ TEST: 'A' }); await pending;
  assert.equal(f.state.objects.length, 0); assert.equal(f.state.clicks.length, 0);
});

test('web click failure still removes the object URL', options, async t => {
  const f = fixture(t); f.state.onClick = () => { throw new Error('TEST_CLICK_FAILED'); };
  await assert.rejects(f.download(), /TEST_CLICK_FAILED/);
  assert.deepEqual(f.state.revoked, ['blob:TEST_PRIVATE']);
});

for (const platform of ['web', 'ios']) {
  test(`${platform} a download started during identity publication does not borrow the still-visible old token`, options, async t => {
    const f = fixture(t, platform); f.state.transitioning = true;
    await assert.rejects(f.download(), /SESSION_CHANGED/);
    assert.equal(f.state.requests.length, 0); assert.equal(f.state.refreshes, 0);
    assert.equal(f.state.directories.length, 0); assert.equal(f.state.shares.length, 0); assert.equal(f.state.clicks.length, 0);
    f.change(); f.state.transitioning = false; await f.download();
    assert.equal(f.state.requests.length, 1); assert.equal(f.state.requests[0].token, 'Bearer TEST_B');
  });
  test(`${platform} logout cannot fall back to a caller's old token`, options, async t => {
    const f = fixture(t, platform); f.change(null);
    await assert.rejects(f.download({ token: 'TEST_A' }), /SESSION_EXPIRED/);
    assert.equal(f.state.requests.length, 0); assert.equal(f.state.directories.length, 0); assert.equal(f.state.shares.length, 0);
  });
  test(`${platform} rejects a stale caller token from the previous identity before I/O`, options, async t => {
    const f = fixture(t, platform); f.change();
    await assert.rejects(f.download({ token: 'TEST_A' }), /SESSION_CHANGED/);
    assert.equal(f.state.requests.length, 0); assert.equal(f.state.directories.length, 0);
  });
  test(`${platform} same-session 401 refreshes once and retries with its own rotated token`, options, async t => {
    const f = fixture(t, platform);
    f.state.transport = async () => response(f.state.requests.length === 1 ? 401 : 200);
    f.state.native = async request => ({ status: f.state.requests.length === 1 ? 401 : 200, uri: request.destination });
    f.state.refresh = async () => { f.state.token = 'TEST_A_ROTATED'; return f.state.token; };
    await f.download();
    assert.deepEqual(f.state.requests.map(value => value.token), ['Bearer TEST_A', 'Bearer TEST_A_ROTATED']);
    assert.equal(f.state.refreshes, 1); assert.equal(f.state.expired, 0);
    assert.equal(platform === 'web' ? f.state.clicks.length : f.state.shares.length, 1);
  });
  test(`${platform} an in-flight A refresh cannot retry or share after identity B is published`, options, async t => {
    const f = fixture(t, platform); const held = deferred(t); const entered = deferred(t);
    f.state.transport = async () => response(401);
    f.state.native = async request => ({ status: 401, uri: request.destination });
    f.state.refresh = () => { entered.resolve(); return held.promise; };
    const pending = assert.rejects(f.download(), /SESSION_CHANGED/); await entered.promise;
    f.change(); held.resolve('TEST_A_LATE'); await pending;
    assert.equal(f.state.requests.length, 1); assert.equal(f.state.shares.length, 0); assert.equal(f.state.clicks.length, 0);
    assert.equal(f.state.token, 'TEST_B'); if (platform !== 'web') assert.equal(f.state.files.size, 0);
  });
}

test('native success keeps the requested filename and shares only its own destination', options, async t => {
  const f = fixture(t, 'ios'); await f.download();
  assert.equal(f.state.requests.length, 1); assert.equal(f.state.shares.length, 1);
  assert.ok(f.state.shares[0].uri.endsWith('/TEST-private.pdf'));
  assert.equal(f.state.shares[0].uri, f.state.requests[0].destination);
  assert.equal(f.state.shares[0].settings.mimeType, 'application/pdf');
  assert.equal(f.state.deleted.length, 0, 'The platform may still be consuming a handed-off file');
});

for (const status of [200, 401]) test(`native ${status} arriving after B removes only its A temporary file and never shares`, options, async t => {
  const f = fixture(t, 'ios'); const held = deferred(t); const entered = deferred(t); let destination;
  f.state.native = request => { destination = request.destination; entered.resolve(); return held.promise; };
  const pending = assert.rejects(f.download(), /SESSION_CHANGED/); await entered.promise;
  f.change(); held.resolve({ status, uri: destination }); await pending;
  assert.equal(f.state.requests.length, 1); assert.equal(f.state.refreshes, 0); assert.equal(f.state.shares.length, 0);
  assert.equal(f.state.files.size, 0); assert.deepEqual(f.state.deleted, f.state.directories);
});

for (const boundary of ['availability', 'directory']) test(`native identity changes during ${boundary} are rejected before downloading`, options, async t => {
  const f = fixture(t, 'ios'); const held = deferred(t); const entered = deferred(t);
  const pause = () => { entered.resolve(); return held.promise; };
  if (boundary === 'availability') f.state.available = pause; else f.state.mkdir = pause;
  const pending = assert.rejects(f.download(), /SESSION_CHANGED/); await entered.promise;
  f.change(); held.resolve(true); await pending;
  assert.equal(f.state.requests.length, 0); assert.equal(f.state.shares.length, 0);
  assert.equal(f.state.deleted.length, boundary === 'directory' ? 1 : 0);
});

test('native concurrent identities using one filename have separate destinations and stale cleanup leaves B intact', options, async t => {
  const f = fixture(t, 'ios'); const held = deferred(t); const entered = deferred(t); let oldDestination;
  f.state.native = request => {
    if (request.token === 'Bearer TEST_A') { oldDestination = request.destination; entered.resolve(); return held.promise; }
    return { status: 200, uri: request.destination };
  };
  const pending = assert.rejects(f.download(), /SESSION_CHANGED/); await entered.promise;
  f.change(); await f.download(); held.resolve({ status: 200, uri: oldDestination }); await pending;
  assert.notEqual(f.state.requests[0].destination, f.state.requests[1].destination);
  assert.equal(f.state.shares.length, 1); assert.equal(f.state.shares[0].uri, f.state.requests[1].destination);
  assert.deepEqual([...f.state.files], [f.state.requests[1].destination]);
});

test('native rejects a returned URI outside its own destination without deleting or sharing the foreign path', options, async t => {
  const f = fixture(t, 'ios'); const foreign = 'file:///TEST_FOREIGN/untouched.pdf'; f.state.files.add(foreign);
  f.state.native = async () => ({ status: 200, uri: foreign });
  await assert.rejects(f.download(), /DOWNLOAD_UNAVAILABLE/);
  assert.equal(f.state.shares.length, 0); assert.ok(f.state.files.has(foreign));
  assert.deepEqual(f.state.deleted, f.state.directories);
});
