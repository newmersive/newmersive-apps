const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), crypto = require('node:crypto'), ts = require('typescript');
const load = require('./helpers/load-typescript.cjs');
const settle = async () => { for (let i=0;i<8;i++) await new Promise(done=>setImmediate(done)); };
const latch = () => { let resolve; const promise=new Promise(done=>resolve=done); return {promise,resolve}; };
const transaction = environment => `aw_${environment}_${'a'.repeat(32)}`;
const paid = (patch={}) => ({id:'order-public-opaque',buyerUserId:'buyer',sellerUserId:'seller',contractId:'agreement',paymentStatus:'paid',totalAmount:2365000,currency:'EUR',purchaseAnalytics:{version:1,transactionId:transaction('test'),paymentEnvironment:'test',currency:'EUR',value:23650},...patch});
function fixture(storageRows=new Map()) {
  const events=[],operations=[];let granted=true,revision=1;
  const storage={failRead:false,failWrite:false,failRemove:false,hold:null,async getItem(key){operations.push(['get',key]);if(this.hold)await this.hold.promise;if(this.failRead)throw Error('read');return storageRows.get(key)||null;},async setItem(key,value){operations.push(['set',key,value]);if(this.failWrite)throw Error('write');storageRows.set(key,value);},async removeItem(key){operations.push(['remove',key]);if(this.failRemove)throw Error('remove');storageRows.delete(key);}};
  const sdk={hold:null,accepted:true};
  const index={getAnalyticsConsentSnapshot:()=>{const captured=revision;return {granted,revision:captured,isCurrent:()=>granted&&revision===captured};},async trackAnalyticsEvent(name,params,current){if(sdk.hold)await sdk.hold.promise;if(!granted||!current?.()||!sdk.accepted)return false;events.push({name,params});return true;}};
  const helper=load('src/analytics/purchaseAnalytics.ts',{'@react-native-async-storage/async-storage':{__esModule:true,default:storage},'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_,value)=>crypto.createHash('sha256').update(value).digest('hex')},'./index':index});
  return {helper,events,storage,storageRows,operations,sdk,consent:next=>{granted=next;revision++;}};
}
// Reuse existing source interaction fixtures without registering their tests.
// The only substitution added is their isolated telemetry import: the real
// instrumentation helper runs with the SDK/storage fixture above.
function screenFixture(relative,helper,exports) {
  const filename=path.resolve(__dirname,relative),source=fs.readFileSync(filename,'utf8');
  const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  let body=ast.statements.filter(statement=>!((ts.isExpressionStatement(statement)&&ts.isCallExpression(statement.expression)&&['test','it'].includes(statement.expression.expression.getText(ast)))||((ts.isForStatement(statement)||ts.isForOfStatement(statement))&&/\b(?:test|it)\(/.test(statement.getText(ast))))).map(statement=>statement.getText(ast)).join('\n');
  if (relative === 'offer-management-source.spec.cjs') body=body.replace('restoreDiscoveryQuery,','restoreDiscoveryQuery, publishCheckoutOrder,');
  const compiled=new Module(filename);compiled.paths=Module._nodeModulePaths(path.dirname(filename));const original=Module.createRequire(filename);
  compiled.require=name=>name==='./helpers/analytics-instrumentation-noop.cjs'?helper:original(name);
  compiled._compile(body+`\nmodule.exports={${exports.join(',')}};`,filename);
  return compiled.exports;
}
const events = (f,name) => f.events.filter(event=>event.name===name);
function nodes(tree) {return [tree,...(tree?.props?.children||[]).flat(Infinity).filter(child=>child&&typeof child==='object').flatMap(nodes)];}

test('purchase requires server paid proof, buyer actor and buy role; historical environment never comes from current config',async()=>{
  const f=fixture();const valid=paid();
  for(const order of [paid({paymentStatus:'payment_method_saved'}),paid({paymentStatus:'checkout_open'}),paid({paymentStatus:'payment_processing'}),paid({buyerUserId:'other'}),paid({purchaseAnalytics:null}),paid({purchaseAnalytics:{...valid.purchaseAnalytics,value:1}}),paid({purchaseAnalytics:{...valid.purchaseAnalytics,paymentEnvironment:'live'}}),paid({purchaseAnalytics:{...valid.purchaseAnalytics,transactionId:'buyer@example.test'}})])await f.helper.observeConfirmedPurchases([order],'buyer','buy',()=>true);
  await f.helper.observeConfirmedPurchases([valid],'buyer','sell',()=>true);await f.helper.observeConfirmedPurchases([valid],'buyer','connector',()=>true);assert.equal(f.events.length,0);
  await f.helper.observeConfirmedPurchases([valid],'buyer','buy',()=>true);assert.deepEqual(events(f,'purchase')[0].params,{transaction_id:transaction('test'),currency:'EUR',value:23650,payment_environment:'test'});
});
test('purchase is serialized, persistently deduplicated across reloads and separated by account and confirmed test/live transaction',async()=>{
  const f=fixture();await Promise.all(Array.from({length:5},()=>f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true)));assert.equal(events(f,'purchase').length,1);
  const reopened=fixture(f.storageRows);await reopened.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true);assert.equal(reopened.events.length,0);
  const live=paid({purchaseAnalytics:{...paid().purchaseAnalytics,transactionId:transaction('live'),paymentEnvironment:'live'}});await reopened.helper.observeConfirmedPurchases([live],'buyer','buy',()=>true);assert.equal(events(reopened,'purchase').length,1);
  await reopened.helper.observeConfirmedPurchases([paid({buyerUserId:'another-account'})],'another-account','buy',()=>true);assert.equal(events(reopened,'purchase').length,2);
  for(const [key,value]of f.storageRows){assert.match(key,/^allwain:analytics:purchase:v1:[a-f0-9]{64}$/);assert.equal(value,'1');assert.doesNotMatch(key,/buyer|order-public|@|test/);}
});
test('denied, changed consent and a retired session prevent SDK purchase and leave no falsely emitted marker',async()=>{
  const f=fixture();f.consent(false);await f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true);assert.equal(f.operations.length,0);
  f.consent(true);const gate=latch();f.sdk.hold=gate;const work=f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true);await settle();f.consent(false);f.consent(true);gate.resolve();await work;assert.equal(f.events.length,0);assert.equal(f.storageRows.size,0);
  f.sdk.hold=null;let current=true;f.storage.hold=latch();const stale=f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>current);await settle();current=false;f.storage.hold.resolve();await stale;assert.equal(f.events.length,0);assert.equal(f.storageRows.size,0);
  f.storage.hold=null;await f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true);assert.equal(events(f,'purchase').length,1);
});
test('failed read/write prevents purchase; retry is authorized, while ambiguous SDK/marker cleanup never blindly duplicates',async()=>{
  for(const field of ['failRead','failWrite']){const f=fixture();f.storage[field]=true;await f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true);assert.equal(f.events.length,0);f.storage[field]=false;await f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true);assert.equal(events(f,'purchase').length,1);}
  const f=fixture();f.sdk.accepted=false;f.storage.failRemove=true;await f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true);assert.equal(f.events.length,0);f.sdk.accepted=true;f.storage.failRemove=false;await f.helper.observeConfirmedPurchases([paid()],'buyer','buy',()=>true);assert.equal(f.events.length,0,'uncertain persistent marker favors no duplicate over claiming delivery');
});
test('discovery waits for all successful applied-query streams, ignores stale/append reads and deduplicates retries/rerenders',async()=>{
  const f=fixture(),state=f.helper.createDiscoveryAnalyticsState();const base={state,scope:'actor-session',queryKey:'applied',query:{q:'Sensitive personal text',locationLabel:'Private address',minPrice:'1999',currency:'EUR',unit:'ud'},surface:'market_requests',appMode:'sell',current:()=>true,expectedStreams:['requests','lists']};
  await f.helper.recordDiscoveryResults({...base,stream:'requests',resultCount:0});assert.equal(f.events.length,0);
  await f.helper.recordDiscoveryResults({...base,stream:'lists',resultCount:0,current:()=>false});assert.equal(f.events.length,0);
  await f.helper.recordDiscoveryResults({...base,stream:'lists',resultCount:0});assert.deepEqual(f.events.map(e=>e.name),['search_executed','search_zero_results']);
  await f.helper.recordDiscoveryResults({...base,stream:'lists',resultCount:0});await f.helper.recordDiscoveryResults({...base,stream:'requests',resultCount:0,append:true});assert.equal(f.events.length,2);assert.doesNotMatch(JSON.stringify(f.events),/Sensitive|Private|1999|actor-session|applied/);
});
test('filters emit only changed applied query and only fixed booleans/counts; guards capture consent before the async action',async()=>{
  const f=fixture(),state=f.helper.createDiscoveryAnalyticsState(),base={state,scope:'opaque',queryKey:'B',query:{q:'a@example.test',category:'private free category',minPrice:'1234',maxPrice:'4321',locationLabel:'Home street',radiusKm:10,latitude:39.7,longitude:-0.3,status:'active',sort:'newest'},surface:'offers',appMode:'buy',current:()=>true};
  await f.helper.recordAppliedFilters(base,'B');assert.equal(f.events.length,0);await f.helper.recordAppliedFilters(base,'A');await f.helper.recordAppliedFilters(base,'A');assert.equal(events(f,'filters_applied').length,1);assert.equal(f.events[0].params.category_filter,true);assert.equal(f.events[0].params.price_filter,true);assert.equal(f.events[0].params.location_filter,true);assert.equal(f.events[0].params.status_filter,true);assert.doesNotMatch(JSON.stringify(f.events),/example|free category|1234|4321|Home|39.7/);
  const captured=f.helper.captureAnalyticsGuard(()=>true);f.consent(false);f.consent(true);await f.helper.recordPublicationWithdrawal('catalog','sell',captured);assert.equal(events(f,'publication_withdrawn').length,0);
});
test('actual Offers load and append observe only server-paid buyer orders and keep SDK purchase deduplicated',async()=>{
  const f=fixture(),source=screenFixture('offer-management-source.spec.cjs',f.helper,['harness','offer']);const h=source.harness({get:async url=>url.includes('/payments/activity')?{contracts:[],orders:[paid({buyerUserId:'seller-a'})],pageInfo:{hasNextPage:true,nextCursor:'later'}}:{items:[],pageInfo:{}}});h.switchRole('buy');h.view=h.render();await h.view.loadData();await settle();h.view=h.render();assert.equal(events(f,'purchase').length,1);await h.view.loadMoreActivity();await settle();assert.equal(events(f,'purchase').length,1);assert.equal(h.gets.filter(url=>url.includes('/payments/activity')).length,2);assert.equal(h.writes.length,0);
});
test('actual Offers contracts or setup acceptance without confirmed order payment never emit purchase',async()=>{
  for(const paymentStatus of ['payment_method_saved','checkout_open','payment_processing']){const f=fixture(),source=screenFixture('offer-management-source.spec.cjs',f.helper,['harness']);const h=source.harness({get:async url=>url.includes('/payments/activity')?{contracts:[{id:'contract',requesterUserId:'seller-a',paymentStatus:'paid'}],orders:[paid({buyerUserId:'seller-a',paymentStatus})],pageInfo:{}}:{items:[],pageInfo:{}}});h.switchRole('buy');h.view=h.render();await h.view.loadData();await settle();assert.equal(events(f,'purchase').length,0);}
});
test('actual confirmed checkout detail publisher logs payment proof once without telemetry requests',async()=>{
  const f=fixture(),source=screenFixture('offer-management-source.spec.cjs',f.helper,['harness']);const h=source.harness();h.switchRole('buy');h.view=h.render();h.view.publishCheckoutOrder(paid({buyerUserId:'seller-a',paymentStatus:'checkout_open'}));await settle();assert.equal(events(f,'purchase').length,0);h.view.publishCheckoutOrder(paid({buyerUserId:'seller-a'}));await settle();h.view=h.render();h.view.publishCheckoutOrder(paid({buyerUserId:'seller-a'}));await settle();assert.equal(events(f,'purchase').length,1);assert.equal(h.gets.length,0);assert.equal(h.writes.length,0);
});
test('actual Offers prefetch while showing orders is not counted as a zero discovery query',async()=>{
  const f=fixture(),source=screenFixture('offer-management-source.spec.cjs',f.helper,['harness']);const h=source.harness();await h.view.loadData();await settle();assert.equal(events(f,'search_executed').length,0);assert.equal(events(f,'search_zero_results').length,0);h.view.setters.setSellerSection('offers');h.view=h.render();await h.view.loadData();await settle();assert.equal(events(f,'search_executed').length,2);assert.equal(events(f,'search_zero_results').length,2);await h.view.loadData();await settle();assert.equal(events(f,'search_executed').length,2);
});
test('actual Offers withdrawal emits after matching server receipt only; wrong and late account receipts never emit',async()=>{
  const f=fixture(),source=screenFixture('offer-management-source.spec.cjs',f.helper,['harness','offer']);const h=source.harness();await h.view.changeOfferStatus(source.offer(),'closed');await settle();assert.deepEqual(events(f,'publication_withdrawn').map(e=>e.params),[{publication_type:'catalog',app_mode:'sell'}]);
  const bad=source.harness({patch:async()=>source.offer({id:'other',allwainStatus:'closed'})});await bad.view.changeOfferStatus(source.offer(),'closed');await settle();assert.equal(events(f,'publication_withdrawn').length,1);
  const gate=latch(),late=source.harness({patch:()=>gate.promise});const work=late.view.changeOfferStatus(source.offer(),'closed');late.switchAccount('other');gate.resolve(source.offer({allwainStatus:'closed'}));await work;assert.equal(events(f,'publication_withdrawn').length,1);
});
test('actual Market partial failure and old A after B cannot falsely log zero; successful retry logs one query result',async()=>{
  const f=fixture(),source=screenFixture('market-list-discovery-source.spec.cjs',f.helper,['harness','page','request','list','pending','button']);const h=source.harness('MarketRequestsScreen');await settle();h.apply({q:'A'});await settle();const aRequest=source.pending(h,'/market/requests','A'),aList=source.pending(h,'/shopping-lists/market','A');h.apply({q:'B',category:'alimentacion'});await settle();source.pending(h,'/market/requests','B').resolve(source.page([]));source.pending(h,'/shopping-lists/market','B').reject(Error('offline'));aRequest.resolve(source.page([]));aList.resolve(source.page([]));await settle();assert.equal(events(f,'search_zero_results').length,0);assert.equal(events(f,'search_executed').length,0);
  source.button(h.tree,'Reintentar').props.onPress();await settle();h.requests.at(-1).resolve(source.page([source.list('visible')]));await settle();assert.equal(events(f,'search_executed').length,1);assert.equal(events(f,'search_executed')[0].params.result_count,1);assert.equal(events(f,'search_zero_results').length,0);h.unmount();
});
test('actual Shopping overview filters/results use applied query and suppress late results after account switch',async()=>{
  const f=fixture(),source=screenFixture('market-list-discovery-source.spec.cjs',f.helper,['harness','page','pending']);const h=source.harness('ShoppingListsScreen');await settle();h.apply({q:'Personal label',locationLabel:'Home',responseStatus:'none'});await settle();const read=source.pending(h,'/shopping-lists/market','Personal label');read.resolve(source.page([]));await settle();assert.equal(events(f,'search_executed').length,1);assert.equal(events(f,'search_zero_results').length,1);assert.equal(events(f,'filters_applied').length,1);assert.doesNotMatch(JSON.stringify(f.events),/Personal|Home/);
  h.apply({q:'late'});await settle();const stale=source.pending(h,'/shopping-lists/market','late');h.switchAccount('other');stale.resolve(source.page([]));await settle();assert.equal(events(f,'search_executed').length,1);h.unmount();
});
test('actual Search records zero only after catalog and supplementary search confirm; errors are not zero searches',async()=>{
  const f=fixture(),source=screenFixture('discovery-filters.spec.cjs',f.helper,['harness','offer','find']);const h=source.harness({initialQuery:{q:'washing'},get:async url=>url.includes('/search?')?Promise.reject(Error('offline')):{items:[],pageInfo:{}}});await h.flush();await new Promise(done=>setTimeout(done,310));await h.flush();assert.equal(events(f,'search_zero_results').length,0);assert.equal(events(f,'search_executed').length,0);h.unmount();
  const filtered=source.harness({initialQuery:{q:'washing',category:'electrodomesticos'},get:async()=>({items:[],pageInfo:{}})});await filtered.flush();assert.equal(events(f,'search_zero_results').length,1);filtered.render();await filtered.flush();assert.equal(events(f,'search_zero_results').length,1);filtered.unmount();
});
test('actual list proposal withdrawal tracks a matching receipt even when refresh fails, but not an invalid receipt',async()=>{
  const f=fixture(),source=screenFixture('shopping-proposal-lifecycle.spec.cjs',f.helper,['componentHarness','list','withdrawalReceipt','action']);const h=source.componentHarness(source.list(),{post:async()=>source.withdrawalReceipt(),get:async()=>{throw Error('offline');}});await settle();h.render();source.action(h.tree,'Retirar propuesta').props.onPress();h.alerts.at(-1).buttons[1].onPress();await settle();assert.equal(events(f,'publication_withdrawn').length,1);assert.equal(events(f,'publication_withdrawn')[0].params.publication_type,'proposal');
  const bad=source.componentHarness(source.list(),{post:async()=>source.withdrawalReceipt({id:'foreign'}),get:async()=>{throw Error('offline');}});await settle();bad.render();source.action(bad.tree,'Retirar propuesta').props.onPress();bad.alerts.at(-1).buttons[1].onPress();await settle();assert.equal(events(f,'publication_withdrawn').length,1);
});
test('actual Scan request withdrawal emits only after server confirms owned cancellation; account change suppresses it',async()=>{
  const f=fixture(),source=screenFixture('buyer-request-lifecycle.spec.cjs',f.helper,['screenHarness','request','findButton','copies']);const h=source.screenHarness({detail:true,item:source.request('submitted')});await h.flush();source.findButton(h.tree,source.copies.es.actions.withdraw.label).props.onPress();h.alerts.at(-1)[2][1].onPress();await h.flush();assert.deepEqual(events(f,'publication_withdrawn').at(-1).params,{publication_type:'request',app_mode:'buy'});h.unmount();
  const gate=latch(),late=source.screenHarness({detail:true,item:source.request('submitted'),patch:()=>gate.promise});await late.flush();source.findButton(late.tree,source.copies.es.actions.withdraw.label).props.onPress();late.alerts.at(-1)[2][1].onPress();await settle();late.switchAccount('other');gate.resolve(source.request('canceled'));await late.flush();assert.equal(events(f,'publication_withdrawn').length,1);late.unmount();
});
