const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const moduleFixture={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/services/allwain-purchase-analytics.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleFixture,exports:moduleFixture.exports,require,Date});
const {confirmedAllwainPurchaseMetadata:confirm,allwainPurchaseAnalyticsReceipt:receipt}=moduleFixture.exports;
const fixture=()=>({order:{id:'opaque-order',totalAmount:2365000,currency:'EUR',paymentStatus:'paid',paidAt:'2026-10-04T12:00:00Z'},payment:{id:'opaque-payment',orderId:'opaque-order',provider:'stripe',kind:'payment',amount:2365000,currency:'eur',stripePaymentIntentId:'pi_fixture',status:'paid',paidAt:'2026-10-04T12:00:00Z',metadata:{retained:'commercial-snapshot'}},intent:{id:'pi_fixture',status:'succeeded',livemode:false,amount_received:2365000,currency:'eur'}});
test('purchase proof requires successful Stripe intent and exact amount/currency/payment association',()=>{
 const {order,payment,intent}=fixture();for(const change of [{status:'processing'},{livemode:undefined},{amount_received:1},{currency:'usd'},{id:'pi_other'}])assert.equal(confirm(order,payment,{...intent,...change}),undefined);
 assert.equal(confirm(order,{...payment,provider:'other'},intent),undefined);assert.equal(confirm(order,{...payment,orderId:'foreign'},intent),undefined);
 const metadata=confirm(order,payment,intent);assert.equal(metadata.retained,'commercial-snapshot');assert.equal(metadata.analyticsSettlement.paymentEnvironment,'test');assert.equal(payment.metadata.analyticsSettlement,undefined);
});
test('historical test/live provenance stays attached to provider proof, with no global config inference',()=>{
 const {order,payment,intent}=fixture();payment.metadata=confirm(order,payment,intent);const first=receipt(order,payment);assert.equal(first.value,23650);assert.equal(first.currency,'EUR');assert.match(first.transactionId,/^aw_test_[a-f0-9]{32}$/);assert.equal(first.version,1);assert.equal(first.paymentEnvironment,'test');
 assert.equal(confirm(order,payment,intent),undefined);assert.equal(confirm(order,payment,{...intent,livemode:true}),undefined);assert.equal(receipt(order,payment).paymentEnvironment,'test');
 const second=fixture();second.payment.metadata=confirm(second.order,second.payment,{...second.intent,livemode:true});const live=receipt(second.order,second.payment);assert.match(live.transactionId,/^aw_live_[a-f0-9]{32}$/);assert.equal(live.transactionId.split('_').at(-1),first.transactionId.split('_').at(-1));
});
test('legacy, reservation/setup, incomplete or inconsistent records never produce a purchase receipt',()=>{
 const {order,payment,intent}=fixture();assert.equal(receipt(order,payment),null);payment.metadata=confirm(order,payment,intent);
 for(const change of [{paymentStatus:'checkout_open'},{paymentStatus:'refunded'},{paidAt:null},{totalAmount:1},{currency:'USD'}])assert.equal(receipt({...order,...change},payment),null);
 for(const change of [{kind:'setup'},{status:'duplicate_payment'},{paidAt:null},{amount:1},{stripePaymentIntentId:'pi_changed'},{currency:'USD'},{orderId:'other'}])assert.equal(receipt(order,{...payment,...change}),null);
 assert.equal(receipt(order,{...payment,kind:'deferred_charge'}).value,23650);
});
test('receipt contains only version, opaque transaction, historical environment, currency and gross value',()=>{
 const {order,payment,intent}=fixture();Object.assign(order,{buyerUserId:'private-user',deliveryAddress:'private-address',deliveryNotes:'private-notes'});payment.metadata=confirm(order,payment,intent);payment.metadata.privateEmail='private@example.test';
 const result=receipt(order,payment);assert.deepEqual(Object.keys(result).sort(),['currency','paymentEnvironment','transactionId','value','version']);const serialized=JSON.stringify(result);assert.doesNotMatch(serialized,/private-|opaque-order|opaque-payment|pi_fixture|private@example/);
 assert.equal(receipt(order,payment).transactionId,result.transactionId);
});
