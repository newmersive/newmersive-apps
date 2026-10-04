const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/load-typescript.cjs');
const { createPurchaseDraftStore, PURCHASE_DRAFT_TTL } = load('src/utils/purchaseDraft.ts', {
  'react-native': { Platform: { OS: 'web' } }, 'expo-secure-store': {},
});

function storage() {
  const entries = new Map();
  return { entries, async getItem(key) { return entries.get(key) || null; }, async setItem(key, value) { entries.set(key, value); }, async removeItem(key) { entries.delete(key); } };
}
const purchase = () => ({ quantity: 2, step: 5, purchaseKey: 'same-operation-key', delivery: {
  deliveryMethod: 'shipping', deliveryChannel: 'carrier', deliveryAddress: 'Calle Mayor, 3',
  deliveryRecipientName: 'Ana García', deliveryEmail: 'ana@example.test', deliveryPhone: '+34 600 123 456',
  deliveryPostalCode: '46134', deliveryCity: 'Foios', deliveryCountryCode: 'ES', deliveryUnit: '2.º B',
  deliveryNotes: 'Llamar al llegar', commercialTermsAccepted: true, recurringMandateAccepted: true,
  deliveryDetailsConfirmed: true, saveDeliveryDetails: true, carrierQuoteId: 'expired-quote', carrierQuoteAmount: 500,
  recurringOrder: { enabled: true, interval: 'weekly', label: 'Cada semana' },
} });

test('a fresh instance recovers fields and the idempotency key, but never confirmations or expired quotes', async () => {
  const driver = storage();
  await createPurchaseDraftStore(driver).save('account-A', 'offer-1', purchase());
  const { draft } = await createPurchaseDraftStore(driver).read('account-A', 'offer-1');
  assert.equal(draft.quantity, 2);
  assert.equal(draft.purchaseKey, 'same-operation-key');
  assert.equal(draft.delivery.deliveryRecipientName, 'Ana García');
  assert.equal(draft.delivery.deliveryUnit, '2.º B');
  assert.equal(draft.delivery.recurringOrder.interval, 'weekly');
  for (const field of ['commercialTermsAccepted', 'recurringMandateAccepted', 'deliveryDetailsConfirmed', 'saveDeliveryDetails']) assert.equal(draft.delivery[field], false);
  assert.equal(draft.delivery.carrierQuoteId, undefined);
  assert.equal(draft.delivery.carrierQuoteAmount, undefined);
});

test('drafts cannot cross accounts or offers, including punctuation in identifiers', async () => {
  const driver = storage();
  const store = createPurchaseDraftStore(driver);
  await store.save('a.b', 'c', purchase());
  assert.equal((await store.read('a', 'b.c')).draft, null);
  assert.equal((await store.read('other-account', 'c')).draft, null);
  assert.equal((await store.read('a.b', 'different-offer')).draft, null);
  assert.ok((await store.read('a.b', 'c')).draft);
});

test('expired recipient data is removed at the four-hour boundary', async () => {
  const driver = storage(); let now = 10_000;
  const store = createPurchaseDraftStore(driver, () => now);
  await store.save('u', 'o', purchase());
  now += PURCHASE_DRAFT_TTL;
  assert.equal((await store.read('u', 'o')).draft, null);
  assert.equal(driver.entries.size, 0);
});

test('tampered envelopes do not reveal a different account or invalid purchase quantities', async () => {
  for (const change of [{ userId: 'another-user' }, { quantity: -1 }, { savedAt: Date.now() + 120_000 }]) {
    const driver = storage();
    await createPurchaseDraftStore(driver).save('u', 'o', purchase());
    const [key, json] = [...driver.entries][0];
    driver.entries.set(key, JSON.stringify({ ...JSON.parse(json), ...change }));
    assert.equal((await createPurchaseDraftStore(driver).read('u', 'o')).draft, null);
  }
});

test('corrupt storage is reported without crashing or restoring partial recipient data', async () => {
  const driver = storage();
  await createPurchaseDraftStore(driver).save('u', 'o', purchase());
  const [key] = [...driver.entries.keys()];
  driver.entries.set(key, '{broken-json');
  const result = await createPurchaseDraftStore(driver).read('u', 'o');
  assert.equal(result.draft, null);
  assert.ok(result.error);
});

test('quota failure is explicit and the open-session edit remains recoverable', async () => {
  const driver = storage();
  driver.setItem = async () => { throw new Error('quota'); };
  const store = createPurchaseDraftStore(driver);
  const result = await store.save('u', 'o', purchase());
  assert.equal(result.saved, false);
  assert.ok(result.error);
  assert.equal((await store.read('u', 'o')).draft.delivery.deliveryRecipientName, 'Ana García');
  assert.equal((await createPurchaseDraftStore(driver).read('u', 'o')).draft, null);
});

test('discard waits for a pending write and cannot resurrect its draft afterward', async () => {
  const driver = storage();
  let release;
  driver.setItem = async (key, value) => { await new Promise(resolve => { release = resolve; }); driver.entries.set(key, value); };
  const store = createPurchaseDraftStore(driver);
  const save = store.save('u', 'o', purchase());
  await new Promise(resolve => setImmediate(resolve));
  const discard = store.remove('u', 'o');
  release();
  await save;
  assert.equal(await discard, true);
  assert.equal((await createPurchaseDraftStore(driver).read('u', 'o')).draft, null);
});

test('failed cleanup is explicit and does not restore a completed draft in the same session', async () => {
  const driver = storage();
  const store = createPurchaseDraftStore(driver);
  await store.save('u', 'o', purchase());
  driver.removeItem = async () => { throw new Error('blocked'); };
  assert.equal(await store.remove('u', 'o'), false);
  assert.equal((await store.read('u', 'o')).draft, null);
  // Persistent storage could not be cleared: a reload retains the operation key,
  // allowing the server to return the existing prepared order, never a duplicate.
  assert.equal((await createPurchaseDraftStore(driver).read('u', 'o')).draft.purchaseKey, 'same-operation-key');
});

test('saving without an account cannot create a private draft', async () => {
  const driver = storage();
  const result = await createPurchaseDraftStore(driver).save('', 'o', purchase());
  assert.equal(result.saved, false);
  assert.equal(driver.entries.size, 0);
});
