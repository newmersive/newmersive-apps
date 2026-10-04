const assert=require('node:assert/strict');
const {test}=require('node:test');
const load=require('./helpers/load-typescript.cjs');
const p=load('src/utils/offerManagement.ts');
const copy=load('src/screens/Offers/offerManagementCopy.ts');
const offer=patch=>({id:'o',ownerUserId:'seller',allwainType:'catalog',allwainStatus:'active',title:'Naranjas',description:'Producto local',price:2,unit:'kg',currency:'EUR',updatedAt:'2026-10-04T08:00:00Z',meta:{deliveryEstimate:'Dos días'},...patch});
test('history query is scoped on the server before pagination and encodes its cursor',()=>{
  assert.equal(p.offerManagementQuery(true,'history','proposal','a&b'),'/allwain/offers?scope=mine&limit=30&type=proposal&view=history&cursor=a%26b');
  assert.equal(p.offerManagementQuery(false,'history'),'/allwain/offers?scope=market&limit=30');
});
test('legacy proposals cannot be mistaken for editable catalogue offers',()=>{
  for(const value of [{requestId:'r'},{shoppingListId:'l'},{meta:{requestId:'r'}},{meta:{shoppingListId:'l'}},{allwainType:'proposal'}])assert.equal(p.isProposalPublication(offer(value)),true);
  assert.equal(p.isProposalPublication(offer()),false);
  for(const status of ['selected','not_selected','withdrawn','closed'])assert.equal(p.isTerminalPublication(offer({allwainStatus:status})),true);
});
test('patch uses exact version and changed named fields only, preserving inventory and compliance',()=>{
  const original=offer({meta:{deliveryEstimate:'Dos días',stockQuantity:10,foodCompliance:{country:'ES'},imageUrl:'/private'}});
  const draft={...p.catalogEditDraft(original),title:'Navel Lane Late',price:'1,95'};
  assert.deepEqual(p.buildCatalogEditPatch(original,draft),{expectedUpdatedAt:original.updatedAt,title:'Navel Lane Late',price:1.95});
  assert.equal(original.meta.stockQuantity,10);
});
test('empty description and invalid numeric/long fields cannot overwrite a publication',()=>{
  for(const patch of [{description:''},{price:'NaN'},{price:'-1'},{price:'Infinity'},{unit:''},{shippingWeightKgPerUnit:'0'},{shippingWeightKgPerUnit:'1001'},{title:'x'.repeat(241)}])assert.equal(p.buildCatalogEditPatch(offer(),{...p.catalogEditDraft(offer()),...patch}),'invalid');
  assert.equal(p.buildCatalogEditPatch(offer({updatedAt:undefined}),p.catalogEditDraft(offer())),'version');
});
test('operations lock the commercial identity and reservation terms but allow future price changes',()=>{
  for(const meta of [{catalogTermsLocked:true},{reservedQuantity:1},{soldQuantity:1}]){
    const original=offer({meta});
    for(const patch of [{unit:'ud'},{category:'Fruta'},{saleMode:'preorder',preorderChargeDeadlineAt:'2099-01-01 12:00'}])assert.equal(p.buildCatalogEditPatch(original,{...p.catalogEditDraft(original),...patch}),'locked');
    assert.equal(p.buildCatalogEditPatch(original,{...p.catalogEditDraft(original),price:'3'}).price,3);
  }
});
test('local date rejects impossible dates and translates future reservation terms to UTC',()=>{
  assert.ok(Number.isNaN(p.collectionDateFromDraft('2026-02-30 12:00')));
  assert.ok(Number.isNaN(p.collectionDateFromDraft('2026-10-20 27:00')));
  const original=offer(),draft={...p.catalogEditDraft(original),saleMode:'preorder',preorderChargeDeadlineAt:'2099-01-01 12:00'};
  assert.equal(p.buildCatalogEditPatch(original,draft,0).preorderChargeDeadlineAt,new Date(2099,0,1,12,0).toISOString());
  assert.equal(p.buildCatalogEditPatch(original,draft,Date.parse('2100-01-01')),'deadline');
});
test('unmodified reservation deadline keeps its original seconds and UTC precision',()=>{
  const original=offer({meta:{saleMode:'preorder',preorderChargeDeadlineAt:'2099-01-01T12:05:36.123Z'}});
  assert.deepEqual(p.buildCatalogEditPatch(original,{...p.catalogEditDraft(original),price:'3'}),{expectedUpdatedAt:original.updatedAt,price:3});
});
test('acknowledgement must match owner, state, version presence and every edited field',()=>{
  const original=offer(),patch={expectedUpdatedAt:original.updatedAt,price:3,description:'Nueva descripción'};
  const saved={...original,price:3,description:patch.description};
  assert.equal(p.catalogPatchConfirmed(original,saved,patch),true);
  for(const bad of [{...saved,id:'other'},{...saved,ownerUserId:'other'},{...saved,allwainStatus:'closed'},{...saved,price:2},{...saved,description:'old'},{...saved,updatedAt:null}])assert.equal(p.catalogPatchConfirmed(original,bad,patch),false);
});
test('old refresh, pagination and hydration lose permission at write start and finish',()=>{
  const barrier=p.createOfferReadBarrier(),refresh=barrier.read(),pagination=barrier.read();
  const end=barrier.beginWrite(),during=barrier.read();
  assert.equal(refresh.isCurrent(),false);assert.equal(pagination.isCurrent(),false);assert.equal(during.isCurrent(),false);
  end();end();assert.equal(during.isCurrent(),false);assert.equal(barrier.read().isCurrent(),true);
});
test('overlapping writes and view changes cannot reopen a publication from stale responses',()=>{
  const barrier=p.createOfferReadBarrier(),a=barrier.beginWrite(),b=barrier.beginWrite();
  a();assert.equal(barrier.read().isCurrent(),false);b();const read=barrier.read();assert.equal(read.isCurrent(),true);
  barrier.reset();assert.equal(read.isCurrent(),false);
});
test('all publication/editor copy is available in every supported language',()=>{
  for(const locale of ['es','en','fr','it','zh','ar']){const c=copy.offerManagementCopy(locale);assert.equal(Object.keys(c).length,Object.keys(copy.offerManagementCopy('es')).length);for(const v of Object.values(c))assert.ok(v.trim());}
});
