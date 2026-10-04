const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs');
const lifecycle = load('src/utils/requestLifecycle.ts');
const requestWork = load('src/utils/requestWork.ts', { './buyerCheckout': load('src/utils/buyerCheckout.ts') });
const requestWorkCopy = load('src/i18n/requestWorkCopy.ts').requestWorkCopy;
const copies = load('src/i18n/buyerRequestLifecycleCopy.ts').buyerRequestLifecycleCopy;
const requestLabels = load('src/i18n/requestCopy.ts').requestCopy;
const colors = load('src/theme/colors.ts').colors;
const request = (status, extra = {}) => ({ id: 'request-a', userId: 'buyer-a', status, title: 'Oranges', description: '', sourceType: 'text', extracted: { productName: 'Oranges', quantity: 5, unit: 'kg', confidence: 1, deliveryWindow: 'Tomorrow', deliveryChannel: 'pickup', deliveryMethod: 'pickup', deliveryAddress: 'Foios' }, offers: [], ai: { summary: '', confidence: 1, warnings: [] }, ...extra });

test('active and history are complete disjoint server scopes, including archived history before pagination', () => {
  const active = lifecycle.requestStatuses('active'), history = lifecycle.requestStatuses('history');
  assert.deepEqual(active, ['draft', 'ready', 'submitted', 'awarded']);
  assert.deepEqual(history, ['closed', 'canceled', 'archived']);
  assert.equal(active.some(value => history.includes(value)), false);
  const url = lifecycle.requestsPageUrl('history', 'old request/1');
  assert.equal(url, '/allwain/scan-requests?limit=30&status=closed,canceled,archived&cursor=old%20request%2F1');
  assert.equal(lifecycle.requestIsInScope(request('archived'), 'history'), true);
  assert.equal(lifecycle.requestIsInScope(request('archived'), 'active'), false);
});

test('request actions separate publication lifecycle from the existing order', () => {
  const expected = { draft: 'discard', ready: 'discard', submitted: 'withdraw', awarded: 'close', closed: 'archive', canceled: 'archive', archived: null };
  for (const [status, action] of Object.entries(expected)) assert.equal(lifecycle.requestPublicationAction(request(status)), action, status);
  for (const status of ['draft', 'ready', 'submitted']) assert.equal(lifecycle.requestPublicationAction(request(status, { selectedOfferId: 'chosen' })), null, 'a stale selected request must not expose withdrawal');
  assert.equal(lifecycle.hasRequestOrder(request('closed', { selectedOfferId: 'chosen' })), true);
  assert.equal(lifecycle.publicationTarget('close'), 'closed');
  assert.equal(lifecycle.publicationTarget('archive'), 'archived');
});

test('confirmation rereads the request and blocks withdrawal if a proposal was selected meanwhile', async () => {
  let patches = 0;
  await assert.rejects(() => lifecycle.transitionRequestPublication(request('submitted'), 'withdraw', {
    accountId: 'buyer-a', isCurrent: () => true,
    read: async () => request('awarded', { selectedOfferId: 'chosen' }),
    patch: async () => { patches++; return request('canceled'); },
  }), /REQUEST_PUBLICATION_CHANGED/);
  assert.equal(patches, 0);
});

test('wrong owner or wrong server receipt never produces a successful removal', async () => {
  let patches = 0;
  const dependencies = { accountId: 'buyer-a', isCurrent: () => true, read: async () => request('draft', { userId: 'buyer-b' }), patch: async () => { patches++; return request('canceled'); } };
  await assert.rejects(() => lifecycle.transitionRequestPublication(request('draft'), 'discard', dependencies), /REQUEST_PUBLICATION_CHANGED/);
  assert.equal(patches, 0);
  await assert.rejects(() => lifecycle.transitionRequestPublication(request('draft'), 'discard', { ...dependencies, read: async () => request('draft'), patch: async () => request('draft') }), /REQUEST_PUBLICATION_UNCONFIRMED/);
});

test('account switch while refreshing a confirmation prevents the mutation; late patch receipt is ignored', async () => {
  let current = true, patches = 0;
  const result = await lifecycle.transitionRequestPublication(request('draft'), 'discard', {
    accountId: 'buyer-a', isCurrent: () => current,
    read: async () => { current = false; return request('draft'); },
    patch: async () => { patches++; return request('canceled'); },
  });
  assert.equal(result, null); assert.equal(patches, 0);
  current = true;
  assert.equal(await lifecycle.transitionRequestPublication(request('closed'), 'archive', {
    accountId: 'buyer-a', isCurrent: () => current, read: async () => request('closed'),
    patch: async () => { current = false; return request('archived'); },
  }), null);
});

test('successful withdrawal only patches status; selected-order history remains readable', async () => {
  let sent;
  const result = await lifecycle.transitionRequestPublication(request('awarded', { selectedOfferId: 'chosen' }), 'close', {
    accountId: 'buyer-a', isCurrent: () => true, read: async () => request('awarded', { selectedOfferId: 'chosen' }),
    patch: async (id, status) => { sent = { id, status }; return request(status, { selectedOfferId: 'chosen' }); },
  });
  assert.deepEqual(sent, { id: 'request-a', status: 'closed' });
  assert.equal(result.selectedOfferId, 'chosen');
});

test('order lookup asks for the exact chosen offer and rejects unrelated or other-account contracts', async () => {
  let url;
  const chosen = request('awarded', { selectedOfferId: 'selected/1' });
  const read = async value => { url = value; return { items: [
    { id: 'other-owner', offerId: 'selected/1', requesterUserId: 'buyer-b' },
    { id: 'other-offer', offerId: 'different', requesterUserId: 'buyer-a' },
    { id: 'existing-agreement', offerId: 'selected/1', requesterUserId: 'buyer-a', status: 'rejected' },
  ] }; };
  assert.equal(await lifecycle.existingRequestContract(chosen, 'buyer-a', () => true, read), 'existing-agreement');
  assert.equal(url, '/allwain/contracts?scope=buyer&offerId=selected%2F1&limit=1');
  assert.equal(await lifecycle.existingRequestContract(chosen, 'buyer-a', () => false, read), null);
  assert.equal(await lifecycle.existingRequestContract(chosen, 'buyer-a', () => true, async () => ({ items: [{ id: 'unrelated', offerId: 'other', requesterUserId: 'buyer-a' }] })), null);
});

test('all six locales provide every lifecycle confirmation and result', () => {
  assert.deepEqual(Object.keys(copies).sort(), ['ar', 'en', 'es', 'fr', 'it', 'zh']);
  for (const copy of Object.values(copies)) {
    for (const key of ['active', 'history', 'hint', 'orders', 'orderMissing', 'error', 'changed']) assert.ok(copy[key]?.trim());
    for (const action of ['discard', 'withdraw', 'close', 'archive']) for (const key of ['label', 'confirmation', 'done']) assert.ok(copy.actions[action][key]?.trim());
  }
});

// Execute the actual screens with deterministic hooks and transport. This checks
// event handlers, focus cleanup and confirmation behavior, not source strings.
function hooks() {
  const slots = []; let cursor = 0, pending = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: value => { const index = cursor++; return slots[index] ||= { current: value }; },
    useState: value => { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof value === 'function' ? value() : value }; return [slots[index].value, update => { slots[index].value = typeof update === 'function' ? update(slots[index].value) : update; }]; },
    useCallback: (fn, deps) => { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect: (fn, deps) => { const index = cursor++; const previous = slots[index]; if (!previous || !equal(previous.deps, deps)) { slots[index] = { deps }; pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  return { react, render(fn) { cursor = 0; const tree = fn(); const run = pending; pending = []; run.forEach(task => task()); return tree; }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

function sourceScreen(filename, replacements) {
  const absolute = path.resolve(__dirname, '..', filename), mod = new Module(absolute, module);
  mod.filename = absolute; mod.paths = Module._nodeModulePaths(path.dirname(absolute));
  mod.require = name => { if (Object.hasOwn(replacements, name)) return replacements[name]; throw new Error('Unmocked screen dependency: ' + name); };
  mod._compile(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, absolute);
  return mod.exports.default;
}

function screenHarness({ detail = false, item = request('draft'), get, patch, post, rawText } = {}) {
  const runtime = hooks(), calls = [], alerts = [], navigationCalls = [], localClears = [];
  let accountId = 'buyer-a';
  let appMode = 'sell';
  let focusCallback, focusCleanup;
  const auth = selector => selector({ user: { id: accountId }, locale: 'es' });
  auth.getState = () => ({ user: { id: accountId }, locale: 'es', appMode, setAppMode: async mode => { appMode = mode; } });
  const transport = {
    apiGet: async () => ({ publicationCardRequired: false }),
    apiAuthGet: async url => {
      calls.push(['get', url]);
      if (url.includes('/proposals?')) {
        const proposals = (item.offers || []).map(offer => ({ ...offer, requestId: offer.requestId || item.id }));
        return { items: proposals.slice(0, 20), summary: { total: proposals.length, active: proposals.filter(offer => !offer.allwainStatus || offer.allwainStatus === 'active').length }, selectedOffer: proposals.find(offer => offer.id === item.selectedOfferId) || null, pageInfo: { hasNextPage: false, nextCursor: null } };
      }
      return get ? get(url) : url.includes('scan-requests/') ? item : { items: [item], pageInfo: {} };
    },
    apiAuthPatch: async (url, body) => { calls.push(['patch', url, body]); return patch ? patch(url, body) : { ...item, ...body }; },
    apiAuthPost: async (url, body) => { calls.push(['post', url, body]); return post ? post(url, body) : { kind: 'request', request: item }; },
  };
  const navigation = Object.fromEntries(['navigate', 'replace', 'setParams', 'goBack'].map(name => [name, (...args) => navigationCalls.push([name, ...args])]));
  const journey = { readJourneyDraft: async () => ({ requestText: rawText || 'Oranges' }), readJourneyDraftChecked: async () => ({ status:'saved',value:{requestText:rawText || 'Oranges'} }), clearJourneyDraftChecked: async (...args) => {localClears.push(args);return true;}, clearJourneyDraft: async (...args) => localClears.push(args) };
  const continuity = load('src/utils/manualRequestContinuity.ts', { './journeyDrafts':journey,'./webAppUrl':load('src/utils/webAppUrl.ts') });
  const rn = { StyleSheet: { create: value => value }, Platform: { OS: 'web' }, AccessibilityInfo: { announceForAccessibility() {} } };
  for (const name of ['ActivityIndicator', 'FlatList', 'Text', 'TouchableOpacity', 'View', 'KeyboardAvoidingView', 'ScrollView', 'TextInput']) rn[name] = name;
  const replacements = {
    '../../analytics/purchaseAnalytics': require('./helpers/analytics-instrumentation-noop.cjs'),
    react: runtime.react, 'react-native': rn,
    '@react-navigation/native': { useFocusEffect: callback => runtime.react.useEffect(() => { focusCallback = callback; focusCleanup = callback(); return () => focusCleanup?.(); }, [callback]), useNavigation: () => navigation },
    '../../config/api': transport, '../../store/auth.store': { useAuthStore: auth },
    '../../theme/colors': { colors }, '../../i18n': { isRtlLocale: () => false },
    '../../i18n/useAppTranslation': { useAppTranslation: () => ({ locale: 'es', t: key => key === 'common.retry' ? 'Reintentar' : key }) },
    '../../i18n/requestCopy': { requestCopy: requestLabels }, '../../i18n/buyerRequestLifecycleCopy': { buyerRequestLifecycleCopy: copies },
    '../../utils/appAlert': { AppAlert: { alert: (...args) => alerts.push(args) } }, '../../utils/requestLifecycle': lifecycle,
    '../../utils/requestWork': requestWork, '../../i18n/requestWorkCopy': { requestWorkCopy },
    '../../utils/manualRequestContinuity':continuity,'../../i18n/buyerContinuityCopy':load('src/i18n/buyerContinuityCopy.ts'),
    '../../components/DiscoveryFilters': { default: 'DiscoveryFilters', REQUEST_DISCOVERY_FIELDS: ['q','category','subcategory','productKind','unit','currency','minPrice','maxPrice','locationLabel','dateFrom','dateTo','status','latitude','longitude','radiusKm'] },
    '../../store/authSessionBridge': { captureAuthSession: () => { const id = accountId; return { isCurrent: () => id === accountId }; } },
    '../../utils/discoveryFilters': { discoveryQueryKey: () => '{}', useDiscoveryQuery: () => ({ query: {}, ready: true, setQuery() {} }), discoveryPageUrl: (url, query, options) => `${url}?limit=30&status=${options.fixed.status}${options.cursor ? `&cursor=${encodeURIComponent(options.cursor)}` : ''}` },
    '../../components/design-system': { BigActionButton: 'BigActionButton', ProductCard: 'ProductCard', OrderCard: 'OrderCard', PublicationImage: 'PublicationImage', DemoCard: 'DemoCard' },
    '../../utils/journeyDrafts': journey,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'lucide-react-native': Object.fromEntries(['Boxes', 'Check', 'ChevronDown', 'CreditCard', 'MessageCircle', 'Navigation', 'RefreshCw', 'Scale', 'ShieldCheck', 'Sparkles'].map(name => [name, name])),
    '../../utils/format': { formatCurrency: value => String(value) }, '../../components/OfferOrderForm': { default: 'OfferOrderForm' },
    '../../utils/productIntelligence': { isWholeUnit: () => true, measurementForProduct: () => ({ unit: 'kg', label: 'kg', quantityLabel: 'Cantidad', step: 1 }), measurementFromProductName: () => ({ unit: 'kg' }), MEASUREMENT_OPTIONS: [] },
    '../../utils/openExternalUrl': { openExternalUrl: async () => {} }, '../../utils/currentLocation': { getAllwainCurrentLocation: async () => ({}) },
    '../../utils/deliveryIntelligence': { interpretDeliveryWindow: () => null }, '../../analytics': { trackAnalyticsEvent: async () => {} },
    '../../components/ProposalValidityControl': { ProposalCountdown: 'ProposalCountdown' }, '../../utils/webAppUrl': { allwainWebAppReturnUrl: () => null },
    '../../utils/scanCaptureMemory': { readScanCapture: () => rawText ? { sourceType: 'text', rawText } : undefined, forgetScanCapture() {} },
    '../../components/useRequestKeyboardLayout': { useRequestKeyboardLayout: () => ({ keyboardAvoidingProps: {}, footerPaddingBottom: 12 }) },
  };
  const Screen = sourceScreen(detail ? 'src/screens/Scan/ScanResultScreen.tsx' : 'src/screens/Requests/MyRequestsScreen.tsx', replacements);
  let tree;
  function render() { tree = runtime.render(() => Screen({ navigation, route: { params: rawText ? { captureId: 'capture' } : { requestId: item.id } } })); return tree; }
  async function flush() { for (let count = 0; count < 5; count++) await new Promise(resolve => setImmediate(resolve)); return render(); }
  render();
  return { calls, alerts, navigationCalls, localClears, flush, render, get tree() { return tree; }, get appMode() { return appMode; }, switchAccount(value) { accountId = value; }, blur() { focusCleanup?.(); }, focus() { focusCleanup = focusCallback?.(); }, unmount: runtime.unmount };
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return node?.props?.children ? textOf(node.props.children) : '';
}
function findButton(node, label) {
  if (Array.isArray(node)) { for (const child of node) { const result = findButton(child, label); if (result) return result; } return null; }
  if (!node?.props) return null;
  if (node.props.onPress && textOf(node).includes(label)) return node;
  return findButton(node.props.children, label);
}

test('list action is confirmed and does nothing if the account changed while the dialog was open', async () => {
  const ui = screenHarness(); await ui.flush();
  const card = ui.tree.props.renderItem({ item: request('draft') });
  findButton(card, 'Descartar borrador').props.onPress();
  assert.equal(ui.alerts.length, 1); assert.equal(ui.calls.some(call => call[0] === 'patch'), false);
  ui.switchAccount('buyer-b');
  ui.alerts[0][2][1].onPress(); await ui.flush();
  assert.equal(ui.calls.some(call => call[0] === 'patch'), false);
  assert.equal(ui.calls[0][1], '/allwain/scan-requests?limit=30&status=draft,ready,submitted,awarded');
});

test('actual list history tab requests server history rather than filtering the first page locally', async () => {
  const ui = screenHarness(); await ui.flush();
  findButton(ui.tree.props.ListHeaderComponent, 'Historial').props.onPress(); ui.render(); await ui.flush();
  assert.equal(ui.calls.at(-1)[1], '/allwain/scan-requests?limit=30&status=closed,canceled,archived');
});

test('archiving from history updates the existing card without resetting already loaded pages', async () => {
  const item = request('closed');
  const ui = screenHarness({ item }); await ui.flush();
  findButton(ui.tree.props.ListHeaderComponent, 'Historial').props.onPress(); ui.render(); await ui.flush();
  const initialLoads = ui.calls.filter(call => call[0] === 'get' && call[1].includes('?limit=30')).length;
  findButton(ui.tree.props.renderItem({ item }), 'Archivar petición').props.onPress(); ui.alerts[0][2][1].onPress(); await ui.flush();
  assert.equal(ui.tree.props.data[0].status, 'archived');
  assert.equal(ui.calls.filter(call => call[0] === 'get' && call[1].includes('?limit=30')).length, initialLoads);
  assert.equal(findButton(ui.tree.props.renderItem({ item: ui.tree.props.data[0] }), 'Archivar petición'), null);
});

test('existing order CTA navigates contractId and never offerId or new checkout', async () => {
  const selected = request('awarded', { selectedOfferId: 'chosen' });
  const ui = screenHarness({ item: selected, get: async url => url.includes('/contracts?') ? { items: [{ id: 'existing-contract', requesterUserId: 'buyer-a', offerId: 'chosen' }] } : { items: [selected] } });
  await ui.flush(); const card = ui.tree.props.renderItem({ item: selected });
  findButton(card, 'Ver pedido y pago').props.onPress(); await ui.flush();
  const route = ui.navigationCalls[0][2];
  assert.equal(route.params.contractId, 'existing-contract'); assert.equal(route.params.section, 'orders');
  assert.equal(ui.appMode, 'buy');
  assert.equal(route.params.offerId, undefined); assert.equal(ui.calls.some(call => call[0] === 'post'), false);
});

test('failed order lookup is visible and never redirects to a purchase or generic order silently', async () => {
  const selected = request('awarded', { selectedOfferId: 'chosen' });
  const ui = screenHarness({ item: selected, get: async url => url.includes('/contracts?') ? Promise.reject(new Error('offline')) : { items: [selected] } });
  await ui.flush(); findButton(ui.tree.props.renderItem({ item: selected }), 'Ver pedido y pago').props.onPress(); await ui.flush();
  assert.equal(ui.navigationCalls.length, 0); assert.ok(textOf(ui.tree.props.ListHeaderComponent).includes(copies.es.orderError));
  ui.tree.props.ListFooterComponent.props.onPress(); await ui.flush();
  assert.equal(ui.calls.filter(call => call[1] === '/allwain/contracts?scope=buyer&offerId=chosen&limit=1').length, 2);
  assert.equal(ui.navigationCalls.length, 0);
});

test('detail discard is confirmed, keeps an unrelated same-text local draft and moves the server request to history', async () => {
  const ui = screenHarness({ detail: true, rawText: 'Oranges' }); await ui.flush();
  findButton(ui.tree, 'Descartar borrador').props.onPress();
  assert.equal(ui.calls.some(call => call[0] === 'patch'), false);
  ui.alerts[0][2][1].onPress(); await ui.flush();
  assert.deepEqual(ui.calls.find(call => call[0] === 'patch')[2], { status: 'canceled' });
  assert.deepEqual(ui.localClears, []); assert.ok(textOf(ui.tree).includes(copies.es.actions.discard.done));
});

test('detail stops a two-step confirm between save and confirm if the account changes', async () => {
  let release;
  const ui = screenHarness({ detail: true, patch: async () => new Promise(resolve => { release = resolve; }) }); await ui.flush();
  findButton(ui.tree, 'Confirmar ficha').props.onPress(); await ui.flush();
  assert.equal(typeof release, 'function');
  ui.switchAccount('buyer-b'); ui.render();
  release(request('draft')); await ui.flush();
  assert.equal(ui.calls.some(call => call[0] === 'post' && call[1].endsWith('/confirm')), false);
});

test('detail ignores a late request fetch after leaving the screen', async () => {
  let release;
  const ui = screenHarness({ detail: true, get: async () => new Promise(resolve => { release = resolve; }) });
  await ui.flush(); ui.unmount(); release(request('submitted')); await ui.flush();
  assert.equal(ui.navigationCalls.length, 0);
  assert.ok(!textOf(ui.tree).includes('Petición activa'));
});

test('returning during OCR awaits the original capture and never creates a duplicate draft', async () => {
  let release;
  const ui = screenHarness({ detail: true, rawText: 'Oranges', post: async () => new Promise(resolve => { release = resolve; }) });
  await ui.flush(); assert.equal(ui.calls.filter(call => call[0] === 'post' && call[1] === '/allwain/scan-captures').length, 1);
  ui.blur(); ui.focus(); await ui.flush();
  assert.equal(ui.calls.filter(call => call[0] === 'post' && call[1] === '/allwain/scan-captures').length, 1);
  release({ kind: 'request', request: request('draft') }); await ui.flush();
  assert.ok(textOf(ui.tree).includes('Revisa la ficha'));
});

test('returning after a late lifecycle update refreshes the request and releases busy actions', async () => {
  let release; let current = request('submitted');
  const ui = screenHarness({ detail: true, item: current, get: async () => current, patch: async () => new Promise(resolve => { release = resolve; }) });
  await ui.flush(); findButton(ui.tree, 'Retirar petición').props.onPress(); ui.alerts[0][2][1].onPress(); await ui.flush();
  ui.blur(); current = request('canceled'); release(current); await ui.flush(); ui.focus(); await ui.flush();
  const archive = findButton(ui.tree, 'Archivar petición'); assert.ok(archive); assert.equal(archive.props.disabled, false);
});
