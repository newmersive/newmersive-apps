const assert=require('node:assert/strict');
const {before,after,beforeEach,describe,it}=require('node:test');
const {PGlite}=require('@electric-sql/pglite'),{PGLiteSocketServer}=require('@electric-sql/pglite-socket');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg'),{Pool}=require('pg');
const {sourceModules,scalarModelDdl}=require('./allwain-offer-integrity-pglite.spec.cjs');
describe('Pass 4 activity uses a single entity page on fresh PostgreSQL',()=>{
 let db,server,pool,prisma,activity,payments;
 before(async()=>{
  db=await PGlite.create();for(const model of ['User','Offer','Contract','AllwainOrder','AllwainPayment'])await db.exec(scalarModelDdl(model));
  server=new PGLiteSocketServer({db,host:'127.0.0.1',port:0,maxConnections:1});await server.start();
  pool=new Pool({host:'127.0.0.1',port:Number(server.getServerConn().split(':')[1]),user:'postgres',database:'postgres',max:1});
  prisma=new PrismaClient({adapter:new PrismaPg(pool)});const source=sourceModules(prisma);activity=source.load('allwain-activity.service');payments=source.load('allwain-payments.service');
 },{timeout:30000});
 after(async()=>{if(prisma)await prisma.$disconnect();if(pool)await pool.end();if(server)await server.stop();if(db)await db.close();});
 beforeEach(async()=>{await db.exec('TRUNCATE "User","Offer","Contract","AllwainOrder","AllwainPayment";');await prisma.user.createMany({data:['buyer','seller','other'].map(id=>({id,name:id,email:`${id}@example.invalid`,passwordHash:'isolated',role:'user'}))});});
 const contract=(id,extra={})=>({id:`contract-${id}`,app:'allwain',type:'sale',status:'accepted',requesterUserId:'buyer',providerUserId:'seller',offerTitle:'Lavadora',paymentStatus:'paid',createdAt:new Date('2026-01-01'),...extra});
 const order=(id,extra={})=>({id,contractId:`contract-${id}`,offerId:'product',buyerUserId:'buyer',sellerUserId:'seller',quantity:1,unit:'ud',unitPriceAmount:45000,subtotalAmount:45000,platformFeeBps:1000,platformFeeAmount:4500,sellerAmount:40500,status:'paid',paymentStatus:'paid',fulfillmentStatus:'pending',createdAt:new Date('2026-01-01'),...extra});
 async function seed(ids,orderExtra={},contractExtra={}){await prisma.contract.createMany({data:ids.map(id=>contract(id,contractExtra))});await prisma.allwainOrder.createMany({data:ids.map(id=>order(id,orderExtra))});}
 it('finds pending #31 on first preparation page after 100 newer completed orders and 100 agreements without orders',async()=>{
  await seed(Array.from({length:100},(_,i)=>`done-${i}`),{status:'completed',fulfillmentStatus:'completed',createdAt:new Date('2026-10-04')},{createdAt:new Date('2026-10-04')});
  await prisma.contract.createMany({data:Array.from({length:100},(_,i)=>contract(`no-order-${i}`,{createdAt:new Date('2026-10-04')}))});await seed(['old-pending']);
  const page=await activity.listAllwainActivityForUser('seller',{limit:30,scope:'seller',view:'preparation'});
  assert.deepEqual(Array.from(page.orders,o=>o.id),['old-pending']);assert.equal(page.contracts[0].id,'contract-old-pending');assert.equal(page.preparationCount,1);assert.equal(page.pageInfo.hasNextPage,false);
 });
 it('normal activity joins counterpart by exact contract IDs even when order dates are inverted',async()=>{
  await seed(['a'],{createdAt:new Date('2026-10-04')},{createdAt:new Date('2026-01-01')});await seed(['b'],{createdAt:new Date('2026-01-01')},{createdAt:new Date('2026-10-04')});
  const page=await activity.listAllwainActivityForUser('buyer',{limit:1,scope:'buyer',view:'all'});assert.equal(page.contracts[0].id,'contract-b');assert.equal(page.orders[0].id,'b');
  const next=await activity.listAllwainActivityForUser('buyer',{limit:1,scope:'buyer',view:'all',cursor:page.pageInfo.nextCursor});assert.equal(next.orders[0].id,'a');
 });
 it('pages all 40 preparation jobs exactly once and binds cursor to actor, query and view',async()=>{
  await seed(Array.from({length:40},(_,i)=>`job-${i}`));let page=await activity.listAllwainActivityForUser('seller',{limit:7,scope:'seller',view:'preparation'}),ids=[];const cursor=page.pageInfo.nextCursor;
  while(true){ids.push(...page.orders.map(o=>o.id));assert.equal(page.contracts.length,page.orders.length);if(!page.pageInfo.nextCursor)break;page=await activity.listAllwainActivityForUser('seller',{limit:7,scope:'seller',view:'preparation',cursor:page.pageInfo.nextCursor});}
  assert.equal(ids.length,40);assert.equal(new Set(ids).size,40);
  for(const change of [{query:'new'},{view:'all'},{scope:'buyer'}])await assert.rejects(activity.listAllwainActivityForUser('seller',{limit:7,scope:'seller',view:'preparation',cursor,...change}));
  await assert.rejects(activity.listAllwainActivityForUser('other',{limit:7,scope:'seller',view:'preparation',cursor}),/INVALID_DISCOVERY_CURSOR/);
 });
 it('global summary and preparation eligibility match, excluding active disputes/unpaid/delivered/archived',async()=>{
  await seed(['good']);await seed(['dispute'],{disputeStatus:'needs_response'});await seed(['unpaid'],{paymentStatus:'awaiting_payment'});await seed(['delivered'],{fulfillmentStatus:'delivered'});await seed(['archived'],{operationalArchivedAt:new Date()});
  const page=await activity.listAllwainActivityForUser('seller',{limit:30,scope:'seller',view:'preparation'});assert.deepEqual(Array.from(page.orders,o=>o.id),['good']);
  const summary=await payments.getAllwainOrderSummaryForUser('seller','seller');assert.equal(summary.preparationCount,1);assert.ok(Array.isArray(summary.pendingIncome));assert.equal(summary.pendingActionCount,0);
  const buyer=await payments.getAllwainOrderSummaryForUser('buyer','buyer');assert.equal(buyer.pendingActionCount,2);
 });
 it('exact reservation lookup works beyond page 30 and denies foreign participant or mismatched contract/order',async()=>{
  await seed(Array.from({length:60},(_,i)=>`new-${i}`),{createdAt:new Date('2026-10-04')});await seed(['old-reservation'],{paymentMode:'preorder',paymentStatus:'payment_method_saved'});
  const found=await activity.getAllwainContractOrderForUser('seller','contract-old-reservation');assert.equal(found.id,'old-reservation');
  await assert.rejects(activity.getAllwainContractOrderForUser('other','contract-old-reservation'),/CONTRACT_NOT_FOUND/);
  await prisma.allwainOrder.update({where:{id:'old-reservation'},data:{sellerUserId:'other'}});
  await assert.rejects(activity.getAllwainContractOrderForUser('seller','contract-old-reservation'),/ORDER_NOT_FOUND/);
 });
 it('intersects agreement dates, text, payment and fulfillment before limiting preparation',async()=>{
  await seed(['wanted'],{fulfillmentStatus:'ready'},{requesterName:'Paco Rausell',createdAt:new Date('2026-09-30T23:00:00Z')});await seed(Array.from({length:40},(_,i)=>`unrelated-${i}`),{createdAt:new Date('2026-10-04')},{createdAt:new Date('2026-10-04')});
  const page=await activity.listAllwainActivityForUser('seller',{limit:1,scope:'seller',view:'preparation',query:'Rausell',dateFrom:'2026-09-01',dateTo:'2026-09-30',paymentStatuses:['paid'],fulfillmentStatuses:['ready']});assert.equal(page.orders[0].id,'wanted');assert.equal(page.pageInfo.hasNextPage,false);
  const foreign=await activity.listAllwainActivityForUser('other',{limit:30,scope:'seller',view:'preparation'});assert.equal(foreign.orders.length,0);
 });
 it('JSON runtime refuses activity and exact order without touching database configuration',async()=>{
  let reads=0;const isolated=sourceModules(prisma,{stubs:{'../config/env':{ENV:{STORAGE_DRIVER:'json'}},'../db/prisma':{getPrisma:()=>{reads++;throw Error('DATABASE_NOT_ALLOWED');}}}}).load('allwain-activity.service');
  await assert.rejects(isolated.listAllwainActivityForUser('seller',{limit:30,scope:'seller'}),/PAYMENTS_REQUIRE_POSTGRES/);
  await assert.rejects(isolated.getAllwainContractOrderForUser('seller','old'),/PAYMENTS_REQUIRE_POSTGRES/);assert.equal(reads,0);
 });
});
