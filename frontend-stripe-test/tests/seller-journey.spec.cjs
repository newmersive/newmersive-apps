const assert=require('node:assert/strict');
const {it}=require('node:test');
const {sellerCanFulfill,sellerNeedsPreparation}=require('./helpers/load-typescript.cjs')('src/utils/sellerJourney.ts');
it('does not invite a seller to prepare unpaid, card-saved or disputed orders',()=>{
 for(const paymentStatus of ['awaiting_payment','checkout_open','payment_processing','payment_method_saved','refunded','canceled']) assert.equal(sellerCanFulfill({paymentStatus}),false);
 assert.equal(sellerCanFulfill({paymentStatus:'paid',disputeStatus:'open'}),false);
 assert.equal(sellerCanFulfill({paymentStatus:'paid',disputeStatus:'won'}),true);
 assert.equal(sellerNeedsPreparation({paymentStatus:'paid',fulfillmentStatus:'pending'}),true);
 assert.equal(sellerNeedsPreparation({paymentStatus:'paid',fulfillmentStatus:'completed'}),false);
});
