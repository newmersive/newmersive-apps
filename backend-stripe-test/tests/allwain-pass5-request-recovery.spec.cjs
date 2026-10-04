const assert = require('node:assert/strict');
const { test } = require('node:test');
const { recovery } = require('./helpers/request-recovery-source.cjs')({});
const now = new Date('2026-10-04T10:00:00Z'), validUntil = '2026-10-05T10:00:00Z';
function scenario() {
  const offer = (id, state) => ({ id, owner: 'allwain', ownerUserId: 'seller', requestId: 'request', allwainType: 'proposal', allwainStatus: state, price: 2, proposalExpiresAt: validUntil, meta: { inventoryManaged: true, stockQuantity: 10, availableQuantity: 10, reservedQuantity: 0, soldQuantity: 0, minQuantity: 1, quantityStep: 1, unit: 'kg', ...(state === 'not_selected' ? { selectionClosure: { selectedOfferId: 'winner', previousStatus: 'active' } } : {}) } });
  return { request: { id: 'request', userId: 'buyer', status: 'awarded', selectedOfferId: 'winner', ai: {}, extracted: { quantity: 1 } }, contract: { id: 'contract', app: 'allwain', requestId: 'request', requesterUserId: 'buyer', offerId: 'winner', status: 'rejected', paymentStatus: 'canceled', inventoryStatus: 'released', quantity: 1 }, offers: [offer('winner', 'selected'), offer('alternative', 'not_selected')], eligibleSellerIds: ['seller'], reason: 'contract_rejected', now };
}
test('JSON policy accepts a safely closed active alternative and returns references without mutating inputs', () => {
  const input = scenario(), snapshot = JSON.stringify(input); const plan = recovery.planAllwainRequestRecovery(input);
  assert.equal(plan.requestPatch.status, 'submitted'); assert.equal(plan.requestPatch.selectedOfferId, null); assert.equal(plan.recovery.contractId, 'contract'); assert.deepEqual(Array.from(plan.recovery.eligibleAlternativeIds), ['alternative']); assert.equal(JSON.stringify(input), snapshot);
});
test('unknown legacy closure, previous pause and expired or malformed deadline never restore an alternative', () => {
  for (const mutate of [offer => delete offer.meta.selectionClosure, offer => { offer.meta.selectionClosure.previousStatus = 'paused'; }, offer => { offer.proposalExpiresAt = '2000-01-01T00:00:00Z'; }, offer => { offer.proposalExpiresAt = '2099-02-30T00:00:00Z'; }, offer => { offer.proposalExpiresAt = 'banana'; }, offer => { offer.meta.archived = true; }]) {
    const input = scenario(); mutate(input.offers[1]); const plan = recovery.planAllwainRequestRecovery(input); assert.equal(plan.requestPatch.status, 'submitted'); assert.equal(plan.recovery.eligibleAlternativeIds.length, 0); assert.equal(plan.offerPatches.some(patch => patch.id === 'alternative'), false);
  }
});
test('same actor, current winner, awarded status and allwain app are required, including after a newer award', () => {
  for (const mutate of [input => { input.request.status = 'archived'; }, input => { input.request.status = 'canceled'; }, input => { input.request.status = 'closed'; }, input => { input.request.selectedOfferId = 'new-winner'; }, input => { input.request.closedAt = now; }, input => { input.contract.requesterUserId = 'other'; }, input => { input.contract.app = 'trueqia'; }, input => { input.contract.shoppingListId = 'list'; }]) {
    const input = scenario(); mutate(input); assert.equal(recovery.planAllwainRequestRecovery(input), null);
  }
});
test('pending external charges, paid or refund/dispute evidence, recurring intent and another live agreement block recovery', () => {
  for (const mutate of [input => { input.contract.paymentStatus = 'paid'; }, input => { input.contract.paymentStatus = 'refunded'; }, input => { input.contract.paymentStatus = 'disputed'; }, input => { input.contract.deliveryAddress = { recurringOrder: { enabled: true } }; }, input => { input.payments = [{ status: 'checkout_open' }]; }, input => { input.payments = [{ status: 'canceled', paidAt: now }]; }, input => { input.payments = [{ status: 'canceled', stripeChargeId: 'ch_fixture' }]; }, input => { input.payments = [{ status: 'canceled', refundedAmount: 10 }]; }, input => { input.contracts = [{ id: 'another', status: 'accepted' }]; }]) {
    const input = scenario(); mutate(input); assert.equal(recovery.planAllwainRequestRecovery(input), null);
  }
});
test('quantity and stock revalidation uses the attempt snapshot and does not create reservations', () => {
  const input = scenario(); input.contract.quantity = 3; input.offers[1].meta.availableQuantity = 2;
  const plan = recovery.planAllwainRequestRecovery(input); assert.equal(plan.recovery.eligibleAlternativeIds.length, 0); assert.equal(input.offers[1].meta.reservedQuantity, 0);
});
