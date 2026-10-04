const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs');
const pure = load('src/utils/discoveryFilters.ts', { react: {}, './journeyDrafts': {} });
const copies = load('src/i18n/discoveryFilterCopy.ts');
const requestCopy = load('src/i18n/requestCopy.ts').requestCopy;
const lifecycleCopy = load('src/i18n/buyerRequestLifecycleCopy.ts').buyerRequestLifecycleCopy;
const lifecycle = load('src/utils/requestLifecycle.ts');
const colors = load('src/theme/colors.ts').colors;
const catalogFields = ['q','category','subcategory','productKind','unit','currency','minPrice','maxPrice','locationLabel','dateFrom','dateTo','sort'];
const requestFields = [...catalogFields.filter(field => field !== 'sort'), 'status','latitude','longitude','radiusKm'];
const offer = (id='orange') => ({ id, title: id, ownerUserId: 'seller', provider: { id: 'seller', name: 'Shop' }, price: 1, currency: 'EUR', meta: { unit: 'kg' } });
const request = (status='submitted', id='r') => ({ id, userId: 'buyer', status, title: id, extracted: { productName: id }, offers: [] });

test('query identity uses applied canonical fields, valid proximity, and equivalent units for price order', () => {
  assert.equal(pure.normalizeDiscoveryQuery({ q: ' oranges ', sort: 'price_asc' }).sort, 'newest');
  assert.equal(pure.normalizeDiscoveryQuery({ unit:'kg',currency:'EUR',sort:'price_asc' }).sort, 'price_asc');
  assert.equal(pure.discoveryQueryKey({q:' orange ',unit:'kg'}), pure.discoveryQueryKey({unit:'kg',q:'orange'}));
  assert.notEqual(pure.discoveryQueryKey({q:'orange',category:'alimentacion'}), pure.discoveryQueryKey({q:'orange',category:'electrodomesticos'}));
  assert.equal(pure.normalizeDiscoveryQuery({latitude:91,longitude:0,radiusKm:10}).latitude, undefined);
  assert.equal(pure.normalizeDiscoveryQuery({latitude:39.7,longitude:-0.3,radiusKm:10}).radiusKm, 10);
});
test('URL uses only endpoint supported fields, fixed owner/history scopes cannot be weakened, cursor stays opaque', () => {
  const url = new URL(pure.discoveryPageUrl('/allwain/scan-requests',{q:'lavadora',status:'archived',unit:'ud',currency:'EUR',paymentStatus:'paid'}, {fixed:{status:'submitted'},cursor:'a&b=?',allowed:requestFields}), 'https://test.invalid');
  assert.equal(url.searchParams.get('q'),'lavadora'); assert.equal(url.searchParams.get('status'),'submitted');
  assert.equal(url.searchParams.get('paymentStatus'),null); assert.equal(url.searchParams.get('cursor'),'a&b=?');
});
test('invalid and incompatible price/date ranges are rejected before applying', () => {
  assert.equal(pure.discoveryQueryValidation({minPrice:'1'}),'priceUnit');
  assert.equal(pure.discoveryQueryValidation({minPrice:'3',maxPrice:'2',unit:'kg',currency:'EUR'}),'price');
  assert.equal(pure.discoveryQueryValidation({minPrice:'NaN',unit:'kg',currency:'EUR'}),'price');
  for (const dateFrom of ['2026-02-30','2026-99-12','2026-2-03']) assert.equal(pure.discoveryQueryValidation({dateFrom}),'date');
  assert.equal(pure.discoveryQueryValidation({dateFrom:'2026-10-02',dateTo:'2026-10-01'}),'date');
  assert.equal(pure.discoveryQueryValidation({proposalDeadlineAfter:'2026-10-10',proposalDeadlineBefore:'2026-10-04'}),'date');
  assert.equal(pure.discoveryQueryValidation({minPrice:'1,25',unit:'kg',currency:'EUR',dateFrom:'2026-10-04'}),null);
});
test('all six locales explain filters, comparison, temporary location, retry, and real order states', () => {
  for (const locale of ['es','en','fr','it','zh','ar']) {
    const copy = copies.discoveryFilterCopy[locale], orders = copies.discoveryOrderFilterCopy[locale];
    for (const key of ['filters','apply','clear','areaHint','locationHint','locationError','priceHint','invalidDate','error','retry']) assert.ok(copy[key].trim());
    assert.ok(copy.categories.electrodomesticos); for (const key of ['paid','payment_processing','payment_failed']) assert.ok(orders.paymentStates[key]);
    assert.ok(orders.fulfillmentStates.completed); assert.ok(orders.channels.local_connector);
    for (const key of ['draft','partially_accepted','accepted','rejected']) assert.ok(orders.contractStates[key]); assert.ok(orders.contract);
  }
});

function hooks() {
  const slots=[]; let index=0, pending=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((entry,i)=>Object.is(entry,b[i]));
  const react={
    createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState:value=>{const i=index++;if(!slots[i])slots[i]={value:typeof value==='function'?value():value};return [slots[i].value,update=>slots[i].value=typeof update==='function'?update(slots[i].value):update];},
    useRef:value=>{const i=index++;return slots[i]||=( {current:value} );},
    useCallback:(fn,deps)=>{const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useMemo:(fn,deps)=>{const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},
    useEffect:(fn,deps)=>{const i=index++,prev=slots[i];if(!prev||!same(prev.deps,deps)){slots[i]={deps};pending.push(()=>{prev?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  return {react,render(fn){index=0;const tree=fn(),run=pending;pending=[];run.forEach(fn=>fn());return tree;},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}
function source(relative, replacements) {
  const filename=path.resolve(__dirname,'..',relative),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
  mod.require=name=>{if(Object.hasOwn(replacements,name))return replacements[name];throw new Error('Unmocked '+name);};
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,filename);
  return mod.exports.default;
}
function find(node,type) { if(Array.isArray(node))return node.map(item=>find(item,type)).find(Boolean); if(node?.type===type || node?.type?.default===type)return node; return find(node?.props?.children||[],type); }
function harness({screen='search',get,initialQuery}={}) {
  const runtime=hooks(),calls=[],navigation=[],alerts=[];let account='buyer',mode='buy',sessionGeneration=1,query=pure.normalizeDiscoveryQuery(initialQuery||{}),tree;
  const auth=selector=>selector({user:{id:account,participation:{seller:{enabled:true}}},locale:'es',appMode:mode,setAppMode:async value=>{mode=value;}});
  auth.getState=()=>({user:{id:account},locale:'es',appMode:mode,setAppMode:async value=>{mode=value;}});
  const session={captureAuthSession:()=>{const generation=sessionGeneration;return {isCurrent:()=>generation===sessionGeneration};}};
  const api={apiAuthGet:async url=>{calls.push(['get',url]);return get?get(url):url.includes('contracts')?{items:[]}:url.includes('/search?')?{requests:[],products:[],sellers:[]}:{items:screen==='search'?[offer()]:[request()],pageInfo:{}};},apiAuthPost:async(url,body)=>{calls.push(['post',url,body]);return {};},apiAuthPatch:async(url,body)=>{calls.push(['patch',url,body]);return request(body.status);}};
  const rn={StyleSheet:{create:value=>value},Platform:{OS:'web'}};for(const name of ['View','Text','FlatList','TextInput','TouchableOpacity','ActivityIndicator','Modal','ScrollView'])rn[name]=name;
  const replacements={
    '../../analytics/purchaseAnalytics':require('./helpers/analytics-instrumentation-noop.cjs'),
    react:runtime.react,'react-native':rn,'@react-navigation/native':{useNavigation:()=>({navigate:(...args)=>navigation.push(args)}),useFocusEffect:fn=>runtime.react.useEffect(fn,[fn])},
    '../../config/api':api,'../../store/auth.store':{useAuthStore:auth},'../../store/authSessionBridge':session,
    '../../components/design-system':Object.fromEntries(['BigActionButton','OfferCard','PersonCard','ProductCard','PublicationImage','EmptyState'].map(key=>[key,key])),
    '../../components/DiscoveryFilters':{default:'DiscoveryFilters',CATALOG_DISCOVERY_FIELDS:catalogFields,REQUEST_DISCOVERY_FIELDS:requestFields},
    '../../utils/discoveryFilters':{...pure,useDiscoveryQuery:()=>({query,setQuery:value=>{query=pure.normalizeDiscoveryQuery(value);},ready:true})},
    '../../i18n/discoveryFilterCopy':copies,'../../i18n/useAppTranslation':{useAppTranslation:()=>({locale:'es',t:key=>key})},
    '../../theme/colors':{colors},'lucide-react-native':{},'../../utils/format':{formatCurrency:value=>String(value)},
    '../../components/OfferPurchaseWizard':{default:'OfferPurchaseWizard'},'../../utils/openExternalUrl':{},'../../utils/webAppUrl':{},'../../analytics':{},
    '../../i18n':{isRtlLocale:()=>false},'../../i18n/requestCopy':{requestCopy},'../../i18n/buyerRequestLifecycleCopy':{buyerRequestLifecycleCopy:lifecycleCopy},
    '../../utils/requestLifecycle':lifecycle,'../../utils/appAlert':{AppAlert:{alert:(...args)=>alerts.push(args)}},
  };
  const Screen=source(screen==='search'?'src/screens/Search/SearchScreen.tsx':'src/screens/Requests/MyRequestsScreen.tsx',replacements);
  const render=()=>tree=runtime.render(()=>Screen());
  render();
  return {calls,navigation,alerts,render,get tree(){return tree;},get query(){return query;},apply(value){query=pure.normalizeDiscoveryQuery(value);render();},account(value){account=value;sessionGeneration++;render();},reauth(){sessionGeneration++;},role(value){mode=value;render();},async flush(){for(let i=0;i<6;i++)await new Promise(resolve=>setTimeout(resolve,1));return render();},unmount:runtime.unmount};
}

test('failed query B cannot keep query A purchasable and explicit retry uses the exact B query',async()=>{
  let fail=false;const ui=harness({initialQuery:{q:'A'},get:async url=>url.includes('/offers?')?(fail?Promise.reject(new Error('offline')):{items:[offer('A')],pageInfo:{}}):url.includes('/search?')?{requests:[],sellers:[],products:[]}:{items:[]}});
  await ui.flush();const oldList=find(ui.tree,'FlatList');assert.equal(oldList.props.data[0].id,'A');const oldCard=oldList.props.renderItem({item:offer('A')});
  fail=true;ui.apply({q:'B',category:'electrodomesticos'});await ui.flush();assert.equal(find(ui.tree,'FlatList').props.data.length,0);
  oldCard.props.onPress();ui.render();assert.equal(find(ui.tree,'OfferPurchaseWizard').props.visible,false);
  const retry=find(ui.tree,'BigActionButton');assert.equal(retry.props.label,copies.discoveryFilterCopy.es.retry);
  fail=false;retry.props.onPress();await ui.flush();const url=new URL(ui.calls.filter(call=>call[1].includes('/offers?')).at(-1)[1],'https://test.invalid');assert.equal(url.searchParams.get('q'),'B');assert.equal(url.searchParams.get('category'),'electrodomesticos');
});
test('a slower query A response cannot replace query B or its cursor; old pagination is also ignored',async()=>{
  let release;const ui=harness({initialQuery:{q:'A'},get:async url=>url.includes('/offers?')?url.includes('q=A')?new Promise(resolve=>release=resolve):{items:[offer('B')],pageInfo:{nextCursor:'B-cursor',hasNextPage:true}}:{items:[],requests:[],products:[],sellers:[]}});
  await ui.flush();ui.apply({q:'B'});await ui.flush();release({items:[offer('A')],pageInfo:{nextCursor:'A-cursor',hasNextPage:true}});await ui.flush();assert.deepEqual(find(ui.tree,'FlatList').props.data.map(item=>item.id),['B']);
  find(ui.tree,'FlatList').props.onEndReached();await ui.flush();assert.ok(ui.calls.at(-1)[1].includes('cursor=B-cursor'));assert.ok(ui.calls.at(-1)[1].includes('q=B'));
});
test('account and authentication generation changes suppress late results and old purchase actions',async()=>{
  let release;const ui=harness({get:async url=>url.includes('/offers?')?new Promise(resolve=>release=resolve):{items:[]}});await ui.flush();ui.reauth();release({items:[offer('private')],pageInfo:{}});await ui.flush();assert.equal(find(ui.tree,'FlatList').props.data.length,0);
  const ui2=harness();await ui2.flush();const card=find(ui2.tree,'FlatList').props.renderItem({item:offer()});ui2.account('other');card.props.onPress();await ui2.flush();assert.equal(find(ui2.tree,'OfferPurchaseWizard').props.visible,false);
});
test('filtering My requests intersects active or history statuses before pagination and rejects stale reads',async()=>{
  const ui=harness({screen:'requests',initialQuery:{q:'lavadora',status:'submitted',category:'electrodomesticos'}});await ui.flush();const url=new URL(ui.calls[0][1],'https://test.invalid');assert.equal(url.searchParams.get('status'),'submitted');assert.equal(url.searchParams.get('q'),'lavadora');assert.equal(url.searchParams.get('category'),'electrodomesticos');
  ui.apply({q:'hidden',status:'archived'});await ui.flush();const fixed=new URL(ui.calls.at(-1)[1],'https://test.invalid');assert.equal(fixed.searchParams.get('status'),'draft,ready,submitted,awarded');
});
test('pagination retry preserves the applied query and cursor rather than silently reloading an unrelated first page',async()=>{
  let fail=false;const ui=harness({screen:'requests',initialQuery:{q:'my older request'},get:async url=>url.includes('cursor=older')?(fail?Promise.reject(new Error('offline')):{items:[request('submitted','older')],pageInfo:{}}):{items:[request()],pageInfo:{nextCursor:'older'}}});await ui.flush();fail=true;ui.tree.props.ListFooterComponent.props.onPress();await ui.flush();assert.equal(ui.tree.props.data.length,1);fail=false;ui.tree.props.ListFooterComponent.props.onPress();await ui.flush();assert.equal(ui.tree.props.data.length,2);const url=new URL(ui.calls.at(-1)[1],'https://test.invalid');assert.equal(url.searchParams.get('q'),'my older request');assert.equal(url.searchParams.get('cursor'),'older');
});
test('shared account context retains applied query across screens but never persists search coordinates',async()=>{
  const runtime=hooks();const writes=[];let stored={q:'saved'};
  const helper=load('src/utils/discoveryFilters.ts',{react:runtime.react,'./journeyDrafts':{readJourneyDraft:async()=>stored,writeJourneyDraft:async(...args)=>writes.push(args)}});
  helper.setDiscoveryQuery('buyer','catalog',{q:'washers',category:'electrodomesticos',latitude:39.7,longitude:-0.3,radiusKm:10});
  let value=runtime.render(()=>helper.useDiscoveryQuery('buyer','catalog'));
  assert.equal(value.query.q,'washers');assert.equal(value.query.latitude,39.7);
  assert.equal(writes[0][2].latitude,undefined);assert.equal(writes[0][2].longitude,undefined);assert.equal(writes[0][2].radiusKm,undefined);
  value=runtime.render(()=>helper.useDiscoveryQuery('other','catalog'));assert.equal(value.query.q,'');await new Promise(resolve=>setImmediate(resolve));value=runtime.render(()=>helper.useDiscoveryQuery('other','catalog'));assert.equal(value.query.q,'saved');runtime.unmount();
});

function text(node) { if(typeof node==='string')return node;if(Array.isArray(node))return node.map(text).join('');return text(node?.props?.children||[]); }
function button(node,label) { if(Array.isArray(node))return node.map(child=>button(child,label)).find(Boolean);if(node?.props?.onPress&&(node.props.label===label||text(node)===label||node.props.accessibilityLabel===label))return node;return button(node?.props?.children||[],label); }
function componentHarness(kind='catalog') {
  const runtime=hooks(),applied=[],urls=[];let value=pure.normalizeDiscoveryQuery({q:'oranges'}),account='buyer';
  const auth=selector=>selector({user:{id:account}});auth.getState=()=>({user:{id:account}});
  const rn={StyleSheet:{create:value=>value},Platform:{OS:'web'}};for(const name of ['View','Text','TextInput','TouchableOpacity','ActivityIndicator','Modal','ScrollView','KeyboardAvoidingView'])rn[name]=name;
  const Component=source('src/components/DiscoveryFilters.tsx',{
    react:runtime.react,'react-native':rn,'lucide-react-native':{},'../config/api':{apiAuthGet:async url=>{urls.push(url);return {categories:[{value:'electrodomesticos',subcategories:[{value:'lavadoras',label:'Lavadoras'}]}],productKinds:['goods'],units:['kg','ud'],currencies:['EUR']};}},
    '../store/auth.store':{useAuthStore:auth},'../i18n/useAppTranslation':{useAppTranslation:()=>({locale:'es'})},'../i18n/discoveryFilterCopy':copies,'../theme/colors':{colors},'./design-system':{BigActionButton:'BigActionButton'},'../utils/discoveryFilters':pure,
  });
  let tree;const render=()=>tree=runtime.render(()=>Component({value,kind,onApply:query=>{value=query;applied.push(query);}}));render();
  return {render,applied,urls,get tree(){return tree;},async flush(){await new Promise(resolve=>setImmediate(resolve));return render();},account(id){account=id;render();},unmount:runtime.unmount};
}
test('actual filter modal stages edits, cancel leaves applied query intact, and footer applies canonical appliance category',async()=>{
  const ui=componentHarness();button(ui.tree,'Filtros').props.onPress();await ui.flush();button(ui.tree,'Electrodomésticos').props.onPress();ui.render();
  assert.equal(ui.applied.length,0,'chips only change draft');button(ui.tree,'Cancelar').props.onPress();ui.render();assert.equal(ui.applied.length,0);
  button(ui.tree,'Filtros').props.onPress();await ui.flush();button(ui.tree,'Electrodomésticos').props.onPress();ui.render();
  const footer=find(ui.tree,'View');assert.ok(footer);button(ui.tree,'Ver resultados').props.onPress();ui.render();assert.equal(ui.applied[0].category,'electrodomesticos');assert.equal(ui.applied[0].q,'oranges');assert.equal(ui.urls[0],'/allwain/discovery-options');
});
test('actual modal prevents incompatible price sorting and invalid range; order chips use canonical server states',async()=>{
  const ui=componentHarness();button(ui.tree,'Filtros').props.onPress();await ui.flush();assert.equal(button(ui.tree,'Menor precio').props.disabled,true);
  button(ui.tree,'kg').props.onPress();ui.render();button(ui.tree,'EUR').props.onPress();ui.render();assert.equal(button(ui.tree,'Menor precio').props.disabled,false);button(ui.tree,'Menor precio').props.onPress();ui.render();button(ui.tree,'Ver resultados').props.onPress();assert.equal(ui.applied[0].sort,'price_asc');
  const orders=componentHarness('orders');button(orders.tree,'Filtros').props.onPress();await orders.flush();button(orders.tree,'Confirmado').props.onPress();orders.render();button(orders.tree,'Pago en proceso').props.onPress();orders.render();button(orders.tree,'Listo para entregar').props.onPress();orders.render();button(orders.tree,'Conector local').props.onPress();orders.render();button(orders.tree,'Ver resultados').props.onPress();assert.equal(orders.applied[0].contractStatus,'accepted');assert.equal(orders.applied[0].status,'');assert.equal(orders.applied[0].paymentStatus,'payment_processing');assert.equal(orders.applied[0].fulfillmentStatus,'ready');assert.equal(orders.applied[0].deliveryChannel,'local_connector');
});
test('location permission is not requested by filter rendering or opening and is available only on request filters',async()=>{
  let reads=0;const previous=global.navigator;Object.defineProperty(global,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition(resolve){reads++;resolve({coords:{latitude:39.6666,longitude:-0.3666}});}}}});
  try {
    const catalog=componentHarness();button(catalog.tree,'Filtros').props.onPress();await catalog.flush();assert.equal(reads,0);assert.equal(button(catalog.tree,'Usar mi ubicación'),undefined);
    const requests=componentHarness('requests');button(requests.tree,'Filtros').props.onPress();await requests.flush();assert.equal(reads,0);button(requests.tree,'Usar mi ubicación').props.onPress();await requests.flush();assert.equal(reads,1);button(requests.tree,'Ver resultados').props.onPress();assert.equal(requests.applied[0].latitude,39.667);assert.equal(requests.applied[0].radiusKm,10);
  } finally {Object.defineProperty(global,'navigator',{configurable:true,value:previous});}
});
