const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// The real guard is exercised with deferred transport responses. These tests
// perform no network calls and make no claim to render the React component.
function loadGuard() {
  const filename = path.resolve(__dirname, '../src/utils/adminMfaRequests.ts');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports.createAdminMfaRequestGuard();
}
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const allowed = { enrolled: true, verified: true, owner: 'TEST_A' };
const denied = { enrolled: true, verified: false, owner: 'TEST_A' };
function session() {
  const guard = loadGuard(); guard.activate();
  const state = { status: null, error: null, busy: false, recoveryCodes: null, refreshCalls: 0, applied: [] };
  async function refresh(response, ticket = guard.begin()) {
    state.refreshCalls++;
    try {
      const value = await response;
      if (guard.isCurrent(ticket)) { state.status = value; state.applied.push(value); }
    } catch (error) { if (guard.isCurrent(ticket)) state.error = error.message; }
  }
  async function verify(response, nextStatus) {
    const ticket = guard.begin(); state.busy = true;
    try {
      const value = await response;
      if (!guard.isCurrent(ticket)) return;
      if (value.recoveryCodes) state.recoveryCodes = value.recoveryCodes;
      else await refresh(nextStatus, ticket);
    } catch (error) { if (guard.isCurrent(ticket)) state.error = error.message; }
    finally { if (guard.isCurrent(ticket)) state.busy = false; }
  }
  function invalidate() { guard.invalidate(); state.status = state.status ? { ...state.status, verified: false } : null; state.busy = false; }
  return { guard, state, refresh, verify, invalidate };
}

for (const reason of ['foreground check', 'MFA-required event']) {
  test('a delayed verified response cannot reopen access after a newer denial from ' + reason, async () => {
    const s = session(); const old = deferred(); const fresh = deferred();
    const a = s.refresh(old.promise);
    s.invalidate(); const b = s.refresh(fresh.promise);
    fresh.resolve(denied); await b; old.resolve(allowed); await a;
    assert.deepEqual(s.state.status, denied);
    assert.deepEqual(s.state.applied, [denied]);
  });
}

test('newest status false wins even when requests overlap without an explicit invalidation', async () => {
  const s = session(); const old = deferred(); const fresh = deferred();
  const a = s.refresh(old.promise); const b = s.refresh(fresh.promise);
  fresh.resolve(denied); await b; old.resolve(allowed); await a;
  assert.equal(s.state.status.verified, false); assert.deepEqual(s.state.applied, [denied]);
});

test('an invalidation blocks an old response immediately while the replacement request is still pending', async () => {
  const s = session(); s.state.status = allowed;
  const old = deferred(); const fresh = deferred(); const a = s.refresh(old.promise);
  s.invalidate(); const b = s.refresh(fresh.promise);
  old.resolve(allowed); await a;
  assert.equal(s.state.status.verified, false); assert.deepEqual(s.state.applied, []);
  fresh.resolve(denied); await b; assert.equal(s.state.status.verified, false);
});

test('a status read after logout cannot update a disposed lifecycle', async () => {
  const s = session(); const response = deferred(); const pending = s.refresh(response.promise);
  s.guard.dispose(); response.resolve(allowed); await pending;
  assert.equal(s.state.status, null); assert.deepEqual(s.state.applied, []);
});

test('a previous identity status cannot apply after the guard activates for a new identity', async () => {
  const s = session(); const old = deferred(); const pending = s.refresh(old.promise);
  s.guard.dispose(); s.guard.activate();
  const ownerB = { ...denied, owner: 'TEST_B' }; await s.refresh(Promise.resolve(ownerB));
  old.resolve(allowed); await pending;
  assert.deepEqual(s.state.status, ownerB); assert.deepEqual(s.state.applied, [ownerB]);
});

test('a late verification result after logout does not start its status refresh or expose recovery codes', async () => {
  for (const result of [{}, { recoveryCodes: ['TEST_NEVER_DISPLAY'] }]) {
    const s = session(); const response = deferred(); const pending = s.verify(response.promise, Promise.resolve(allowed));
    s.guard.dispose(); response.resolve(result); await pending;
    assert.equal(s.state.refreshCalls, 0); assert.equal(s.state.status, null); assert.equal(s.state.recoveryCodes, null);
  }
});

test('verification status refresh keeps its original ticket and cannot supersede a later MFA denial', async () => {
  const s = session(); const verified = deferred(); const status = deferred();
  const pending = s.verify(verified.promise, status.promise);
  verified.resolve({}); await Promise.resolve();
  assert.equal(s.state.refreshCalls, 1);
  s.invalidate(); await s.refresh(Promise.resolve(denied));
  status.resolve(allowed); await pending;
  assert.equal(s.state.status.verified, false); assert.deepEqual(s.state.applied, [denied]);
});

test('verification from an old identity cannot change the new lifecycle or start a follow-up request', async () => {
  const s = session(); const old = deferred(); const pending = s.verify(old.promise, Promise.resolve(allowed));
  s.guard.dispose(); s.guard.activate();
  const ownerB = { ...denied, owner: 'TEST_B' }; await s.refresh(Promise.resolve(ownerB));
  old.resolve({}); await pending;
  assert.equal(s.state.refreshCalls, 1); assert.deepEqual(s.state.status, ownerB);
});

test('late failures and finally handlers do not overwrite a newer request state', async () => {
  const s = session(); const old = deferred(); const fresh = deferred();
  const a = s.verify(old.promise, Promise.resolve(allowed));
  s.invalidate(); const b = s.verify(fresh.promise, Promise.resolve(allowed));
  old.reject(new Error('TEST_STALE_ERROR')); await a;
  assert.equal(s.state.error, null); assert.equal(s.state.busy, true);
  fresh.resolve({}); await b; assert.equal(s.state.busy, false); assert.equal(s.state.status.verified, true);
});

test('a fresh successful verification recovers access after invalidation without reviving old tickets', async () => {
  const s = session(); const old = deferred(); const pending = s.refresh(old.promise);
  s.invalidate(); await s.refresh(Promise.resolve(denied));
  await s.verify(Promise.resolve({}), Promise.resolve(allowed));
  assert.equal(s.state.status.verified, true);
  old.resolve(denied); await pending; assert.equal(s.state.status.verified, true);
  assert.deepEqual(s.state.applied, [denied, allowed]);
});

test('reactivation never makes tickets from an earlier mount current again', async () => {
  const s = session(); const old = s.guard.begin();
  s.guard.dispose(); const whileDisposed = s.guard.begin();
  assert.equal(s.guard.isCurrent(old), false); assert.equal(s.guard.isCurrent(whileDisposed), false);
  s.guard.activate(); const fresh = s.guard.begin();
  assert.equal(s.guard.isCurrent(old), false); assert.equal(s.guard.isCurrent(whileDisposed), false);
  assert.equal(s.guard.isCurrent(fresh), true);
});
