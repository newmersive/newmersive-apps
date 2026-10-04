const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/load-typescript.cjs');
const { recipientIssue, recipientSummary, loadPurchaseDetails } = load('src/utils/purchaseDelivery.ts', {
  '../config/api': { async apiAuthGet(path) { assert.equal(path, '/allwain/purchase-details'); return { details: null }; } },
});
const recipient = () => ({ deliveryRecipientName: 'Ana García', deliveryEmail: 'ana@example.test', deliveryPhone: '+34 600 123 456', deliveryAddress: 'Calle Mayor, 3', deliveryUnit: '2.º B', deliveryPostalCode: '46134', deliveryCity: 'Foios', deliveryCountryCode: 'ES' });

test('pickup requires recipient and contact, while avoiding an unnecessary home address', () => {
  const value = { ...recipient(), deliveryAddress: '', deliveryPostalCode: '', deliveryCity: '', deliveryCountryCode: '' };
  assert.equal(recipientIssue(value, true), null);
  assert.equal(recipientIssue({ ...value, deliveryPhone: '' }, true).field, 'deliveryPhone');
  assert.equal(recipientIssue({ ...value, deliveryEmail: 'invalid' }, true).field, 'deliveryEmail');
  assert.equal(recipientIssue({ ...value, deliveryRecipientName: '' }, true).field, 'deliveryRecipientName');
});

test('local or shipped delivery requires the same complete Spanish address as the server', () => {
  assert.equal(recipientIssue(recipient(), false), null);
  for (const [field, value] of [['deliveryAddress', ''], ['deliveryPostalCode', '123'], ['deliveryPostalCode', 'AB123'], ['deliveryCity', ''], ['deliveryCountryCode', 'FR']]) {
    assert.equal(recipientIssue({ ...recipient(), [field]: value }, false).field, field);
  }
  assert.equal(recipientIssue({ ...recipient(), deliveryCountryCode: 'es' }, false), null);
});

test('review includes the editable unit and does not expose an irrelevant address for pickup', () => {
  const delivery = recipientSummary(recipient(), false);
  assert.match(delivery, /Calle Mayor, 3/);
  assert.match(delivery, /2.º B/);
  assert.match(delivery, /46134 Foios/);
  assert.doesNotMatch(recipientSummary(recipient(), true), /Calle Mayor/);
});

test('an opted-out account can receive an empty saved-recipient response', async () => {
  assert.equal(await loadPurchaseDetails(), null);
});
