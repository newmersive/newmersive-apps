const assert = require('node:assert/strict');
const { it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, replacements = {}) {
  const file = path.resolve(__dirname, relative);
  const compiled = new Module(file, module);
  compiled.filename = file; compiled.paths = Module._nodeModulePaths(path.dirname(file));
  const original = compiled.require.bind(compiled);
  compiled.require = name => Object.hasOwn(replacements, name) ? replacements[name] : original(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file);
  return compiled.exports;
}
const presentation = load('../src/utils/adminDisputes.ts');
const api = transport => load('../src/config/adminDisputes.ts', { './api': { apiAuthGet: transport } });
const date = '2026-09-09T12:00:00.000Z';
const totals = { principalWithdrawn: 5000, principalReinstated: 0, principalOutstanding: 5000,
  feesCharged: 1500, feesRefunded: 0, feeNet: 1500, stripeClearingDelta: -6500 };
const record = (id = 'local_dispute_a') => ({ id, orderId: 'order_a', paymentId: null, stripeDisputeId: 'dp_a',
  stripeChargeId: null, status: 'lost', amount: 5000, currency: 'eur', reason: null, evidenceDueAt: null,
  closedAt: null, createdAt: date, updatedAt: date, archived: true,
  accounting: { status: 'loss_allocation_review', revision: 1, stateHash: 'a'.repeat(64), observedAt: date,
    retryAfter: null, failureCode: null, providerStatus: 'lost', observationMatched: true, reviewReasons: [],
    quality: 'recorded', issues: [], totals: { ...totals } } });
const page = (scope = 'attention') => ({ items: [record()], total: 1, nextCursor: null, scope, readAt: date });
const detail = () => ({ record: record(), movements: [{ id: 'movement_a', stripeAccountId: 'acct_a',
  stripeBalanceTransactionId: 'txn_a', stripeMode: 'test', currency: 'eur', amount: -5000, fee: 1500,
  net: -6500, reportingCategory: 'dispute', snapshotHash: 'b'.repeat(64), created: 1788955200,
  availableOn: null, availableStatus: null, journalComplete: false, journal: [] }], readAt: date });
const normalize = value => value.replace(/\s/g, ' ');

it('uses Stripe units for EUR and zero-decimal currencies, preserving signs', () => {
  const { disputeMoney } = presentation;
  assert.equal(normalize(disputeMoney(12345, 'eur')), '123,45 €');
  assert.match(disputeMoney(500, 'JPY'), /^500\s/);
  assert.match(disputeMoney(500, 'KRW'), /^500\s/);
  assert.equal(normalize(disputeMoney(-1500, 'EUR')), '-15,00 €');
});

it('keeps special ISK/UGX/HUF/TWD charge units at two decimals and unknown exponents explicit', () => {
  for (const code of ['ISK', 'UGX', 'HUF', 'TWD']) assert.match(presentation.disputeMoney(500, code), /^5,00\s/);
  for (const code of ['KWD', 'BHD', 'JOD', 'ZZZ']) assert.equal(presentation.disputeMoney(500, code), `500 unidades Stripe (${code})`);
});

it('never turns absent, invalid or unsafe money into a verified zero', () => {
  for (const amount of [null, undefined, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(presentation.disputeMoney(amount, 'EUR'), 'Sin comprobar');
  assert.equal(presentation.disputeMoney(500, 'not-currency'), 'Sin comprobar');
  assert.equal(normalize(presentation.disputeMoney(0, 'EUR')), '0,00 €');
});

it('preserves prior valid amounts with incomplete observation warnings, without inferring available funds', () => {
  const item = record(); item.accounting.quality = 'incomplete';
  item.accounting.failureCode = 'DISPUTE_BALANCE_READ_FAILED'; item.accounting.issues = ['accounting_observation_failed'];
  const result = presentation.disputeEvidence(item);
  assert.deepEqual(result.totals, totals);
  assert.match(result.warning, /movimientos anteriores válidos/);
  assert.match(result.issues[0], /no pudo completarse/);
  item.accounting.totals = null;
  assert.equal(presentation.disputeEvidence(item).totals, null);
  item.accounting.quality = 'unobserved'; item.accounting.totals = totals;
  assert.equal(presentation.disputeEvidence(item).totals, null);
  assert.equal(presentation.disputeEvidence(item).label, 'Sin comprobar');
});

it('separates provider outcomes from pending loss allocation and translates all actual review reasons', () => {
  assert.equal(presentation.disputeProviderLabel('won'), 'Ganada');
  assert.equal(presentation.disputeProviderLabel(null), 'Sin comprobar');
  assert.equal(presentation.disputeAccountingLabel('loss_allocation_review'), 'Pérdida pendiente de asignación');
  for (const code of ['disputed_principal_exceeds_charge', 'withdrawal_evidence_missing',
    'withdrawn_principal_differs_from_dispute', 'won_principal_not_fully_reinstated',
    'lost_principal_receivable_unresolved', 'reinstatement_exceeds_withdrawal', 'stripe_balance_pending'])
    assert.ok(!presentation.disputeIssueLabel(code).includes(code));
  assert.equal(presentation.disputeDate(null), 'Sin comprobar');
  assert.equal(presentation.disputeDate('invalid'), 'Sin comprobar');
});

it('accepts nullable legacy context, absent totals, archived records, and an explicitly incomplete journal', () => {
  const client = api(() => { throw new Error('No network expected'); });
  const value = page(); value.items[0].accounting.totals = null;
  assert.equal(client.parseAdminDisputePage(value, 'attention'), value);
  const d = detail();
  assert.equal(client.parseAdminDisputeDetail(d, d.record.id), d);
});

it('rejects wrong scope, wrong selected identity, duplicated rows and malformed money instead of showing misleading evidence', () => {
  const client = api(() => { throw new Error('No network expected'); });
  assert.throws(() => client.parseAdminDisputePage(page('all'), 'attention'));
  assert.throws(() => client.parseAdminDisputeDetail(detail(), 'local_dispute_b'));
  const duplicate = page(); duplicate.items.push(record());
  assert.throws(() => client.parseAdminDisputePage(duplicate, 'attention'));
  const malformed = page(); malformed.items[0].accounting.totals.feeNet = null;
  assert.throws(() => client.parseAdminDisputePage(malformed, 'attention'));
  const invalidMovement = detail(); invalidMovement.movements[0].net = 0.5;
  assert.throws(() => client.parseAdminDisputeDetail(invalidMovement, invalidMovement.record.id));
});

it('reads only the two authenticated GET routes with a bounded page and opaque encoded cursor', async () => {
  const calls = [];
  const client = api(async url => { calls.push(url); return url.includes('?') ? page('all') : detail(); });
  await client.fetchAllwainAdminDisputes('all', 'cursor+/=a');
  await client.fetchAllwainAdminDispute('local_dispute_a');
  assert.deepEqual(calls, ['/admin/allwain/disputes?scope=all&limit=20&cursor=cursor%2B%2F%3Da', '/admin/allwain/disputes/local_dispute_a']);
  await assert.rejects(client.fetchAllwainAdminDispute('../other/path'));
  assert.equal(calls.length, 2);
});

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

it('discards a slow attention response after a faster all response and invalidates its detail', async () => {
  const guard = presentation.createDisputeRequestGuard(); const first = deferred(); const second = deferred();
  const shown = []; const oldDetail = guard.beginDetail();
  const fetchPage = async promise => { const ticket = guard.beginList(); const result = await promise;
    if (guard.listCurrent(ticket)) shown.push(result); };
  const a = fetchPage(first.promise); const b = fetchPage(second.promise);
  second.resolve('all'); await b; first.resolve('attention'); await a;
  assert.deepEqual(shown, ['all']); assert.equal(guard.detailCurrent(oldDetail), false);
});

it('discards slow detail A after selecting B and rejects results after closing the detail', async () => {
  const guard = presentation.createDisputeRequestGuard(); const first = deferred(); const second = deferred();
  const shown = [];
  const fetchDetail = async promise => { const ticket = guard.beginDetail(); const result = await promise;
    if (guard.detailCurrent(ticket)) shown.push(result); };
  const a = fetchDetail(first.promise); const b = fetchDetail(second.promise);
  second.resolve('B'); await b; first.resolve('A'); await a;
  assert.deepEqual(shown, ['B']);
  const late = deferred(); const c = fetchDetail(late.promise);
  guard.invalidateDetail(); late.resolve('closed'); await c;
  assert.deepEqual(shown, ['B']);
});

it('invalidates both channels across unmount/MFA/session expiry and cannot revive old tickets after authorization returns', async () => {
  let authorized = true; const guard = presentation.createDisputeRequestGuard(() => authorized);
  const list = guard.beginList(); const detail = guard.beginDetail();
  authorized = false;
  assert.equal(guard.listCurrent(list), false); assert.equal(guard.detailCurrent(detail), false);
  guard.invalidate(); authorized = true;
  assert.equal(guard.listCurrent(list), false); assert.equal(guard.detailCurrent(detail), false);
  const fresh = guard.beginList(); assert.equal(guard.listCurrent(fresh), true);
  guard.invalidate(); assert.equal(guard.listCurrent(fresh), false);
});
