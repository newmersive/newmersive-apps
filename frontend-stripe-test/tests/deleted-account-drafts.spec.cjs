const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/load-typescript.cjs');
function storage(enumerable = false) {
  const entries = new Map();
  return { entries,
    getItem: async key => entries.get(key) || null,
    setItem: async (key, value) => { entries.set(key, value); },
    removeItem: async key => { entries.delete(key); },
    getAllKeys: async () => [...entries.keys()],
    ...(enumerable ? { listKeys: async () => [...entries.keys()] } : {}),
  };
}
function journeys(driver) { return load('src/utils/journeyDrafts.ts', { '@react-native-async-storage/async-storage': driver }); }
const { createPurchaseDraftStore } = load('src/utils/purchaseDraft.ts', { 'react-native': { Platform: { OS: 'web' } }, 'expo-secure-store': {} });
const draft = () => ({quantity:1,step:2,purchaseKey:'test-key',delivery:{deliveryMethod:'shipping',deliveryChannel:'seller',deliveryRecipientName:'Private recipient',deliveryAddress:'Private address'}});
const tick = () => new Promise(resolve => setImmediate(resolve));
test('deleting a journey account removes all its operations and preserves another account with a similar ID', async () => {
  const driver=storage(), api=journeys(driver);
  await api.writeJourneyDraft('a','manual-request',{text:'oranges'});
  await api.writeJourneyDraft('a','catalog-offer',{title:'table'});
  await api.writeJourneyDraft('a:b','manual-request',{text:'keep'});
  assert.equal(await api.purgeJourneyDrafts('a'),true);
  assert.equal(await api.readJourneyDraft('a','manual-request'),null);
  assert.deepEqual(await api.readJourneyDraft('a:b','manual-request'),{text:'keep'});
  assert.equal([...driver.entries.keys()].filter(k=>k.startsWith('allwain:journey:v1:a:')).length,0);
  assert.equal(await journeys(driver).writeJourneyDraft('a','new-operation',{text:'stale component'}),false);
});
test('journey deletion drains an in-flight write and prevents a late component from restoring the account', async () => {
  const driver=storage();let release;
  const original=driver.setItem;
  driver.setItem=async(k,v)=>{if(k.startsWith('allwain:journey:v1:'))await new Promise(r=>{release=r;});await original(k,v);};
  const api=journeys(driver),write=api.writeJourneyDraft('a','manual-request',{text:'private'});
  await tick();const purge=api.purgeJourneyDrafts('a');
  assert.equal(await api.writeJourneyDraft('a','manual-request',{text:'late'}),false);
  release();await write;assert.equal(await purge,true);
  assert.equal([...driver.entries.keys()].filter(k=>k.startsWith('allwain:journey:v1:a:')).length,0);
});
test('journey cleanup failure is reported, blocks access and can be retried', async () => {
  const driver=storage(),api=journeys(driver);await api.writeJourneyDraft('a','list',{text:'private'});
  const remove=driver.removeItem;driver.removeItem=async()=>{throw Error('storage blocked');};
  assert.equal(await api.purgeJourneyDrafts('a'),false);
  assert.equal(await journeys(driver).readJourneyDraft('a','list'),null);
  driver.removeItem=remove;assert.equal(await api.purgeJourneyDrafts('a'),true);
});
test('native-style account index lets a fresh instance erase all purchase drafts and keep another account', async () => {
  const driver=storage(),first=createPurchaseDraftStore(driver);
  await first.save('a','offer-1',draft());await first.save('a','offer-2',draft());await first.save('a.b','offer-1',draft());
  const reloaded=createPurchaseDraftStore(driver);assert.equal(await reloaded.purgeAccount('a'),true);
  const after=createPurchaseDraftStore(driver);
  assert.equal((await after.read('a','offer-1')).draft,null);
  assert.equal((await after.save('a','offer-3',draft())).saved,false);
  assert.equal((await after.read('a.b','offer-1')).draft.delivery.deliveryAddress,'Private address');
  assert.equal([...driver.entries.values()].filter(v=>v.includes('"userId":"a"')).length,0);
});
test('purchase deletion drains an in-flight private write and blocks pending reads and later saves', async () => {
  const driver=storage();let release;const original=driver.setItem;
  driver.setItem=async(k,v)=>{if(k.startsWith('allwain.purchase.v1.'))await new Promise(r=>{release=r;});await original(k,v);};
  const store=createPurchaseDraftStore(driver),save=store.save('a','one',draft());
  await tick();const purge=store.purgeAccount('a');
  assert.equal((await store.save('a','two',draft())).saved,false);
  assert.equal((await store.read('a','one')).draft,null);
  release();await save;assert.equal(await purge,true);
  assert.equal([...driver.entries.values()].filter(v=>v.includes('Private address')).length,0);
});
test('web cleanup enumerates legacy drafts without an index, scoped to the deleted account', async () => {
  const driver=storage(true),initial=createPurchaseDraftStore(driver);
  await initial.save('a','legacy',draft());await initial.save('b','keep',draft());
  for(const k of [...driver.entries.keys()])if(k.startsWith('allwain.purchase.index.'))driver.entries.delete(k);
  assert.equal(await createPurchaseDraftStore(driver).purgeAccount('a'),true);
  assert.equal([...driver.entries.values()].filter(v=>v.includes('"userId":"a"')).length,0);
  assert.ok((await createPurchaseDraftStore(driver).read('b','keep')).draft);
});
test('a persistent deletion barrier prevents recovery of an unindexed legacy native draft', async () => {
  const driver=storage(),initial=createPurchaseDraftStore(driver);await initial.save('a','legacy',draft());
  for(const k of [...driver.entries.keys()])if(k.startsWith('allwain.purchase.index.'))driver.entries.delete(k);
  await createPurchaseDraftStore(driver).purgeAccount('a');
  // SecureStore has no enumeration API: the barrier protects this older key
  // until an attempted access identifies it and deletes it physically.
  assert.equal([...driver.entries.values()].filter(v=>v.includes('Private address')).length,1);
  assert.equal((await createPurchaseDraftStore(driver).read('a','legacy')).draft,null);
  assert.equal([...driver.entries.values()].filter(v=>v.includes('Private address')).length,0);
});
test('failed purchase erasure retains a retry index while preventing recovery across restart', async () => {
  const driver=storage(),store=createPurchaseDraftStore(driver);await store.save('a','one',draft());
  const remove=driver.removeItem;driver.removeItem=async()=>{throw Error('storage blocked');};
  assert.equal(await store.purgeAccount('a'),false);
  assert.equal((await createPurchaseDraftStore(driver).read('a','one')).draft,null);
  driver.removeItem=remove;assert.equal(await createPurchaseDraftStore(driver).purgeAccount('a'),true);
  assert.equal([...driver.entries.values()].filter(v=>v.includes('Private address')).length,0);
});
test('a tampered account index cannot delete another account', async () => {
  const driver=storage(),store=createPurchaseDraftStore(driver);await store.save('a','one',draft());await store.save('b','keep',draft());
  const aIndex=[...driver.entries.keys()].find(k=>k.startsWith('allwain.purchase.index.')&&k.endsWith('.61'));
  const bDraft=[...driver.entries.keys()].find(k=>k.startsWith('allwain.purchase.v1.62.'));
  driver.entries.set(aIndex,JSON.stringify([bDraft]));
  assert.equal(await createPurchaseDraftStore(driver).purgeAccount('a'),false);
  assert.equal(await createPurchaseDraftStore(driver).purgeAccount('a'),false);
  assert.equal(driver.entries.get(aIndex),JSON.stringify([bDraft]));
  assert.ok((await createPurchaseDraftStore(driver).read('b','keep')).draft);
});

test('a journey read already in storage cannot return deleted account data', async () => {
  const driver=storage(),api=journeys(driver);await api.writeJourneyDraft('a','list',{text:'private'});
  const get=driver.getItem;let release;
  driver.getItem=async key=>{
    const raw=await get(key);
    if(key.startsWith('allwain:journey:v1:'))await new Promise(resolve=>{release=resolve;});
    return raw;
  };
  const read=api.readJourneyDraft('a','list');await tick();
  assert.equal(await api.purgeJourneyDrafts('a'),true);
  release();assert.equal(await read,null);
});

test('a purchase read already in storage cannot return deleted delivery details', async () => {
  const driver=storage();await createPurchaseDraftStore(driver).save('a','one',draft());
  const get=driver.getItem;let release;
  driver.getItem=async key=>{
    const raw=await get(key);
    if(key.startsWith('allwain.purchase.v1.'))await new Promise(resolve=>{release=resolve;});
    return raw;
  };
  const store=createPurchaseDraftStore(driver),read=store.read('a','one');await tick();
  const purge=store.purgeAccount('a');release();
  assert.equal((await read).draft,null);assert.equal(await purge,true);
});

test('failure to persist either deletion barrier is reported and retries can finish cleanup', async () => {
  const driver=storage(),journey=journeys(driver),purchase=createPurchaseDraftStore(driver);
  await journey.writeJourneyDraft('a','list',{text:'private'});await purchase.save('a','one',draft());
  const set=driver.setItem;
  driver.setItem=async(k,v)=>{if(k.includes('deleted'))throw Error('marker blocked');await set(k,v);};
  assert.equal(await journey.purgeJourneyDrafts('a'),false);
  assert.equal(await purchase.purgeAccount('a'),false);
  assert.equal((await purchase.read('a','one')).draft,null);
  assert.equal(await journey.readJourneyDraft('a','list'),null);
  driver.setItem=set;
  assert.equal(await journey.purgeJourneyDrafts('a'),true);
  assert.equal(await purchase.purgeAccount('a'),true);
  assert.equal((await createPurchaseDraftStore(driver).save('a','new',draft())).saved,false);
  assert.equal(await journeys(driver).writeJourneyDraft('a','new',{text:'late'}),false);
});
