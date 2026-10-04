const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs');
const policy = load('src/utils/shoppingProposalLifecycle.ts');
const lifecycleCopy = load('src/utils/shoppingProposalCopy.ts');
const discovery = load('src/utils/marketDiscovery.ts');
const filterCopy = load('src/i18n/discoveryFilterCopy.ts');
const demandCopy = load('src/i18n/demandFilterCopy.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const list = id => ({ id, buyerUserId: 'buyer', buyer: { id: 'buyer', name: 'Ana' }, title: id,
  status: 'published', currency: 'EUR', proposalCount: 0, proposals: [], myProposal: null, items: [{ id: 'line', productName: 'Naranjas', quantity: 1, unit: 'kg' }] });
const request = id => ({ id, title: id, extracted: { productName: id, quantity: 1, unit: 'kg' },
  requester: { id: 'buyer', name: 'Ana' }, offerCount: 0 });
const page = (items, cursor) => ({ items, pageInfo: { hasNextPage: Boolean(cursor), nextCursor: cursor || null } });

function harness(screen, initialMode = 'sell') {
  const states = []; let hook = 0; let layout = [], effects = [], tree, scheduled = false, disposed = false;
  let cardRenders = 0;
  let user = { id: 'seller', participation: { seller: { enabled: true } } }, mode = initialMode, generation = 1, focused = true;
  let routeParams = {}, modeGate = null; const requests = [], navigations = [];
  const react = {
    createElement: (type, props, ...children) => { if (['market-list-card', 'market-request-card', 'shopping-list-card'].includes(props?.testID)) cardRenders++; return { type, props: { ...props, children } }; },
    useState: initial => { const i = hook++; if (!states[i]) states[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [states[i].value, update => { const value = typeof update === 'function' ? update(states[i].value) : update; if (!Object.is(value, states[i].value)) { states[i].value = value; schedule(); } }]; },
    useRef: value => { const i = hook++; return states[i] ||= { current: value }; },
    useMemo: (callback, deps) => { const i = hook++; const old = states[i]; if (!old || !deps || deps.some((d, n) => d !== old.deps?.[n])) states[i] = { value: callback(), deps }; return states[i].value; },
    useCallback: (callback, deps) => react.useMemo(() => callback, deps),
  };
  function effect(queue, callback, deps) { const i = hook++, old = states[i]; if (!old || !deps || deps.some((d, n) => d !== old.deps?.[n])) {
    states[i] = { ...old, deps }; queue.push(() => { old?.cleanup?.(); states[i].cleanup = callback(); });
  } }
  react.useEffect = (callback, deps) => effect(effects, callback, deps);
  react.useLayoutEffect = (callback, deps) => effect(layout, callback, deps);
  function schedule() { if (scheduled || disposed) return; scheduled = true; queueMicrotask(() => { scheduled = false; if (!disposed) render(); }); }
  const getState = () => ({ user, appMode: mode, setAppMode: async next => { if (modeGate) await modeGate.promise; mode = next; schedule(); } });
  const store = selector => selector(getState()); store.getState = getState;
  const owner = {};
  const snapshot = () => { const captured = generation; return { owner, generation: captured, isCurrent: () => captured === generation && !disposed }; };
  const navigation = { navigate: (...args) => navigations.push(args), setParams: params => { routeParams = { ...routeParams, ...params }; schedule(); }, addListener: () => () => {} };
  const journey = { readJourneyDraft: async () => null, writeJourneyDraft: async () => true, clearJourneyDraft: async () => true };
  const query = load('src/utils/discoveryFilters.ts', { react, './journeyDrafts': journey });
  const nativeNames = ['ActivityIndicator', 'KeyboardAvoidingView', 'ScrollView', 'Switch', 'Text', 'TextInput', 'TouchableOpacity', 'View'];
  const native = Object.fromEntries(nativeNames.map(name => [name, name]));
  const replacements = {
    '../../analytics/purchaseAnalytics': require('./helpers/analytics-instrumentation-noop.cjs'),
    react, 'react-native': { ...native, StyleSheet: { create: value => value } },
    'lucide-react-native': new Proxy({}, { get: (_, name) => String(name) }),
    '@react-navigation/native': { useNavigation: () => navigation, useFocusEffect: callback => react.useEffect(() => focused ? callback() : undefined, [callback, focused]) },
    '@react-native-picker/picker': { Picker: 'Picker' }, 'expo-document-picker': {},
    '../../config/api': { apiAuthGet: url => { const pending = deferred(); requests.push({ url, ...pending }); return pending.promise; }, apiAuthPost: async () => ({}), apiAuthPatch: async () => ({}) },
    '../../components/design-system': Object.fromEntries(['BigActionButton', 'EmptyState', 'PublicationImage', 'StatusChip'].map(name => [name, name])),
    '../../components/DiscoveryFilters': { __esModule: true, default: 'DiscoveryFilters' },
    '../../components/VirtualizedResults': { __esModule: true, default: 'VirtualizedResults' },
    '../../components/DemandFilterFields': { __esModule: true, default: 'DemandFilterFields' },
    '../../utils/discoveryFilters': query, '../../utils/marketDiscovery': discovery,
    '../../i18n/discoveryFilterCopy': filterCopy, '../../i18n/demandFilterCopy': demandCopy,
    '../../store/auth.store': { useAuthStore: store }, '../../store/authSessionBridge': { captureAuthSession: snapshot },
    '../../theme/colors': { colors: {} }, '../../utils/format': { formatCurrency: n => `${n} €` },
    '../../i18n/useAppTranslation': { useAppTranslation: () => ({ locale: 'es', t: translation }) },
    '../../utils/appAlert': { AppAlert: { alert() {} } },
    '../../components/useRequestKeyboardLayout': { useRequestKeyboardLayout: () => ({ keyboardAvoidingProps: {}, footerPaddingBottom: 0 }) },
    '../../utils/journeyDrafts': journey, '../../utils/currentLocation': {}, '../../utils/deliveryIntelligence': {},
    '../../utils/shoppingProposalLifecycle': policy, '../../utils/shoppingProposalCopy': lifecycleCopy,
    // This harness renders the parent list/detail selector; the editor's persistence is covered by seller-proposal-draft-source.spec.cjs.
    '../../utils/useSellerProposalDraft': {}, '../../utils/sellerProposalDraft': {}, '../../i18n/sellerProposalDraftCopy': {},
    '../../components/ProposalValidityControl': { ProposalCountdown: 'ProposalCountdown', ProposalValidityControl: 'ProposalValidityControl', nearestProposalDuration: v => v },
  };
  const filename = path.resolve(__dirname, `../src/screens/Requests/${screen}.tsx`), compiled = new Module(filename);
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = name => { if (Object.hasOwn(replacements, name)) return replacements[name]; throw Error(`Unexpected import: ${name}`); };
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  function translation(key) { return key; }
  function render() { hook = 0; cardRenders = 0; tree = compiled.exports.default({ navigation, route: { params: routeParams } }); const a = layout, b = effects; layout = []; effects = []; a.forEach(fn => fn()); b.forEach(fn => fn()); }
  render();
  return { requests, navigations, query, get tree() { return tree; }, get cardRenders() { return cardRenders; }, render,
    apply: patch => { const filter = nodes(tree).find(node => node.type === 'DiscoveryFilters'); filter.props.onApply({ ...filter.props.value, ...patch }); },
    focus: value => { focused = value; render(); },
    switchAccount: (id, newMode = mode) => { generation++; user = { ...user, id }; mode = newMode; render(); },
    switchRole: next => { mode = next; render(); },
    holdModeChange: () => { modeGate = deferred(); return modeGate; },
    unmount: () => { disposed = true; for (const state of states) state?.cleanup?.(); },
  };
}
function nodes(tree) {
  const children = [...(tree?.props?.children || []), tree?.props?.ListHeaderComponent, tree?.props?.ListFooterComponent];
  // Source interaction fixtures are intentionally small. Materialize their
  // renderItem handlers here; production FlatList decides which rows to mount.
  if (tree?.type === 'VirtualizedResults') for (const [index, item] of (tree.props.data || []).entries()) children.push(tree.props.renderItem({ item, index }));
  return [tree, ...children.flat(Infinity).filter(child => child && typeof child === 'object').flatMap(nodes)];
}
function texts(tree) { return nodes(tree).filter(node => node.type === 'Text').flatMap(node => node.props.children).join(' '); }
function button(tree, label) { return nodes(tree).find(node => (node.type === 'BigActionButton' && node.props.label === label) || (node.type === 'TouchableOpacity' && nodes(node).some(child => child.type === 'Text' && child.props.children.includes(label)))); }
function pending(h, pathFragment, q = '') { return h.requests.filter(req => req.url.includes(pathFragment) && new URL(req.url, 'https://local.test').searchParams.get('q') === (q || null)).at(-1); }

test('source market A after B cannot overwrite either stream; partial failure retries only the same lane and query', async () => {
  const h = harness('MarketRequestsScreen'); await settle();
  h.apply({ q: 'naranjas' }); await settle(); const aRequests = pending(h, '/market/requests', 'naranjas'), aLists = pending(h, '/shopping-lists/market', 'naranjas');
  h.apply({ q: 'leche' }); await settle(); const bRequests = pending(h, '/market/requests', 'leche'), bLists = pending(h, '/shopping-lists/market', 'leche');
  bRequests.resolve(page([request('leche')], 'milk-next')); bLists.reject(Error('list offline')); await settle();
  aRequests.resolve(page([request('naranjas')], 'orange-next')); aLists.resolve(page([list('naranjas')])); await settle();
  assert.match(texts(h.tree), /leche/); assert.doesNotMatch(texts(h.tree), /naranjas/); assert.match(texts(h.tree), /list offline/);
  button(h.tree, 'Reintentar').props.onPress(); await settle();
  const retry = h.requests.at(-1); assert.match(retry.url, /shopping-lists\/market/); assert.equal(new URL(retry.url, 'https://local.test').searchParams.get('q'), 'leche');
  retry.resolve(page([list('milk list')])); await settle(); assert.match(texts(h.tree), /milk list/); assert.match(texts(h.tree), /leche/);
  h.unmount();
});

test('source market cursor stays on applied query while a different draft is being edited; repeated More sends one request', async () => {
  const h = harness('MarketRequestsScreen'); await settle(); h.apply({ q: 'naranjas', currency: 'EUR', unit: 'kg', responseStatus: 'none' }); await settle();
  pending(h, '/market/requests', 'naranjas').resolve(page([request('orange')], 'opaque-orange')); pending(h, '/shopping-lists/market', 'naranjas').resolve(page([])); await settle();
  // A filter draft belongs to DiscoveryFilters until onApply; it is not passed to this screen.
  const unappliedDraft = { q: 'leche' }; assert.notEqual(unappliedDraft.q, nodes(h.tree).find(n => n.type === 'DiscoveryFilters').props.value.q);
  const more = button(h.tree, 'market.showMore'); more.props.onPress(); more.props.onPress(); await settle();
  const append = h.requests.at(-1), parsed = new URL(append.url, 'https://local.test');
  assert.equal(parsed.searchParams.get('q'), 'naranjas'); assert.equal(parsed.searchParams.get('cursor'), 'opaque-orange'); assert.equal(parsed.searchParams.get('responseStatus'), 'none');
  assert.equal(h.requests.filter(req => req.url.includes('cursor=opaque-orange')).length, 1);
  append.resolve(page([request('orange two')])); await settle(); assert.match(texts(h.tree), /orange two/); h.unmount();
});

test('source shopping list keeps query and results on focus and detail return, including pages beyond the first', async () => {
  const h = harness('ShoppingListsScreen'); await settle(); h.apply({ q: 'naranjas', deliveryChannel: 'pickup', proposalDeadlineBefore: '2099-01-01' }); await settle();
  pending(h, '/shopping-lists/market', 'naranjas').resolve(page([list('oranges')], 'list-next')); await settle();
  button(h.tree, 'market.showMore').props.onPress(); await settle(); h.requests.at(-1).resolve(page([list('second list')])); await settle();
  const count = h.requests.length; h.focus(false); h.focus(true); await settle(); assert.equal(h.requests.length, count); assert.match(texts(h.tree), /second list/);
  const card = nodes(h.tree).find(node => node.type === 'TouchableOpacity' && texts(node).includes('oranges'));
  card.props.onPress(); await settle(); h.requests.at(-1).resolve(list('oranges')); await settle();
  const back = nodes(h.tree).find(node => node.type?.name === 'ScreenBack');
  assert.ok(back); back.props.onPress(); await settle(); assert.match(texts(h.tree), /second list/);
  const filter = nodes(h.tree).find(node => node.type === 'DiscoveryFilters'); assert.equal(filter.props.value.q, 'naranjas'); assert.equal(filter.props.value.deliveryChannel, 'pickup');
  assert.equal(h.requests.length, count + 1); h.unmount();
});

test('source shopping list rejects stale responses and retries an append with unchanged applied filters', async () => {
  const h = harness('ShoppingListsScreen'); await settle(); h.apply({ q: 'A' }); await settle(); const a = h.requests.at(-1);
  h.apply({ q: 'B' }); await settle(); const b = h.requests.at(-1); b.resolve(page([list('B list')], 'b-next')); await settle(); a.resolve(page([list('A list')])); await settle();
  assert.doesNotMatch(texts(h.tree), /A list/); button(h.tree, 'market.showMore').props.onPress(); await settle(); h.requests.at(-1).reject(Error('append offline')); await settle();
  assert.match(texts(h.tree), /B list/); button(h.tree, 'Reintentar').props.onPress(); await settle();
  const params = new URL(h.requests.at(-1).url, 'https://local.test').searchParams; assert.equal(params.get('q'), 'B'); assert.equal(params.get('cursor'), 'b-next');
  h.requests.at(-1).resolve(page([list('B second')])); await settle(); assert.match(texts(h.tree), /B second/); h.unmount();
});

test('source account and role transitions reject pending payloads in both screens', async () => {
  for (const screen of ['MarketRequestsScreen', 'ShoppingListsScreen']) {
    for (const transition of ['account', 'role']) {
      const h = harness(screen); await settle(); const old = [...h.requests];
      if (transition === 'account') h.switchAccount('other'); else h.switchRole('buy'); await settle();
      for (const req of old) req.resolve(page([req.url.includes('/market/requests') ? request('foreign old') : list('foreign old')])); await settle();
      assert.doesNotMatch(texts(h.tree), /foreign old/); h.unmount();
    }
  }
});

test('six languages explain response state, delivery channel, response deadline and unit target price', () => {
  for (const locale of ['es', 'en', 'fr', 'it', 'zh', 'ar']) {
    for (const text of Object.values(demandCopy.demandFilterCopy[locale])) assert.ok(text.trim());
    const summary = demandCopy.demandFilterSummary(locale, { responseStatus: 'withdrawn', deliveryChannel: 'pickup', proposalDeadlineBefore: '2099-01-01' });
    assert.equal(summary.length, 3); assert.ok(summary.every(value => value.trim()));
  }
});

test('source market retry after pagination failure repeats the cursor; replacing one stream never removes the other', async () => {
  const h = harness('MarketRequestsScreen'); await settle(); h.apply({ q: 'fruta' }); await settle();
  pending(h, '/market/requests', 'fruta').resolve(page([request('single fruit')], 'single-next'));
  pending(h, '/shopping-lists/market', 'fruta').resolve(page([list('fruit list')], 'list-next')); await settle();
  button(h.tree, 'market.moreLists').props.onPress(); await settle(); h.requests.at(-1).reject(Error('list pagination offline')); await settle();
  assert.match(texts(h.tree), /single fruit/); assert.match(texts(h.tree), /fruit list/);
  button(h.tree, 'Reintentar').props.onPress(); await settle(); const retry = new URL(h.requests.at(-1).url, 'https://local.test');
  assert.equal(retry.searchParams.get('cursor'), 'list-next'); assert.equal(retry.searchParams.get('q'), 'fruta');
  h.requests.at(-1).resolve(page([list('second fruit list')])); await settle(); assert.match(texts(h.tree), /single fruit/); assert.match(texts(h.tree), /second fruit list/); h.unmount();
});

test('source own lists send status and item filters; seller response filtering cannot escape into buyer scope', async () => {
  const h = harness('ShoppingListsScreen', 'buy'); await settle();
  h.apply({ q: 'lavadora', category: 'electrodomesticos', status: 'draft', responseStatus: 'none', unit: 'ud', currency: 'EUR', minPrice: '100', maxPrice: '500' }); await settle();
  const request = h.requests.at(-1), url = new URL(request.url, 'https://local.test'); assert.match(url.pathname, /shopping-lists\/mine$/);
  assert.equal(url.searchParams.get('status'), 'draft'); assert.equal(url.searchParams.get('category'), 'electrodomesticos'); assert.equal(url.searchParams.get('unit'), 'ud'); assert.equal(url.searchParams.get('currency'), 'EUR');
  assert.equal(url.searchParams.get('minPrice'), '100'); assert.equal(url.searchParams.get('maxPrice'), '500'); assert.equal(url.searchParams.has('responseStatus'), false);
  request.reject(Error('mine offline')); await settle(); button(h.tree, 'Reintentar').props.onPress(); await settle(); assert.equal(h.requests.at(-1).url, request.url);
  h.requests.at(-1).resolve(page([list('lavadora')], 'own-next')); await settle();
  // The text edited in the shared filter is not applied, so More retains the original query.
  button(h.tree, 'market.showMore').props.onPress(); await settle(); assert.equal(new URL(h.requests.at(-1).url, 'https://local.test').searchParams.get('q'), 'lavadora'); h.unmount();
});

test('source market does not navigate old cards after account switch while changing role', async () => {
  for (const stream of ['requests', 'lists']) {
    const h = harness('MarketRequestsScreen', 'buy'); await settle();
    pending(h, '/market/requests').resolve(page(stream === 'requests' ? [request('old request')] : []));
    pending(h, '/shopping-lists/market').resolve(page(stream === 'lists' ? [list('old list')] : [])); await settle();
    const gate = h.holdModeChange(), label = stream === 'requests' ? 'market.prepareOffer' : 'market.setPrice';
    const action = button(h.tree, label); assert.ok(action); action.props.onPress(); h.switchAccount('new account'); gate.resolve(); await settle();
    assert.equal(h.navigations.length, 0); h.unmount();
  }
});

test('source market labels withdrawn responses as history and selected responses as orders, not editors', async () => {
  const h = harness('MarketRequestsScreen'); await settle();
  const withdrawn = list('retired list'); withdrawn.myProposal = { id: 'p', status: 'withdrawn', isSelectable: false, isSelected: false, meta: {} };
  const selected = list('chosen list'); selected.myProposal = { id: 'p2', status: 'selected', isSelected: true, isSelectable: false, meta: {} };
  pending(h, '/shopping-lists/market').resolve(page([withdrawn, selected]));
  pending(h, '/market/requests').resolve(page([{ ...request('retired request'), myOffer: { id: 'rp', allwainStatus: 'withdrawn' } }])); await settle();
  assert.ok(button(h.tree, 'Ver historial')); assert.ok(button(h.tree, 'Ver mis pedidos'));
  assert.equal(button(h.tree, 'market.editProposal'), undefined); assert.equal(button(h.tree, 'market.prepareOffer'), undefined); h.unmount();
});

test('source Market constructs metadata for ten thousand rows per lane without mounting their card JSX', async () => {
  const h = harness('MarketRequestsScreen'); await settle();
  pending(h, '/shopping-lists/market').resolve(page(Array.from({ length: 10000 }, (_, index) => list(`list-${index}`))));
  pending(h, '/market/requests').resolve(page(Array.from({ length: 10000 }, (_, index) => request(`request-${index}`)))); await settle();
  assert.equal(h.tree.type, 'VirtualizedResults'); assert.equal(h.tree.props.data.length, 20002); assert.equal(h.cardRenders, 0);
  for (const kind of ['list', 'request']) { const index = h.tree.props.data.findIndex(row => row.kind === kind); h.tree.props.renderItem({ item: h.tree.props.data[index], index }); }
  assert.equal(h.cardRenders, 2); h.unmount();
});

test('source Shopping overview does not create ten thousand cards before FlatList asks for visible rows', async () => {
  const h = harness('ShoppingListsScreen'); await settle();
  pending(h, '/shopping-lists/market').resolve(page(Array.from({ length: 10000 }, (_, index) => list(`list-${index}`)))); await settle();
  assert.equal(h.tree.type, 'VirtualizedResults'); assert.equal(h.tree.props.data.length, 10000); assert.equal(h.cardRenders, 0);
  h.tree.props.renderItem({ item: h.tree.props.data[9999], index: 9999 }); assert.equal(h.cardRenders, 1); h.unmount();
});
