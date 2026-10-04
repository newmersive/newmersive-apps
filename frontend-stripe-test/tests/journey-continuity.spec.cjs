const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('./helpers/load-typescript.cjs');

function storage() {
  const values = new Map();
  return { values, getItem: async key => values.get(key) || null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
}
function moduleWithStore(file) {
  const store = storage();
  return { store, api: load(file, { '@react-native-async-storage/async-storage': store }) };
}

test('drafts are isolated by account and operation and expire without mixing users', async () => {
  const { api, store } = moduleWithStore('src/utils/journeyDrafts.ts');
  await api.writeJourneyDraft('buyer-a', 'manual-request', { requestText: '15 kg oranges' });
  assert.equal(await api.readJourneyDraft('buyer-b', 'manual-request'), null);
  assert.equal(await api.readJourneyDraft('buyer-a', 'shopping-list'), null);
  assert.equal((await api.readJourneyDraft('buyer-a', 'manual-request')).requestText, '15 kg oranges');
  const [key, raw] = [...store.values][0];
  store.values.set(key, JSON.stringify({ ...JSON.parse(raw), expiresAt: Date.now() - 1 }));
  assert.equal(await api.readJourneyDraft('buyer-a', 'manual-request'), null);
  assert.equal(store.values.size, 0);
});

test('draft writer rejects captured evidence, precise contact fields, tokens and consent', async () => {
  const { api, store } = moduleWithStore('src/utils/journeyDrafts.ts');
  for (const value of [{ token: 'secret' }, { items: [{ imageBase64: 'private' }] }, { deliveryAddress: 'private' }, { shippingPhone: 'private' }, { consent: true }, { text: 'data:image/png;base64,private' }]) {
    assert.equal(await api.writeJourneyDraft('buyer', 'operation', value), false);
  }
  assert.equal(store.values.size, 0);
});

test('queued draft writes cannot reappear after an explicit discard', async () => {
  const { api } = moduleWithStore('src/utils/journeyDrafts.ts');
  const writes = [api.writeJourneyDraft('a', 'list', { title: 'one' }), api.writeJourneyDraft('a', 'list', { title: 'two' }), api.clearJourneyDraft('a', 'list')];
  await Promise.all(writes);
  assert.equal(await api.readJourneyDraft('a', 'list'), null);
});

test('checked draft APIs distinguish a failed read from an absent draft and preserve legacy readers', async () => {
  const { api, store } = moduleWithStore('src/utils/journeyDrafts.ts');
  assert.deepEqual(await api.readJourneyDraftChecked('a', 'list'), { status: 'missing', value: null });
  await api.writeJourneyDraft('a', 'list', { title: 'Mi propuesta' });
  store.getItem = async () => { throw Error('storage unavailable'); };
  assert.deepEqual(await api.readJourneyDraftChecked('a', 'list'), { status: 'failed', value: null });
  assert.equal(await api.readJourneyDraft('a', 'list'), null);
});

test('checked discard reports failure, does not erase the saved draft and can be retried', async () => {
  const { api, store } = moduleWithStore('src/utils/journeyDrafts.ts');
  await api.writeJourneyDraft('a', 'list', { title: 'Conservar' });
  const remove = store.removeItem;
  store.removeItem = async () => { throw Error('storage unavailable'); };
  assert.equal(await api.clearJourneyDraftChecked('a', 'list'), false);
  assert.equal((await api.readJourneyDraftChecked('a', 'list')).value.title, 'Conservar');
  store.removeItem = remove;
  assert.equal(await api.clearJourneyDraftChecked('a', 'list'), true);
  assert.equal((await api.readJourneyDraftChecked('a', 'list')).status, 'missing');
});

test('untrusted return routes are rejected and URL parameters are reduced to permitted identifiers', () => {
  const { api } = moduleWithStore('src/utils/pendingJourney.ts');
  for (const url of ['https://evil.example/app/ofertas', '//evil.example/app/ofertas', 'javascript:alert(1)', 'https://allwain.es.evil/app/ofertas', 'https://user@allwain.es/app/ofertas', '/app/administracion', '/app/ofertas/../../administracion', 'allwain://user@ofertas']) assert.equal(api.journeyFromUrl(url), null, url);
  assert.deepEqual(api.journeyFromUrl('https://allwain.es/app/ofertas?orderId=order_123&section=orders&token=secret&checkout=success&email=private'), { name: 'MainTabs', params: { screen: 'Ofertas', params: { orderId: 'order_123', section: 'orders' } } });
  assert.deepEqual(api.journeyFromUrl('allwain://peticion?requestId=request-1&imageBase64=private'), { name: 'ScanResult', params: { requestId: 'request-1' } });
  assert.deepEqual(api.journeyFromUrl('/app/listas?create=true&shoppingListId=../../private'), { name: 'ShoppingLists', params: { create: true } });
  assert.equal(api.safeJourney({ name: 'AdminDashboard' }), null);
});

test('pending login target is account-bound, single-use, and expiring', async () => {
  const { api, store } = moduleWithStore('src/utils/pendingJourney.ts');
  await api.rememberPendingJourney({ name: 'ManualRequest', params: { resetToken: 'private' } }, 'a');
  assert.equal(await api.consumePendingJourney('b'), null);
  await api.rememberPendingJourney({ name: 'ShoppingLists', params: { create: true } }, 'a');
  assert.deepEqual(await api.consumePendingJourney('a'), { name: 'ShoppingLists', params: { create: true } });
  assert.equal(await api.consumePendingJourney('a'), null);
  await api.rememberPendingJourney({ name: 'ManualRequest' });
  const [key, raw] = [...store.values][0];
  store.values.set(key, JSON.stringify({ ...JSON.parse(raw), expiresAt: Date.now() - 1 }));
  assert.equal(await api.consumePendingJourney('a'), null);
});
