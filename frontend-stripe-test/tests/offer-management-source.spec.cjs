const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs');
const management = load('src/utils/offerManagement.ts');
const copy = load('src/screens/Offers/offerManagementCopy.ts');
const offer = patch => ({ id: 'offer-1', owner: 'allwain', ownerUserId: 'seller-a', allwainType: 'catalog', allwainStatus: 'active',
  provider: { id: 'seller-a', name: 'Comercio' }, title: 'Naranjas', description: 'Naranjas frescas', price: 5, currency: 'EUR', unit: 'kg', category: 'alimentacion',
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-04T10:00:00.000Z',
  meta: { stockQuantity: 10, availableQuantity: 10, minQuantity: 1, quantityStep: 1 }, ...patch });

/** Execute the original hook and handler bodies. Replace only the final JSX return
 * with a test capture; native layout, effects and transport are intentionally mocked. */
function harness(api = {}) {
  const states = []; let slot = 0; let generation = 1;
  const effects = []; const route = {params:api.route || {}};
  const auth = { user: { id: 'seller-a', participation: { seller: { enabled: true } } }, token: 'token-a', appMode: 'sell', setAppMode: async () => {} };
  const alerts = []; const writes = []; const gets = []; const navigations = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: type === 'WindowedRows' ? props.data.map(props.renderItem) : children } }),
    useState: initial => { const i = slot++; states[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [states[i].value, update => { states[i].value = typeof update === 'function' ? update(states[i].value) : update; }]; },
    useRef: initial => { const i = slot++; return states[i] ||= { current: initial }; },
    useMemo: callback => { slot++; return callback(); }, useCallback: callback => { slot++; return callback; }, useEffect: callback => { slot++; effects.push(callback); },
  };
  const discovery = load('src/utils/discoveryFilters.ts', {react, './journeyDrafts': {}});
  const queries = new Map();
  const queryHooks = {...discovery, useDiscoveryQuery: (account,context) => ({query:queries.get(`${account}:${context}`) || {...discovery.EMPTY_DISCOVERY_QUERY},ready:true,setQuery:query=>queries.set(`${account}:${context}`,discovery.normalizeDiscoveryQuery(query))})};
  const useAuthStore = select => select(auth); useAuthStore.getState = () => auth;
  const filename = path.resolve(__dirname, '../src/screens/Offers/OffersScreen.tsx');
  let source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'OffersScreen');
  const finalReturn = component.body.statements.at(-1); assert.ok(ts.isReturnStatement(finalReturn));
  const originalView = finalReturn.expression.getText(ast);
  source = source.slice(0, finalReturn.getStart(ast)) + `return {
    changeOfferStatus, withdrawProposal, confirmCloseOffer, confirmWithdrawProposal, openCatalogEditor, saveCatalogEdit,
    openInventoryEditor, saveInventory, loadData, loadMoreOffers, openProposalOrder,
    snapshot: { offers, storedOffers, marketRequests, contracts, storedContracts, orders, buyerSection, expandedId, catalogEditOffer, catalogEditValues, inventoryEditId, busyId, error, notice, offersPage, visibleOffers, loadedKeys, keys:{offers:offerDataKey,market:marketDataKey,activity:activityDataKey} },
    setters: { setOffers, setOffersPage, setLoadedKeys, setContracts, setOrders, setContractsPage, setOrdersPage, setCatalogEditValues, setInventoryDraft, setPublicationView, setPublicationType, setSellerSection },
    discovery: {catalog:catalogDiscovery,market:marketDiscovery,activity:activityDiscovery}, loadMoreActivity, loadMoreMarketRequests, chargePreorder, requestOffer,
    restoreDiscoveryQuery,
    getUI: () => (${originalView}),
  };` + source.slice(finalReturn.end);
  const emptyItems = async () => ({ items: [], contracts:[],orders:[],pageInfo: {} });
  const replacements = {
    '../../analytics/purchaseAnalytics': require('./helpers/analytics-instrumentation-noop.cjs'),
    react, 'react-native': { ...Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'ScrollView', 'ActivityIndicator', 'Switch', 'TextInput'].map(n => [n, n])), Platform: { OS: 'android' }, StyleSheet: { create: value => value }, AppState: {} },
    '@react-navigation/native': { useRoute: () => route, useNavigation: () => ({ navigate: (...args) => navigations.push(args), isFocused:()=>api.focused!==false }), useFocusEffect() {} },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../store/auth.store': { useAuthStore },
    '../../store/authSessionBridge': { captureAuthSession: () => { const current = generation; return { isCurrent: () => current === generation }; } },
    '../../config/api': {
      apiAuthGet: async url => { gets.push(url); return (api.get || emptyItems)(url); }, apiGet: async () => ({}),
      apiAuthPatch: async (url, body) => { writes.push({ method: 'PATCH', url, body, account: auth.user.id }); return (api.patch || (async () => offer({ allwainStatus: body.status })))(url, body); },
      apiAuthPost: async (url, body) => { writes.push({ method: 'POST', url, body, account: auth.user.id }); return (api.post || (async () => offer({ allwainStatus: 'withdrawn' })))(url, body); },
    },
    '../../utils/offerManagement': management, './offerManagementCopy': copy,
    '../../components/WindowedRows': {default:'WindowedRows',__esModule:true},
    '../../utils/scrollWindow': load('src/utils/scrollWindow.ts'),
    '../../utils/sellerJourney': load('src/utils/sellerJourney.ts'),
    '../../utils/discoveryFilters': queryHooks,
    '../../utils/marketDiscovery': load('src/utils/marketDiscovery.ts'),
    '../../i18n/demandFilterCopy': load('src/i18n/demandFilterCopy.ts'),
    '../../components/DiscoveryFilters': {default:'DiscoveryFilters',__esModule:true,CATALOG_DISCOVERY_FIELDS:['q','category','subcategory','productKind','unit','currency','minPrice','maxPrice','locationLabel','dateFrom','dateTo','sort'],ORDER_DISCOVERY_FIELDS:['q','contractStatus','paymentStatus','fulfillmentStatus','dateFrom','dateTo','deliveryChannel']},
    '../../utils/appAlert': { AppAlert: { alert: (title, body, buttons) => alerts.push({ title, body, buttons }) } },
    '../../utils/journeyDrafts': {}, '../../theme/colors': { colors: {} },
    '../../i18n/useAppTranslation': { useAppTranslation: () => ({ locale: 'es', t: key => key }) },
    '../../utils/allwainPaymentEnvironment': { isAllwainPaymentEnvironmentReady: () => api.paymentReady === true, isAllwainStripeTestMarketplace: () => false },
    '../../data/demoOffers': { preferredOrangesOffer: () => null, isPinnedOrangesOffer: () => false },
    '../../components/design-system': Object.fromEntries(['BigActionButton', 'EmptyState', 'OfferCard', 'OrderCard', 'PublicationImage'].map(n => [n, n])),
    '../../utils/format': { formatCurrency: value => `${value} €`, formatMinorCurrency: value => `${value / 100} €` },
  };
  const module = new Module(filename); module.paths = Module._nodeModulePaths(path.dirname(filename));
  module.require = name => Object.hasOwn(replacements, name) ? replacements[name] : {};
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  const render = () => { slot = 0; effects.length=0; return module.exports.default(); };
  const result = { render, alerts, writes, gets, navigations, route, runHydration:()=>effects.find(callback=>String(callback).includes('externalFiltered'))?.(), switchAccount: id => { auth.user = { ...auth.user, id }; generation++; }, switchRole: mode => { auth.appMode = mode; } };
  result.view = render(); result.view.setters.setOffers([offer()]); result.view.setters.setLoadedKeys(result.view.snapshot.keys); result.view = render();
  return result;
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('catalogue filter change hides old cards immediately and retry uses the failed query', async () => {
  let fail = true;
  const h = harness({get:async url => {
    if(url.startsWith('/allwain/offers?') && new URL(url,'http://local').searchParams.get('q')==='lavadora') {
      if(fail) throw Error('offline'); return {items:[offer({id:'washing',title:'Lavadora'})],pageInfo:{}};
    }
    return {items:[],pageInfo:{}};
  }});
  h.view.setters.setOffersPage({hasNextPage:true,nextCursor:'old-cursor'});
  h.view.discovery.catalog.setQuery({q:'lavadora'}); h.view = h.render();
  assert.equal(h.view.snapshot.offers.length,0);
  assert.equal(nodes(h.view.getUI()).filter(node=>node.type==='Text').some(node=>node.props.children.includes('Mostrar más ofertas')),false,'a previous query cannot expose its pagination button');
  await h.view.loadMoreOffers(); assert.equal(h.gets.length,0,'the previous cursor cannot run against the new filter');
  await h.view.loadData(); h.view = h.render(); assert.equal(h.view.snapshot.offers.length,0); assert.ok(h.view.snapshot.error);
  fail=false; await h.view.loadData(); h.view=h.render();
  assert.equal(h.view.snapshot.offers[0].id,'washing');
  assert.ok(h.gets.filter(url=>url.startsWith('/allwain/offers?')).every(url=>new URL(url,'http://local').searchParams.get('q')==='lavadora'));
});

test('catalogue old query response cannot replace a newer applied result', async () => {
  let release;
  const h=harness({get:async url=>{
    if(url.startsWith('/allwain/offers?')) {
      if(new URL(url,'http://local').searchParams.get('q')==='new') return {items:[offer({id:'new'})],pageInfo:{}};
      return new Promise(resolve=>release=resolve);
    }
    return {items:[],pageInfo:{}};
  }});
  const old=h.view.loadData(); h.view.discovery.catalog.setQuery({q:'new'}); h.view=h.render(); await h.view.loadData();
  release({items:[offer({id:'old'})],pageInfo:{nextCursor:'old-next'}}); await old;
  assert.equal(h.render().snapshot.offers[0].id,'new'); assert.equal(h.render().snapshot.offersPage.nextCursor,undefined);
});

test('catalogue pagination binds the exact query and ignores append after filter change', async()=>{
  let release; const h=harness({get:async url=>{
    if(url.startsWith('/allwain/offers?') && new URL(url,'http://local').searchParams.has('cursor')) return new Promise(resolve=>release=resolve);
    return {items:[offer({id:'current'})],pageInfo:{nextCursor:'bound'}};
  }});
  h.view.discovery.catalog.setQuery({q:'kg oranges',unit:'kg',currency:'EUR',sort:'price_asc'}); h.view=h.render(); await h.view.loadData(); h.view=h.render();
  const append=h.view.loadMoreOffers(); const url=new URL(h.gets.at(-1),'http://local');
  assert.equal(url.searchParams.get('q'),'kg oranges'); assert.equal(url.searchParams.get('cursor'),'bound'); assert.equal(url.searchParams.get('sort'),'price_asc');
  h.view.discovery.catalog.setQuery({q:'service'}); h.view=h.render(); release({items:[offer({id:'stale'})],pageInfo:{}}); await append;
  assert.equal(h.render().snapshot.offers.length,0); assert.ok(!h.render().snapshot.storedOffers.some(item=>item.id==='stale'));
});

test('orders use the same server query for contracts and orders and hide stale results', async()=>{
  const contract={id:'agreement',providerUserId:'seller-a',createdAt:'2026-10-04T00:00:00.000Z'};
  const h=harness({get:async url=>({contracts:url.startsWith('/allwain/payments/activity?')?[contract]:[],orders:url.startsWith('/allwain/payments/activity?')?[{id:'order',contractId:'agreement'}]:[],items:[],pageInfo:{nextCursor:'bound'}})});
  h.view.discovery.activity.setQuery({q:'Paco',contractStatus:'accepted',paymentStatus:'paid',fulfillmentStatus:'preparing',dateFrom:'2026-10-01',deliveryChannel:'pickup'}); h.view=h.render();
  await h.view.loadData(); h.view=h.render(); assert.equal(h.view.snapshot.contracts.length,1);
  for(const path of ['/allwain/payments/activity?']) {
    const params=new URL(h.gets.find(url=>url.startsWith(path)),'http://local').searchParams;
    assert.equal(params.get('q'),'Paco'); assert.equal(params.get('contractStatus'),'accepted'); assert.equal(params.get('status'),null); assert.equal(params.get('paymentStatus'),'paid'); assert.equal(params.get('fulfillmentStatus'),'preparing'); assert.equal(params.get('deliveryChannel'),'pickup');
    assert.equal(params.get('dateFrom'),'2026-10-01');
  }
  h.view.discovery.activity.setQuery({q:'another'}); h.view=h.render(); assert.equal(h.view.snapshot.contracts.length,0); assert.equal(h.view.snapshot.orders.length,0);
});

test('activity append cannot enter another account or filter after it was requested', async()=>{
  for(const change of [h=>h.switchAccount('seller-b'),h=>h.view.discovery.activity.setQuery({q:'different'})]) {
    const pending=[]; const h=harness({get:async url=>new Promise(resolve=>pending.push(resolve))});
    h.view.setters.setContractsPage({nextCursor:'contract-cursor'}); h.view.setters.setOrdersPage({nextCursor:'order-cursor'}); h.view=h.render();
    const append=h.view.loadMoreActivity(); change(h); h.view=h.render();
    for(const resolve of pending) resolve({contracts:[{id:'stale',createdAt:'2026-10-04',providerUserId:'seller-a'}],orders:[{id:'stale-order'}],pageInfo:{}});
    await append; assert.equal(h.render().snapshot.contracts.length,0); assert.equal(h.render().snapshot.orders.length,0);
  }
});

test('query-specific contracts remain hidden when one half of the activity fetch fails',async()=>{
  const h=harness({get:async url=>{
    if(url.startsWith('/allwain/payments/activity?')) throw Error('activity offline');
    return {items:url.startsWith('/allwain/contracts?')?[{id:'agreement',providerUserId:'seller-a',createdAt:'2026-10-04'}]:[],pageInfo:{}};
  }});
  h.view.discovery.activity.setQuery({q:'unknown'});h.view=h.render();await h.view.loadData();
  assert.equal(h.render().snapshot.contracts.length,0);assert.ok(h.render().snapshot.error);
});

test('superseded pagination errors cannot replace a successful same-query refresh',async()=>{
  let reject; const h=harness({get:async url=>{
    if(url.includes('cursor=')) return new Promise((_resolve,no)=>reject=no);
    return {items:url.startsWith('/allwain/offers?')?[offer({id:'fresh'})]:[],pageInfo:{}};
  }});
  h.view.setters.setOffersPage({nextCursor:'bound'});h.view=h.render();const append=h.view.loadMoreOffers();
  await h.view.loadData();reject(Error('old append failed'));await append;
  const state=h.render().snapshot;assert.equal(state.offers[0].id,'fresh');assert.equal(state.error,null);assert.equal(state.busyId,null);
});

test('external offer focus preserves the query for return and matching focus does not clear it',()=>{
  for(const matching of [true,false]) {
    const h=harness();h.view.discovery.catalog.setQuery({q:'Naranjas',category:'alimentacion'});h.view=h.render();h.view.setters.setLoadedKeys(h.view.snapshot.keys);h.view=h.render();
    h.route.params={offerId:matching?'offer-1':'outside-page'};h.runHydration();h.view=h.render();
    assert.equal(h.view.discovery.catalog.query.q,matching?'Naranjas':'');
    if(!matching) {h.view.restoreDiscoveryQuery('catalog');h.view=h.render();assert.equal(h.view.discovery.catalog.query.q,'Naranjas');assert.equal(h.view.discovery.catalog.query.category,'alimentacion');h.runHydration();assert.equal(h.render().discovery.catalog.query.q,'Naranjas');}
  }
});

test('restoring an external-focus query cannot write into a different account',()=>{
  const h=harness();h.view.discovery.catalog.setQuery({q:'private query'});h.view=h.render();h.view.setters.setLoadedKeys(h.view.snapshot.keys);h.view=h.render();
  h.route.params={offerId:'outside-page'};h.runHydration();h.view=h.render();h.switchAccount('seller-b');h.view=h.render();h.view.restoreDiscoveryQuery('catalog');
  assert.equal(h.render().discovery.catalog.query.q,'');
});

test('source status handler rejects mismatched id, owner and confirmed state', async () => {
  for (const wrong of [offer({ id: 'other', allwainStatus: 'closed' }), offer({ ownerUserId: 'other', provider: { id: 'other' }, allwainStatus: 'closed' }), offer({ ownerUserId: 'other', allwainStatus: 'closed' }), offer({ allwainStatus: 'active' })]) {
    const h = harness({ patch: async () => wrong });
    await h.view.changeOfferStatus(offer(), 'closed');
    const state = h.render().snapshot;
    assert.equal(state.offers.length, 1); assert.equal(state.offers[0].allwainStatus, 'active'); assert.equal(state.notice, null); assert.ok(state.error);
  }
});
test('source status handler starts one write for duplicate calls and validates optimistic version', async () => {
  let release; const h = harness({ patch: () => new Promise(resolve => release = resolve) });
  const first = h.view.changeOfferStatus(offer(), 'closed'); const second = h.view.changeOfferStatus(offer(), 'closed');
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].body.expectedUpdatedAt, offer().updatedAt);
  release(offer({ allwainStatus: 'closed' })); await Promise.all([first, second]); await settle();
  assert.equal(h.render().snapshot.offers.length, 0);
});
test('source refresh and pagination started before withdrawal cannot reopen the closed card', async () => {
  for (const readKind of ['refresh', 'pagination']) {
    let release; let catalogueReads = 0;
    const h = harness({ get: async url => {
      if (url.startsWith('/allwain/offers?')) {
        catalogueReads++;
        if (catalogueReads === 1) return new Promise(resolve => release = resolve);
      }
      return { items: [], pageInfo: {} };
    } });
    h.view.setters.setOffersPage({ nextCursor: 'next' }); h.view = h.render();
    const reading = readKind === 'refresh' ? h.view.loadData() : h.view.loadMoreOffers();
    await h.view.changeOfferStatus(offer(), 'closed'); await settle();
    release({ items: [offer()], pageInfo: {} }); await reading; await settle();
    assert.equal(h.render().snapshot.offers.length, 0, readKind);
  }
});
test('source response to a mutation is ignored after the account changes', async () => {
  let release; const h = harness({ patch: () => new Promise(resolve => release = resolve) });
  const updating = h.view.changeOfferStatus(offer(), 'closed'); h.switchAccount('seller-b');
  release(offer({ allwainStatus: 'closed' })); await updating;
  assert.equal(h.render().snapshot.storedOffers[0].allwainStatus, 'active'); assert.equal(h.render().snapshot.offers.length, 0); assert.equal(h.render().snapshot.notice, null);
});
test('source historical catalog cannot open editor, save inventory, or change state', async () => {
  const h = harness(); const historical = offer({ allwainStatus: 'closed' });
  h.view.openCatalogEditor(historical); await h.view.changeOfferStatus(historical, 'active'); await h.view.saveInventory(historical);
  assert.equal(h.render().snapshot.catalogEditOffer, null); assert.equal(h.writes.length, 0);
});
test('source catalog edit confirms the exact patch before announcing success', async () => {
  const h = harness({ patch: async () => offer({ title: 'Unchanged' }) });
  h.view.openCatalogEditor(offer()); h.view = h.render();
  h.view.setters.setCatalogEditValues(current => ({ ...current, title: 'Nuevo título' })); h.view = h.render();
  await h.view.saveCatalogEdit(); const state = h.render().snapshot;
  assert.ok(state.catalogEditOffer); assert.equal(state.offers[0].title, 'Naranjas'); assert.equal(state.notice, null); assert.ok(state.error);
});
test('source old confirmation cannot start a write in another account', async () => {
  for (const change of [h => h.switchAccount('seller-b'), h => h.switchAccount('seller-a'), h => h.switchRole('buy')]) {
    const h = harness(); h.view.confirmCloseOffer(offer()); change(h);
    h.alerts[0].buttons[1].onPress(); await settle();
    assert.equal(h.writes.length, 0, 'an alert cannot submit after account, generation or role change');
  }
});
test('source inventory confirmation rejects another owner or terminal/proposal response', async () => {
  for (const wrong of [offer({ ownerUserId: 'other', provider: { id: 'other' } }), offer({ ownerUserId: 'other' }), offer({ allwainType: 'proposal', requestId: 'private' }), offer({ allwainStatus: 'closed' })]) {
    const h = harness({ post: async () => wrong });
    h.view.openInventoryEditor(offer()); h.view = h.render();
    await h.view.saveInventory(offer()); const state = h.render().snapshot;
    assert.equal(state.notice, null); assert.ok(state.error); assert.equal(state.offers[0].ownerUserId, 'seller-a'); assert.equal(state.offers[0].allwainStatus, 'active');
  }
});
test('source write cannot confirm or start a seller refresh after role changes during the request', async () => {
  let release; const h = harness({ patch: () => new Promise(resolve => release = resolve) });
  const updating = h.view.changeOfferStatus(offer(), 'paused'); h.switchRole('buy');
  release(offer({ allwainStatus: 'paused' })); await updating; await settle();
  const state = h.render().snapshot;
  assert.equal(h.gets.length, 0); assert.equal(state.storedOffers[0].allwainStatus, 'active'); assert.equal(state.offers.length, 0); assert.equal(state.notice, null);
});

function nodes(tree) { return [tree, ...(tree?.props?.children || []).flat(Infinity).filter(child => child && typeof child === 'object').flatMap(nodes)]; }
test('source historical card shows the readonly label and no edit, stock, pause or withdraw actions', () => {
  const h = harness();
  h.view.setters.setOffers([offer({ allwainStatus: 'closed' })]); h.view.setters.setPublicationView('history'); h.view.setters.setSellerSection('offers'); h.view = h.render();
  h.view.setters.setLoadedKeys(h.view.snapshot.keys); h.view = h.render();
  const tree = h.view.getUI();
  const texts = nodes(tree).filter(n => n?.type === 'Text').flatMap(n => n.props.children).filter(n => typeof n === 'string');
  assert.ok(texts.includes(copy.offerManagementCopy('es').readonly));
  for (const label of ['Editar oferta', 'Editar inventario', 'Guardar inventario', 'Pausar', 'Retirar oferta', 'Activar']) assert.equal(texts.includes(label), false, label);
});

test('source catalog modal keeps save controls outside its ScrollView and locks contracted fields', () => {
  const filename = path.resolve(__dirname, '../src/components/CatalogOfferEditor.tsx');
  const module = new Module(filename); module.paths = Module._nodeModulePaths(path.dirname(filename));
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: value => [value, () => {}], useEffect() {} };
  const replacements = { react, 'react-native': { ...Object.fromEntries(['KeyboardAvoidingView', 'Modal', 'SafeAreaView', 'ScrollView', 'Switch', 'Text', 'TextInput', 'View'].map(n => [n, n])), Platform: { OS: 'android' }, StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 24 }) }, './design-system': { BigActionButton: 'BigActionButton' }, '../utils/offerManagement': management,
    '../i18n/useAppTranslation': { useAppTranslation: () => ({ locale: 'es' }) }, '../screens/Offers/offerManagementCopy': copy, '../theme/colors': { colors: {} } };
  module.require = name => replacements[name] || {};
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  for (const busy of [false, true]) {
    const publication = offer({ meta: { catalogTermsLocked: true } }); const tree = module.exports.default({ offer: publication, draft: management.catalogEditDraft(publication), busy, error: null, onChange() {}, onClose() {}, onSave() {} });
    const scroll = nodes(tree).find(n => n?.type === 'ScrollView'); const footer = nodes(tree).find(n => n?.props?.testID === 'catalog-edit-footer');
    assert.ok(footer); assert.ok(!nodes(scroll).includes(footer));
    const buttons = nodes(footer).filter(n => n?.type === 'BigActionButton'); assert.equal(buttons.length, 2); assert.equal(buttons[0].props.disabled, busy);
    for (const key of ['unit', 'category', 'subcategory']) assert.equal(nodes(tree).find(n => n?.props?.testID === `catalog-edit-${key}`).props.editable, false);
    assert.equal(nodes(tree).find(n => n?.props?.testID === 'catalog-edit-price').props.editable, !busy);
  }
});
test('source selected-proposal lookup cannot navigate seller orders after a role switch', async () => {
  let release; const h = harness({ get: () => new Promise(resolve => release = resolve) });
  const opening = h.view.openProposalOrder(offer({ allwainType: 'proposal', allwainStatus: 'selected' })); h.switchRole('buy');
  release({ items: [{ id: 'contract-1', offerId: 'offer-1', providerUserId: 'seller-a' }], pageInfo: {} }); await opening;
  assert.equal(h.navigations.length, 0);
});


test('preparation is a server-filtered activity page including the old pending order and matched agreement',async()=>{
 const c={id:'old-c',providerUserId:'seller-a',createdAt:'2026-01-01'};
 const h=harness({get:async url=>url.startsWith('/allwain/payments/activity?')?{contracts:[c],orders:[{id:'old-order',contractId:'old-c'}],preparationCount:31,pageInfo:{nextCursor:'same-entity'}}:{items:[],pageInfo:{}}});
 h.view.setters.setSellerSection('preparation');h.view=h.render();await h.view.loadData();h.view=h.render();
 assert.equal(h.view.snapshot.contracts[0].id,'old-c');assert.equal(h.view.snapshot.orders[0].id,'old-order');
 const p=new URL(h.gets.find(url=>url.startsWith('/allwain/payments/activity?')),'http://local').searchParams;assert.equal(p.get('view'),'preparation');assert.equal(p.get('scope'),'seller');
 assert.equal(h.gets.filter(url=>url.startsWith('/allwain/contracts?')||url.startsWith('/allwain/payments/orders?')).length,0);
});

test('activity pagination appends orders and contracts from the same cursor in one request',async()=>{
 const h=harness({get:async url=>({contracts:[{id:'second-c',createdAt:'2026-01-01',providerUserId:'seller-a'}],orders:[{id:'second-o',contractId:'second-c'}],pageInfo:{}})});
 h.view.setters.setContractsPage({nextCursor:'one-cursor'});h.view.setters.setOrdersPage({nextCursor:'one-cursor'});h.view=h.render();await h.view.loadMoreActivity();
 assert.equal(h.gets.length,1);assert.equal(new URL(h.gets[0],'http://local').searchParams.get('cursor'),'one-cursor');assert.equal(h.render().snapshot.orders[0].contractId,h.render().snapshot.contracts[0].id);
});

test('switching preparation view rejects a late page from all activity',async()=>{
 let release;const h=harness({get:async url=>url.startsWith('/allwain/payments/activity?')?new Promise(resolve=>release=resolve):{items:[],pageInfo:{}}});
 const old=h.view.loadData();h.view.setters.setSellerSection('preparation');h.view=h.render();release({contracts:[{id:'irrelevant'}],orders:[],pageInfo:{}});await old;
 assert.equal(h.render().snapshot.contracts.length,0);assert.equal(h.render().snapshot.orders.length,0);
});

test('charge reservation re-reads the known exact order instead of the first 30 orders',async()=>{
 const order={id:'old-o',contractId:'old-c',sellerUserId:'seller-a',paymentMode:'preorder'};
 const h=harness({paymentReady:true,get:async url=>url==='/allwain/payments/orders/old-o'?order:{contracts:[],orders:[],items:[],pageInfo:{}},post:async()=>({orderId:'old-o',paymentIntentId:'pi-isolated',status:'processing'})});
 h.view.setters.setOrders([order]);h.view=h.render();await h.view.chargePreorder({id:'old-c',providerUserId:'seller-a'});
 assert.equal(h.gets[0],'/allwain/payments/orders/old-o');assert.equal(h.writes.length,1);assert.equal(h.writes[0].url,'/allwain/payments/orders/old-o/charge');
 assert.equal(h.gets.includes('/allwain/payments/orders'),false);
});

test('charge reservation outside loaded page resolves the exact contract/order on server',async()=>{
 const h=harness({paymentReady:true,get:async url=>url==='/allwain/payments/contracts/old-c/order'?{id:'old-o',contractId:'old-c',sellerUserId:'seller-a',paymentMode:'preorder'}:{contracts:[],orders:[],items:[],pageInfo:{}},post:async()=>({orderId:'old-o',paymentIntentId:'pi-isolated',status:'processing'})});
 await h.view.chargePreorder({id:'old-c',providerUserId:'seller-a'});assert.equal(h.gets[0],'/allwain/payments/contracts/old-c/order');assert.equal(h.writes.length,1);
});

test('charge reservation verifies exact association and seller before any charge write',async()=>{
 for(const wrong of [{contractId:'foreign-c',sellerUserId:'seller-a',paymentMode:'preorder'},{contractId:'old-c',sellerUserId:'other',paymentMode:'preorder'},{contractId:'old-c',sellerUserId:'seller-a',paymentMode:'immediate'}]){
 const h=harness({paymentReady:true,get:async()=>({id:'old-o',...wrong})});await h.view.chargePreorder({id:'old-c',providerUserId:'seller-a'});assert.equal(h.writes.length,0);assert.ok(h.render().snapshot.error);
 }
});

test('charge lookup cannot post or announce success after role/account/session changes',async()=>{
 for(const change of [h=>h.switchAccount('seller-b'),h=>h.switchAccount('seller-a'),h=>h.switchRole('buy')]){
 let release;const h=harness({paymentReady:true,get:()=>new Promise(resolve=>release=resolve)});const work=h.view.chargePreorder({id:'old-c',providerUserId:'seller-a'});change(h);release({id:'old-o',contractId:'old-c',sellerUserId:'seller-a',paymentMode:'preorder'});await work;assert.equal(h.writes.length,0);assert.equal(h.render().snapshot.notice,null);
 }
});

test('catalogue purchase late receipt cannot change actor, renewed session, role or blurred screen',async()=>{
 for(const change of [h=>h.switchAccount('buyer-b'),h=>h.switchAccount('seller-a'),h=>h.switchRole('sell'),(_h,api)=>api.focused=false]){
  let release;const api={post:()=>new Promise(done=>release=done)},h=harness(api);h.switchRole('buy');h.view=h.render();
  const work=h.view.requestOffer(offer({ownerUserId:'merchant',provider:{id:'merchant'}}),2,{deliveryChannel:'pickup'},'purchase-stable');
  change(h,api);release({id:'agreement',offerId:'offer-1',requesterUserId:'seller-a',providerUserId:'merchant',quantity:2});
  assert.equal(await work,false);const snapshot=h.render().snapshot;assert.equal(snapshot.storedContracts.length,0);assert.equal(snapshot.buyerSection,'offers');assert.equal(snapshot.expandedId,null);assert.equal(snapshot.notice,null);assert.equal(h.gets.length,0);
 }
});

test('catalogue purchase verifies its seller receipt and does not announce an old network failure',async()=>{
 const h=harness({post:async()=>({id:'agreement',offerId:'offer-1',requesterUserId:'seller-a',providerUserId:'wrong',quantity:2})});h.switchRole('buy');h.view=h.render();
 assert.equal(await h.view.requestOffer(offer({ownerUserId:'merchant'}),2,{deliveryChannel:'pickup'},'purchase-stable'),false);assert.ok(h.render().snapshot.error);assert.equal(h.render().snapshot.storedContracts.length,0);
 let reject;const old=harness({post:()=>new Promise((_resolve,fail)=>reject=fail)});old.switchRole('buy');old.view=old.render();const work=old.view.requestOffer(offer({ownerUserId:'merchant'}),2,{deliveryChannel:'pickup'},'purchase-stable');old.switchAccount('other');reject(Error('old failure'));assert.equal(await work,false);assert.equal(old.render().snapshot.error,null);
});
