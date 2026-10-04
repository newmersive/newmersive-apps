const assert = require('node:assert/strict');
const { it } = require('node:test');
const load = require('./helpers/load-typescript.cjs');
const { buyerPaymentLabel, buyerCheckoutReturnUrl, buyerReviewAmount } = load('src/utils/buyerJourney.ts');
it('reviews the complete server total including delivery, and newer order taxes take precedence', () => {
  const contract = {subtotalAmount:1000,shippingAmount:250,totalPrice:12.5};
  assert.equal(buyerReviewAmount(contract),1250);
  assert.equal(buyerReviewAmount(contract,{totalAmount:1513}),1513);
  assert.equal(buyerReviewAmount({subtotalAmount:1000}),undefined);
});
it('never describes an unpaid or unknown order as confirmed', () => {
  for (const status of ['awaiting_payment','checkout_open','payment_failed','payment_processing','requires_customer_action','payment_method_saved','refunded','partially_refunded','expired',undefined,'unknown']) assert.ok(buyerPaymentLabel(status));
  assert.equal(buyerPaymentLabel('paid'), null);
});
it('returns web checkout to the exact order while preserving its identity through provider parameters', () => {
  const url = new URL(buyerCheckoutReturnUrl('https://allwain.es/app/', true, 'contract/a & b'));
  url.searchParams.set('allwain', 'payment_cancelled');
  assert.equal(url.pathname, '/app/ofertas');
  assert.equal(url.searchParams.get('contractId'), 'contract/a & b');
  assert.equal(url.searchParams.get('section'), 'orders');
});
it('keeps native checkout on its existing deep link', () => {
  assert.equal(buyerCheckoutReturnUrl('allwain://ofertas', false, 'c1'), 'allwain://ofertas?section=orders&contractId=c1');
});
