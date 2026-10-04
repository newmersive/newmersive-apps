const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs');
const policy = load('src/utils/shoppingProposalLifecycle.ts');
const copy = load('src/utils/shoppingProposalCopy.ts');

const proposal = patch => ({ id: 'p-1', shoppingListId: 'l-1', ownerUserId: 'seller', title: 'Fruta', price: 10,
  currency: 'EUR', status: 'active', isSelected: false, isSelectable: true, description: 'Naranjas frescas',
  deliveryEstimate: 'En dos días', validUntil: '2099-01-01T00:00:00Z', updatedAt: '2026-10-04T10:00:00Z',
  provider: { id: 'seller', name: 'Comercio', score: 0, reviewCount: 0 },
  items: [{ id: 'pi-1', shoppingListItemId: 'i-1', productName: 'Naranjas', quantity: 1, unit: 'kg', unitPriceAmount: 1000, subtotalAmount: 1000, currency: 'EUR' }],
  ...patch });
const list = patch => ({ id: 'l-1', buyerUserId: 'buyer', buyer: { id: 'buyer', name: 'Cliente' }, title: 'Lista',
  status: 'partially_awarded', version: 2, currency: 'EUR', proposalCount: 1, proposals: [],
  items: [{ id: 'i-1', productName: 'Naranjas', quantity: 1, unit: 'kg', availabilityStatus: 'open' }],
  myProposal: proposal(), ...patch });
const withdrawalReceipt = patch => ({ id: 'p-1', owner: 'allwain', ownerUserId: 'seller', provider: { id: 'seller' },
  allwainType: 'proposal', allwainStatus: 'withdrawn', shoppingListId: 'l-1', ...patch });

test('withdrawn and terminal proposals cannot be accepted, edited, or renewed', () => {
  for (const status of ['withdrawn', 'closed', 'rejected', 'abandoned']) {
    const state = policy.shoppingProposalLifecycle(list(), proposal({ status, isSelectable: true }));
    assert.equal(state.canAccept, false, status); assert.equal(state.canEdit, false, status); assert.equal(state.canWithdraw, false, status);
  }
});
test('a partial award belonging to someone else does not lock this seller, but own selected proposal does', () => {
  const untouched = policy.shoppingProposalLifecycle(list({ selectedOfferId: 'other' }), proposal({ awardedItemCount: 1 }));
  assert.equal(untouched.selected, false); assert.equal(untouched.canWithdraw, true);
  for (const selected of [proposal({ isSelected: true }), proposal({ status: 'selected' }), proposal({ meta: { contractId: 'c-1' } })]) {
    const state = policy.shoppingProposalLifecycle(list(), selected);
    assert.equal(state.selected, true); assert.equal(state.canWithdraw, false); assert.equal(state.canEdit, false);
  }
});
test('expired active proposals may be renewed or withdrawn, but never chosen; a closed list never accepts new work', () => {
  const expired = policy.shoppingProposalLifecycle(list(), proposal({ validUntil: '2020-01-01T00:00:00Z' }));
  assert.equal(expired.canAccept, false); assert.equal(expired.canEdit, true); assert.equal(expired.canWithdraw, true);
  assert.equal(policy.shoppingProposalLifecycle(list({ status: 'closed' }), null).canEdit, false);
});
test('request guard rejects older fetch, navigation away, role change, account change and external auth switch', () => {
  const guard = policy.createShoppingListRequestGuard('a:sell');
  const a = guard.start('detail'); const b = guard.start('detail');
  assert.equal(guard.isCurrent(a), false); assert.equal(guard.isCurrent(b), true);
  guard.invalidate('detail'); assert.equal(guard.isCurrent(b), false);
  const c = guard.start('detail'); guard.setScope('a:buy'); assert.equal(guard.isCurrent(c), false);
  const d = guard.start('overview'); guard.setScope('b:buy'); assert.equal(guard.isCurrent(d), false);
  const e = guard.start('detail'); assert.equal(guard.isCurrent(e, 'c:buy'), false);
  guard.setScope('a:sell'); guard.start('detail'); assert.equal(guard.isCurrent(a), false, 'returning to an account must not revive its old ticket');
});
test('orders target only uses the exact participant agreement and never a buying offerId', () => {
  const agreement = { id: 'c-1', app: 'allwain', offerId: 'p-1', providerUserId: 'seller', requesterUserId: 'buyer' };
  assert.deepEqual(policy.shoppingProposalOrderTarget([agreement], false, 'p-1', 'seller', 'seller'), { section: 'orders', contractId: 'c-1' });
  assert.deepEqual(policy.shoppingProposalOrderTarget([agreement], false, 'p-1', 'buyer', 'buyer'), { section: 'orders', contractId: 'c-1' });
  for (const wrong of [{ ...agreement, offerId: 'other' }, { ...agreement, app: 'trueqia' }, { ...agreement, providerUserId: 'other' }])
    assert.equal(policy.shoppingProposalOrderTarget([wrong], false, 'p-1', 'seller', 'seller'), null);
  assert.equal(policy.shoppingProposalOrderTarget([], false, 'p-1', 'seller', 'seller'), null);
  assert.deepEqual(policy.shoppingProposalOrderTarget([agreement, { ...agreement, id: 'c-2' }], false, 'p-1', 'seller', 'seller'), { section: 'orders' });
  assert.deepEqual(policy.shoppingProposalOrderTarget([agreement], true, 'p-1', 'seller', 'seller'), { section: 'orders' });
});
test('withdrawal and order guidance are provided in all six supported languages', () => {
  for (const locale of ['es', 'en', 'fr', 'it', 'zh', 'ar']) for (const value of Object.values(copy.shoppingProposalCopy(locale))) assert.ok(value.trim().length > 0);
  for (const locale of ['es', 'en', 'fr', 'it', 'zh', 'ar']) for (const code of ['PROPOSAL_LOCKED', 'OFFER_VERSION_CONFLICT', 'OFFER_TERMS_LOCKED', 'PROPOSAL_WITHDRAWN', 'OFFER_CLOSED', 'PROPOSAL_NOT_EDITABLE'])
    assert.notEqual(copy.shoppingProposalFailure(locale, new Error(code), 'fallback'), code);
});

// Execute the source component handlers with native rendering, storage and APIs replaced.
// This is a state/interaction check; it does not simulate native layout or browser paint.
function componentHarness(initialList = list(), api = {}) {
  const states = []; let hook = 0; let effects = []; let props; let tree; let activeAccount = true;
  const alerts = []; const saves = []; const errors = []; const busy = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: value => { const i = hook++; if (!states[i]) states[i] = { value: typeof value === 'function' ? value() : value };
      return [states[i].value, update => { states[i].value = typeof update === 'function' ? update(states[i].value) : update; }]; },
    useRef: value => { const i = hook++; return states[i] ||= { current: value }; },
    useMemo: (callback, deps) => { const i = hook++; const old = states[i]; if (!old || deps.some((d, n) => d !== old.deps[n])) states[i] = { value: callback(), deps }; return states[i].value; },
    useCallback: (callback, deps) => react.useMemo(() => callback, deps),
    useEffect: (callback, deps) => { const i = hook++; const old = states[i]; if (!old || deps.some((d, n) => d !== old.deps[n])) {
      effects.push(() => { old?.cleanup?.(); states[i] = { deps, cleanup: callback() }; });
    } },
  };
  react.useLayoutEffect = react.useEffect;
  const draftStorage = new Map();
  const drafts = { readJourneyDraftChecked: async (account, operation) => ({ status: draftStorage.has(`${account}:${operation}`) ? 'saved' : 'missing', value: draftStorage.get(`${account}:${operation}`) || null }), writeJourneyDraft: async (account, operation, value) => { draftStorage.set(`${account}:${operation}`, value); return true; }, clearJourneyDraftChecked: async (account, operation) => { draftStorage.delete(`${account}:${operation}`); return true; } };
  const sellerDraft = load('src/utils/sellerProposalDraft.ts', { './journeyDrafts': drafts });
  const sellerDraftHook = load('src/utils/useSellerProposalDraft.ts', { react, './sellerProposalDraft': sellerDraft, '../store/authSessionBridge': { captureAuthSession: () => ({ owner: null, generation: 1, isCurrent: () => activeAccount }) } });
  const natives = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'ScrollView', 'Switch', 'Text', 'TextInput', 'TouchableOpacity', 'View'].map(n => [n, n]));
  const filename = path.resolve(__dirname, '../src/screens/Requests/ShoppingListsScreen.tsx');
  const module = new Module(filename); module.paths = Module._nodeModulePaths(path.dirname(filename));
  const replacements = {
    '../../analytics/purchaseAnalytics': require('./helpers/analytics-instrumentation-noop.cjs'),
    react, 'react-native': { ...natives, StyleSheet: { create: v => v } },
    '../../utils/appAlert': { AppAlert: { alert: (title, body, buttons) => alerts.push({ title, body, buttons }) } },
    '@react-native-picker/picker': { Picker: 'Picker' }, 'expo-document-picker': {}, '@react-navigation/native': { useFocusEffect: () => {} },
    'lucide-react-native': new Proxy({}, { get: (_, name) => String(name) }),
    '../../config/api': { apiAuthPost: api.post || (async () => withdrawalReceipt()), apiAuthGet: api.get || (async () => list()), apiAuthPatch: async () => ({}) },
    '../../components/design-system': Object.fromEntries(['BigActionButton', 'EmptyState', 'PublicationImage', 'StatusChip'].map(n => [n, n])),
    '../../store/auth.store': {}, '../../theme/colors': { colors: {} }, '../../components/useRequestKeyboardLayout': {},
    '../../store/authSessionBridge': { captureAuthSession: () => ({ owner: null, generation: 1, isCurrent: () => activeAccount }) },
    '../../utils/journeyDrafts': {}, '../../utils/currentLocation': {}, '../../utils/deliveryIntelligence': {},
    '../../utils/format': { formatCurrency: n => `${n} €` },
    '../../i18n/useAppTranslation': { useAppTranslation: () => ({ locale: 'es', t: k => k }) },
    '../../utils/shoppingProposalLifecycle': policy, '../../utils/shoppingProposalCopy': copy,
    '../../utils/sellerProposalDraft': sellerDraft, '../../utils/useSellerProposalDraft': sellerDraftHook,
    '../../i18n/sellerProposalDraftCopy': load('src/i18n/sellerProposalDraftCopy.ts'),
    '../../components/DiscoveryFilters': { default: 'DiscoveryFilters', __esModule: true },
    '../../components/VirtualizedResults': { default: 'VirtualizedResults', __esModule: true },
    '../../components/DemandFilterFields': { default: 'DemandFilterFields', __esModule: true },
    '../../utils/discoveryFilters': {}, '../../i18n/discoveryFilterCopy': {}, '../../i18n/demandFilterCopy': {}, '../../utils/marketDiscovery': {},
    '../../components/ProposalValidityControl': { ProposalCountdown: 'ProposalCountdown', ProposalValidityControl: 'ProposalValidityControl', nearestProposalDuration: v => v },
  };
  module.require = name => { if (Object.hasOwn(replacements, name)) return replacements[name]; throw Error(`Unexpected import: ${name}`); };
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8') + '\nexport { SellerProposalEditor, BuyerListActions };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  function render(next = {}) {
    props = { ...props, ...next }; hook = 0; tree = module.exports.SellerProposalEditor(props);
    const pending = effects; effects = []; pending.forEach(effect => effect()); return tree;
  }
  props = { list: initialList, actorAccountId: 'seller', sellerEnabled: true, busy: false, setBusy: value => { busy.push(value); props.busy = value; },
    isCurrentScope: () => activeAccount, onActivate() {}, onOrders() {}, onMessage() {}, onError: value => errors.push(value),
    onSaved: updated => { saves.push(updated); render({ list: updated }); },
  };
  render(); render();
  return { render, alerts, saves, errors, busy, get tree() { return tree; },
    buyer: nextList => module.exports.BuyerListActions({ list: nextList, busy: false, onMessage() {}, onChoose() {}, onOrders() {} }),
    switchAccount: () => { activeAccount = false; },
    unmount: () => { for (const value of states) value?.cleanup?.(); },
  };
}
function nodes(tree) { return [tree, ...(tree?.props?.children || []).flat(Infinity).filter(child => typeof child === 'object' && child).flatMap(nodes)]; }
function action(tree, text) {
  return nodes(tree).find(node => node?.type === 'TouchableOpacity' && nodes(node).some(child => child?.type === 'Text' && child.props.children.includes(text)));
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('source editor confirms withdrawal, cancel makes no request, duplicate clicks send only one mutation', async () => {
  let postCount = 0; let release;
  const h = componentHarness(list(), { post: () => { postCount++; return new Promise(resolve => release = resolve); }, get: async () => list({ myProposal: proposal({ status: 'withdrawn' }) }) });
  action(h.tree, 'Retirar propuesta').props.onPress();
  assert.equal(postCount, 0); assert.match(h.alerts[0].body, /pedidos ya creados no se cancelan/);
  h.alerts[0].buttons[0].onPress?.(); assert.equal(postCount, 0);
  h.alerts[0].buttons[1].onPress(); h.alerts[0].buttons[1].onPress(); assert.equal(postCount, 1);
  release(withdrawalReceipt()); await settle();
  assert.equal(h.saves.at(-1).myProposal.status, 'withdrawn');
  assert.equal(action(h.tree, 'Retirar propuesta'), undefined);
  assert.equal(nodes(h.tree).some(node => node.type === 'BigActionButton' && /Actualizar/.test(node.props.label)), false);
  assert.deepEqual(h.busy, [true, false]);
});
test('successful withdrawal followed by failed refresh stays retired and explains the real outcome', async () => {
  const h = componentHarness(list(), { post: async () => withdrawalReceipt(), get: async () => { throw Error('offline'); } });
  action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress(); await settle();
  assert.equal(h.saves.at(-1).myProposal.status, 'withdrawn');
  assert.match(h.errors.at(-1), /se ha retirado/); assert.equal(action(h.tree, 'Retirar propuesta'), undefined);
});
test('a stale or older detail payload cannot reopen a withdrawal already confirmed by the server', async () => {
  for (const detail of [list(), list({ myProposal: null })]) {
    const h = componentHarness(list(), { post: async () => withdrawalReceipt(), get: async () => detail });
    action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress(); await settle();
    assert.equal(h.saves.at(-1).myProposal.status, 'withdrawn');
    assert.equal(action(h.tree, 'Retirar propuesta'), undefined);
    assert.equal(nodes(h.tree).some(node => node.type === 'BigActionButton' && /Enviar|Actualizar/.test(node.props.label)), false);
  }
});
test('a failed withdrawal refreshes a concurrently selected proposal without canceling its order', async () => {
  const selected = list({ myProposal: proposal({ status: 'selected', isSelected: true }) });
  const h = componentHarness(list(), { post: async () => { throw Error('PROPOSAL_LOCKED'); }, get: async () => selected });
  action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress(); await settle();
  assert.equal(h.saves.at(-1).myProposal.status, 'selected'); assert.equal(action(h.tree, 'Retirar propuesta'), undefined);
  assert.ok(nodes(h.tree).some(node => node.type === 'BigActionButton' && node.props.label === 'Ver mis pedidos'));
  assert.match(h.errors.at(-1), /ya tiene un acuerdo o pedido/);
});
test('a timed-out mutation followed by confirmed withdrawn state reports the verified result', async () => {
  const h = componentHarness(list(), { post: async () => { throw Error('timeout'); }, get: async () => list({ myProposal: proposal({ status: 'withdrawn' }) }) });
  action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress(); await settle();
  assert.equal(h.saves.at(-1).myProposal.status, 'withdrawn'); assert.equal(h.errors.at(-1), null);
});
test('a stale confirmation cannot withdraw an updated or selected proposal', () => {
  let mutations = 0; const h = componentHarness(list(), { post: async () => { mutations++; } });
  action(h.tree, 'Retirar propuesta').props.onPress();
  h.render({ list: list({ myProposal: proposal({ status: 'selected', isSelected: true, updatedAt: '2026-10-04T11:00:00Z' }) }) });
  h.alerts[0].buttons[1].onPress(); assert.equal(mutations, 0);
});
test('source editor ignores withdrawal response after account switch or navigation unmount', async () => {
  for (const transition of ['switchAccount', 'unmount']) {
    let release; const h = componentHarness(list(), { post: () => new Promise(resolve => release = resolve) });
    action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress();
    h[transition](); release(withdrawalReceipt()); await settle(); assert.equal(h.saves.length, 0); assert.deepEqual(h.errors, [null]);
  }
});
test('source buyer list never accepts or counts down a retired proposal even with stale isSelectable=true', () => {
  const h = componentHarness(); const retired = h.buyer(list({ proposals: [proposal({ status: 'withdrawn', isSelectable: true })] }));
  assert.equal(action(retired, 'Elegir esta parte'), undefined); assert.equal(action(retired, 'Elegir y pagar'), undefined);
  assert.equal(nodes(retired).some(node => node.type === 'ProposalCountdown'), false);
  assert.ok(nodes(retired).some(node => node.type === 'StatusChip' && node.props.label === 'Propuesta retirada'));
});
test('source chosen proposal opens existing orders and hides mutation actions', () => {
  const h = componentHarness(list({ myProposal: proposal({ isSelected: true }) }));
  assert.ok(nodes(h.tree).some(node => node.type === 'BigActionButton' && node.props.label === 'Ver mis pedidos'));
  assert.equal(action(h.tree, 'Retirar propuesta'), undefined);
  assert.equal(nodes(h.tree).some(node => node.type === 'ProposalValidityControl'), false);
});
test('source withdrawal rejects a wrong receipt without announcing or applying retirement', async () => {
  for (const receipt of [{}, withdrawalReceipt({ id: 'other' }), withdrawalReceipt({ ownerUserId: 'other' }), withdrawalReceipt({ allwainType: 'catalog' }), withdrawalReceipt({ allwainStatus: 'active' })]) {
    const h = componentHarness(list(), { post: async () => receipt, get: async () => list() });
    action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress(); await settle();
    assert.equal(h.saves.some(saved => saved.myProposal?.status === 'withdrawn'), false);
    assert.match(h.errors.at(-1), /No pudimos retirar/);
  }
});
test('source cannot verify a withdrawal using another list, buyer, proposal or owner', async () => {
  const retired = proposal({ status: 'withdrawn' });
  for (const detail of [list({ id: 'other', myProposal: retired }), list({ buyerUserId: 'other', myProposal: retired }),
    list({ myProposal: { ...retired, id: 'other' } }), list({ myProposal: { ...retired, ownerUserId: 'other' } }), list({ myProposal: { ...retired, shoppingListId: 'other' } })]) {
    const h = componentHarness(list(), { post: async () => ({}), get: async () => detail });
    action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress(); await settle();
    assert.equal(h.saves.length, 0); assert.match(h.errors.at(-1), /No pudimos retirar/);
  }
});
test('an invalid receipt can recover only through the matching verified withdrawn proposal', async () => {
  const h = componentHarness(list(), { post: async () => ({}), get: async () => list({ myProposal: proposal({ status: 'withdrawn' }) }) });
  action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress(); await settle();
  assert.equal(h.saves.at(-1).myProposal.status, 'withdrawn'); assert.equal(h.errors.at(-1), null);
});
test('a valid withdrawal receipt never replaces the current list with a foreign detail response', async () => {
  const h = componentHarness(list(), { post: async () => withdrawalReceipt(), get: async () => list({ id: 'other', buyerUserId: 'other', myProposal: proposal({ status: 'withdrawn' }) }) });
  action(h.tree, 'Retirar propuesta').props.onPress(); h.alerts[0].buttons[1].onPress(); await settle();
  assert.ok(h.saves.every(saved => saved.id === 'l-1' && saved.buyerUserId === 'buyer'));
  assert.equal(h.saves.at(-1).myProposal.status, 'withdrawn'); assert.match(h.errors.at(-1), /No pudimos actualizar/);
});
