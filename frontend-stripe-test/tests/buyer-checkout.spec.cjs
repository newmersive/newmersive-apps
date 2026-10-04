const assert = require('node:assert/strict');
const { it } = require('node:test');
const load = require('./helpers/load-typescript.cjs');
const { checkoutBlockReason, checkoutPaymentActionable, unresolvedRecurringOrder,
  refreshBuyerCheckoutOrder, runBuyerCheckout } = load('src/utils/buyerCheckout.ts');
const bridge = load('src/store/authSessionBridge.ts');
const contract = { id: 'contract-A', requesterUserId: 'buyer-A', paymentStatus: 'requires_customer_action' };
const order = { id: 'order-A', contractId: contract.id, buyerUserId: 'buyer-A', paymentStatus: 'requires_customer_action',
  checkoutBlockReason: null, latestPayment: { kind: 'payment' } };
function harness(overrides = {}) {
  let generation = 1; let token = 'session-A'; const calls = { reads: [], published: [], posts: [], opened: [] };
  bridge.registerAuthSessionBridge({ getToken: () => token, getGeneration: () => generation, getIsTransitioning: () => false });
  const session = bridge.captureAuthSession();
  const context = { buyerId: 'buyer-A', contract, order, isCurrent: session.isCurrent,
    readOrder: async id => { calls.reads.push(id); return { ...order }; },
    publishOrder: fresh => { calls.published.push(fresh); },
    postCheckout: async fresh => { calls.posts.push(fresh); return { orderId: order.id, url: 'https://checkout.stripe.test/TEST' }; },
    openUrl: async url => { calls.opened.push(url); }, ...overrides };
  return { context, calls, retire: () => { generation++; token = 'session-B'; }, rotateToken: () => { token = 'rotated-A'; } };
}
function latch() {
  let release; let enter;
  const reached = new Promise(resolve => { enter = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  return { reached, release, wait: async () => { enter(); await paused; } };
}

it('uses explicit blockers and conservative legacy evidence without treating a missing field as permission', () => {
  for (const kind of ['recurring_charge', 'deferred_charge']) {
    assert.equal(checkoutBlockReason({ ...order, checkoutBlockReason: kind }), kind);
    assert.equal(checkoutBlockReason({ ...order, checkoutBlockReason: undefined, latestPayment: { kind } }), kind);
    assert.equal(checkoutBlockReason({ latestPayment: { kind } }), kind);
  }
  assert.equal(checkoutBlockReason({ ...order, checkoutBlockReason: undefined, recurringSequence: 2 }), 'recurring_charge');
  for (const value of [undefined, {}, { checkoutBlockReason: 'unknown' }, { latestPayment: { kind: 'payment' } }])
    assert.equal(checkoutBlockReason(value), undefined);
  assert.equal(checkoutBlockReason(order), null);
});
it('honors the fresh explicit null after payment despite retained durable charge history', async () => {
  for (const kind of ['recurring_charge', 'deferred_charge']) {
    const paid = { ...order, paymentStatus: 'paid', recurringSequence: kind === 'recurring_charge' ? 2 : null,
      checkoutBlockReason: null, latestPayment: { kind } };
    assert.equal(checkoutBlockReason(paid), null);
    const h = harness({ readOrder: async () => paid });
    assert.equal(await runBuyerCheckout(h.context), 'updated');
    assert.equal(h.calls.posts.length, 0); assert.equal(h.calls.opened.length, 0);
  }
});
it('does not treat null as permission to pay an already paid, processing or closed order', async () => {
  for (const paymentStatus of ['paid', 'payment_processing', 'canceled', 'refunded', 'expired', 'payment_method_saved']) {
    const h = harness({ readOrder: async () => ({ ...order, paymentStatus }) });
    assert.equal(await runBuyerCheckout(h.context), 'updated'); assert.equal(h.calls.posts.length, 0);
    assert.equal(h.calls.opened.length, 0); assert.equal(checkoutPaymentActionable(paymentStatus), false);
  }
});
it('preserves initial checkout for a new accepted contract without an order', async () => {
  const h = harness({ order: undefined });
  assert.equal(await runBuyerCheckout(h.context), 'opened'); assert.equal(h.calls.reads.length, 0);
  assert.equal(h.calls.posts.length, 1); assert.equal(h.calls.opened.length, 1);
});
it('always rechecks an existing order even if its earlier DTO explicitly reported no blocker', async () => {
  const h = harness(); assert.equal(await runBuyerCheckout(h.context), 'opened');
  assert.deepEqual(h.calls.reads, [order.id]); assert.equal(h.calls.published.length, 1);
  assert.equal(h.calls.posts[0].id, order.id); assert.equal(h.calls.opened.length, 1);
});
for (const kind of ['recurring_charge', 'deferred_charge']) it(`refreshes and shows ${kind} evidence without submitting checkout`, async () => {
  const h = harness({ readOrder: async () => ({ ...order, checkoutBlockReason: kind }) });
  assert.equal(await runBuyerCheckout(h.context), 'blocked'); assert.equal(h.calls.published[0].checkoutBlockReason, kind);
  assert.equal(h.calls.posts.length, 0); assert.equal(h.calls.opened.length, 0);
});
it('lets the authoritative checkout endpoint decide when a legacy order lacks the blocker field', async () => {
  for (const checkoutBlockReason of [undefined, false, 'novel_reason']) {
    const h = harness({ readOrder: async () => ({ ...order, checkoutBlockReason }) });
    assert.equal(await runBuyerCheckout(h.context), 'opened'); assert.equal(h.calls.posts.length, 1);
  }
});
it('does not inspect or submit a different buyer contract from an old rendered handler', async () => {
  const h = harness({ buyerId: 'buyer-B' }); assert.equal(await runBuyerCheckout(h.context), 'retired');
  assert.deepEqual(h.calls, { reads: [], published: [], posts: [], opened: [] });
});
it('rejects a mismatched existing order before asking the API for it', async () => {
  const h = harness({ order: { ...order, buyerUserId: 'buyer-B' } });
  await assert.rejects(runBuyerCheckout(h.context), /no corresponde/); assert.equal(h.calls.reads.length, 0);
});
it('rejects a detail for a different order, contract or buyer without publishing it', async () => {
  for (const mismatch of [{ id: 'other-order' }, { contractId: 'other-contract' }, { buyerUserId: 'buyer-B' }]) {
    const h = harness({ readOrder: async () => ({ ...order, ...mismatch }) });
    await assert.rejects(runBuyerCheckout(h.context), /no corresponde/);
    assert.equal(h.calls.published.length, 0); assert.equal(h.calls.posts.length, 0); assert.equal(h.calls.opened.length, 0);
  }
});
it('retires a held detail after an account change, including a new login with the same user ID', async () => {
  const gate = latch(); const h = harness({ readOrder: async () => { await gate.wait(); return { ...order }; } });
  const pending = runBuyerCheckout(h.context); await gate.reached; h.retire(); gate.release();
  assert.equal(await pending, 'retired'); assert.equal(h.calls.published.length, 0);
  assert.equal(h.calls.posts.length, 0); assert.equal(h.calls.opened.length, 0);
});
it('keeps ordinary token rotation in the same identity eligible for the original action', async () => {
  const gate = latch(); const h = harness({ readOrder: async () => { await gate.wait(); return { ...order }; } });
  const pending = runBuyerCheckout(h.context); await gate.reached; h.rotateToken(); gate.release();
  assert.equal(await pending, 'opened'); assert.equal(h.calls.posts.length, 1);
});
it('does not open a held checkout URL after account change', async () => {
  const gate = latch(); const h = harness({ postCheckout: async () => { await gate.wait();
    return { orderId: order.id, url: 'https://checkout.stripe.test/OLD_IDENTITY' }; } });
  const pending = runBuyerCheckout(h.context); await gate.reached; h.retire(); gate.release();
  assert.equal(await pending, 'retired'); assert.equal(h.calls.opened.length, 0);
});
it('retires a superseded or unmounted action before publishing its held detail', async () => {
  const gate = latch(); let current = true;
  const h = harness({ isCurrent: () => current, readOrder: async () => { await gate.wait(); return { ...order }; } });
  const pending = runBuyerCheckout(h.context); await gate.reached; current = false; gate.release();
  assert.equal(await pending, 'retired'); assert.equal(h.calls.published.length, 0); assert.equal(h.calls.posts.length, 0);
});
it('does not POST or navigate after collapsing the selected contract or selecting another one during its GET', async () => {
  for (const nextSelection of [null, 'contract-B']) {
    const gate = latch(); let selectedContract = contract.id;
    const h = harness({ isCurrent: () => selectedContract === contract.id,
      readOrder: async () => { await gate.wait(); return { ...order }; } });
    const pending = runBuyerCheckout(h.context); await gate.reached;
    selectedContract = nextSelection; gate.release();
    assert.equal(await pending, 'retired'); assert.equal(h.calls.published.length, 0);
    assert.equal(h.calls.posts.length, 0); assert.equal(h.calls.opened.length, 0);
  }
});
it('does not open an existing checkout after losing screen focus or changing buyer/seller mode', async () => {
  for (const transition of ['blur', 'seller']) {
    const gate = latch(); let focused = true; let mode = 'buyer';
    const h = harness({ isCurrent: () => focused && mode === 'buyer', postCheckout: async () => {
      await gate.wait(); return { orderId: order.id, url: 'https://checkout.stripe.test/OLD_SCREEN' };
    } });
    const pending = runBuyerCheckout(h.context); await gate.reached;
    if (transition === 'blur') focused = false; else mode = 'seller';
    gate.release(); assert.equal(await pending, 'retired'); assert.equal(h.calls.opened.length, 0);
  }
});
it('rejects insecure checkout links and different order responses', async () => {
  for (const response of [{ orderId: 'other', url: 'https://checkout.stripe.test/TEST' },
    { orderId: order.id, url: 'javascript:TEST' }, { url: 'https://checkout.stripe.test/TEST' }]) {
    const h = harness({ postCheckout: async () => response });
    await assert.rejects(runBuyerCheckout(h.context)); assert.equal(h.calls.opened.length, 0);
  }
});
it('propagates a late definitive backend rejection without opening a link or retrying', async () => {
  let calls = 0; const h = harness({ postCheckout: async () => { calls++; throw new Error('Durable charge now exists'); } });
  await assert.rejects(runBuyerCheckout(h.context), /Durable charge/); assert.equal(calls, 1); assert.equal(h.calls.opened.length, 0);
});
it('refreshes registered state through GET only and never follows the checkout path', async () => {
  const h = harness(); const result = await refreshBuyerCheckoutOrder(h.context);
  assert.equal(result.id, order.id); assert.equal(h.calls.published.length, 1); assert.deepEqual(h.calls.reads, [order.id]);
  assert.equal(h.calls.posts.length, 0); assert.equal(h.calls.opened.length, 0);
});
it('retires a held refresh after identity change', async () => {
  const gate = latch(); const h = harness({ readOrder: async () => { await gate.wait(); return { ...order }; } });
  const pending = refreshBuyerCheckoutOrder(h.context); await gate.reached; h.retire(); gate.release();
  assert.equal(await pending, null); assert.equal(h.calls.published.length, 0);
});
it('only blocks resume when an explicit occurrence is still processing or requires action', () => {
  for (const status of ['processing', 'requires_action'])
    assert.equal(unresolvedRecurringOrder({ occurrences: [{ status, orderId: order.id }] }), order.id);
  for (const plan of [{ status: 'requires_action' }, { occurrences: [] }, { occurrences: [{ status: 'failed' }] },
    { occurrences: [{ status: 'paid', orderId: order.id }] }, { occurrences: [{ status: 'requires_action', orderId: null }] }])
    assert.equal(unresolvedRecurringOrder(plan), null);
});
