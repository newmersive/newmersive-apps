const assert = require('node:assert/strict');
const { before, after, beforeEach, describe, it } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), express = require('express');
const { sourceModules, scalarModelDdl } = require('./allwain-offer-integrity-pglite.spec.cjs');
const order = (id, overrides={}) => ({ id, contractId:`contract-${id}`, offerId:'offer', buyerUserId:'buyer', sellerUserId:'seller', quantity:1, unit:'kg', unitPriceAmount:200, subtotalAmount:200, platformFeeBps:1000, platformFeeAmount:20, sellerAmount:180, deliveryMethod:'shipping', deliveryChannel:'local_connector', paymentStatus:'paid', deliveryAddress:{city:'Foios',formatted:'Calle privada 12, Foios'}, createdAt:new Date('2026-10-04T10:00:00Z'), ...overrides });
const delivery = (id, overrides={}) => ({ id, orderId:id, pickupZone:'Foios', deliveryZone:'Calle privada 12, Foios', deliveryAddress:{city:'Foios',formatted:'Calle privada 12, Foios'}, pickupAddress:{formatted:'Calle privada 9'}, createdAt:new Date('2026-10-04T10:00:00Z'), ...overrides });
const profile = { userId:'connector',status:'active',available:true,radiusKm:5,locationLabel:'Foios',locationLatApprox:39.538,locationLngApprox:-0.355 };
function routeSource(file, imports) {
  const filename=path.join(__dirname,'..','src',file),module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,Error,Date,require:id=>imports[id]||(id==='express'?express:{})},{filename});return module.exports;
}
describe('connector current-source SQL and participation in isolated RAM database', () => {
  let db,server,pool,prisma,helper,service;
  before(async () => {
    db=await PGlite.create();
    for(const name of ['AllwainOrder','AllwainDeliveryAssignment','AllwainBuyerProfile','AllwainSellerProfile','AllwainConnectorProfile','AllwainExperienceProfile','AllwainSellerPaymentAccount','AllwainFiscalProfile']) await db.exec(scalarModelDdl(name));
    await db.exec('CREATE UNIQUE INDEX assignment_order_unique ON "AllwainDeliveryAssignment" ("orderId"); CREATE UNIQUE INDEX connector_user_unique ON "AllwainConnectorProfile" ("userId"); CREATE UNIQUE INDEX buyer_user_unique ON "AllwainBuyerProfile" ("userId"); CREATE UNIQUE INDEX seller_user_unique ON "AllwainSellerProfile" ("userId"); CREATE UNIQUE INDEX experience_user_unique ON "AllwainExperienceProfile" ("userId"); CREATE TABLE "User" (id text PRIMARY KEY,name text NOT NULL);');
    await db.exec("INSERT INTO \"User\" VALUES ('seller','Seller'),('buyer','Buyer'),('connector','Connector');");
    server=new PGLiteSocketServer({db,host:'127.0.0.1',port:0,maxConnections:1});await server.start();
    const port=Number(/^127\.0\.0\.1:(\d+)$/.exec(server.getServerConn())[1]);
    pool=new Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:1});prisma=new PrismaClient({adapter:new PrismaPg(pool)});
    const stubs={
      '../config/env':{ENV:{STORAGE_DRIVER:'postgres',NODE_ENV:'test',JWT_SECRET:'isolated-connector-only',ALLWAIN_PLATFORM_SELLER_EMAILS:[],ALLWAIN_APP_URL:'https://test.invalid'}},
      './data.store.pg':{getUserByIdPg:async id=>({id,name:id,email:`${id}@test.invalid`,role:'user',sponsorCode:'NID-TEST'})},
      './allwain-money':{normalizeAllwainCommercialModel:x=>x||'marketplace',normalizeAllwainLocalDeliveryFeeAmount:()=>200,allwainPaymentsConfigured:()=>false},
      './allwain-compliance.service':{isAllwainFiscalProfileReady:()=>false,hasActiveAllwainDocumentMandate:()=>false},
    };
    const source=sourceModules(prisma,{realModels:['allwainSellerProfile'],stubs});helper=source.load('allwain-connector-discovery');stubs['./allwain-connector-discovery']=helper;service=source.load('allwain-participation.service');
  },{timeout:30000});
  after(async()=>{await prisma?.$disconnect();await pool?.end();await server?.stop();await db?.close();});
  beforeEach(async()=>{await prisma.allwainDeliveryAssignment.deleteMany();await prisma.allwainOrder.deleteMany();await prisma.allwainConnectorProfile.deleteMany();await prisma.allwainSellerProfile.deleteMany();await prisma.allwainConnectorProfile.create({data:profile});await prisma.allwainSellerProfile.create({data:{userId:'seller',locationLabel:'Foios',pickupAddress:'Calle privada 9',locationLatApprox:39.538,locationLngApprox:-0.355}});});
  it('filters >250 foreign, distant and archived deliveries before limit; old owner remains accessible',async()=>{
    const orders=[],deliveries=[];
    for(let n=0;n<280;n++){const id=`z-foreign-${n}`;orders.push(order(id));deliveries.push(delivery(id,{connectorUserId:'other'}));}
    for(const [id,change,orderChange] of [['z-distance',{pickupLatApprox:40,pickupLngApprox:-1},{}],['z-archive',{}, {operationalArchivedAt:new Date()}],['z-unpaid',{}, {paymentStatus:'not_started'}],['z-nonlocal',{}, {deliveryChannel:'carrier'}],['a-own',{connectorUserId:'connector',status:'accepted',pickupLatApprox:48,pickupLngApprox:2},{}],['b-eligible',{},{}]]){orders.push(order(id,orderChange));deliveries.push(delivery(id,change));}
    await prisma.allwainOrder.createMany({data:orders});await prisma.allwainDeliveryAssignment.createMany({data:deliveries});
    const first=await helper.connectorLogisticsRows(prisma,'connector',profile,{limit:1});assert.equal(first.items[0].id,'b-eligible');assert.equal(first.pageInfo.hasNextPage,true);
    const second=await helper.connectorLogisticsRows(prisma,'connector',profile,{limit:1,cursor:first.pageInfo.nextCursor});assert.equal(second.items[0].id,'a-own');assert.equal(second.pageInfo.hasNextPage,false);
    assert.equal((await helper.connectorLogisticsRows(prisma,'connector',{...profile,available:false,locationLabel:'Paris',locationLatApprox:48,locationLngApprox:2},{},'a-own')).items.length,1);
    assert.equal((await helper.connectorLogisticsRows(prisma,'stranger',profile,{},'a-own')).items.length,0);
    for(const changed of [{radiusKm:10},{available:false},{locationLabel:'Meliana'},{locationLatApprox:39.5}]) await assert.rejects(helper.connectorLogisticsRows(prisma,'connector',{...profile,...changed},{cursor:first.pageInfo.nextCursor}),/INVALID_DISCOVERY_CURSOR/);
    await assert.rejects(helper.connectorLogisticsRows(prisma,'other',profile,{cursor:first.pageInfo.nextCursor}),/INVALID_DISCOVERY_CURSOR/);
    await assert.rejects(helper.connectorLogisticsRows(prisma,'connector',profile,{scope:'mine',cursor:first.pageInfo.nextCursor}),/INVALID_DISCOVERY_CURSOR/);
  });
  it('municipality change clears stale coordinates, availability/radius-only patch preserves them; next matching uses B',async()=>{
    await service.updateAllwainConnector('connector',{radiusKm:10,available:false});let saved=await prisma.allwainConnectorProfile.findUnique({where:{userId:'connector'}});assert.equal(saved.locationLatApprox,profile.locationLatApprox);
    const receipt=await service.updateAllwainConnector('connector',{locationLabel:'Meliana',available:true});assert.equal(receipt.connector.locationMode,'label');saved=await prisma.allwainConnectorProfile.findUnique({where:{userId:'connector'}});assert.equal(saved.locationLatApprox,null);assert.equal(saved.locationLngApprox,null);
    await prisma.allwainOrder.createMany({data:[order('a'),order('b')]});await prisma.allwainDeliveryAssignment.createMany({data:[delivery('a'),delivery('b',{pickupZone:'Meliana',deliveryZone:'Alboraya',deliveryAddress:{city:'Alboraya'}})]});assert.deepEqual((await helper.connectorLogisticsRows(prisma,'connector',saved)).items.map(x=>x.id),['b']);
    await service.updateAllwainConnector('connector',{latitude:39.53,longitude:-0.34});assert.equal((await service.getAllwainParticipationSnapshot('connector')).connector.locationMode,'coordinates');
    await service.updateAllwainConnector('connector',{clearCoordinates:true});saved=await prisma.allwainConnectorProfile.findUnique({where:{userId:'connector'}});assert.equal(saved.locationLatApprox,null);
    await assert.rejects(service.updateAllwainConnector('connector',{latitude:39.5}),/INVALID_CONNECTOR_LOCATION/);
  });
  it('materializes 500 later missing orders past 200 assigned without overwriting a claimed snapshot',async()=>{
    const orders=Array.from({length:700},(_,i)=>order(`order-${String(i).padStart(4,'0')}`,{createdAt:new Date(1700000000000+i*1000)}));await prisma.allwainOrder.createMany({data:orders});
    const assigned=orders.slice(0,200).map(o=>delivery(o.id,{connectorUserId:'connector',status:'picked_up',pickupZone:'Immutable',feeAmount:999}));await prisma.allwainDeliveryAssignment.createMany({data:assigned});
    assert.equal(await service.ensureAllwainLogisticsAssignments(),500);assert.equal(await prisma.allwainDeliveryAssignment.count(),700);assert.equal(await service.ensureAllwainLogisticsAssignments(),0);
    const original=await prisma.allwainDeliveryAssignment.findUnique({where:{id:assigned[0].id}});assert.equal(original.pickupZone,'Immutable');assert.equal(original.status,'picked_up');assert.equal(original.feeAmount,999);
  },{timeout:30000});
  it('exact detail does not expose contacts or address to eligible unclaimed users and returns 404 for a foreign owner',async()=>{
    await prisma.allwainOrder.createMany({data:[order('public'),order('foreign'),order('mine')]});await prisma.allwainDeliveryAssignment.createMany({data:[delivery('public'),delivery('foreign',{connectorUserId:'other'}),delivery('mine',{connectorUserId:'connector',status:'accepted'})]});
    const publicRow=await service.getAllwainConnectorLogisticsDelivery('connector','public');assert.equal(publicRow.deliveryZone,'Foios');assert.equal(publicRow.pickupAddress,null);assert.equal(publicRow.deliveryAddress,null);assert.equal(publicRow.seller,null);assert.equal(publicRow.buyer,null);
    await assert.rejects(service.getAllwainConnectorLogisticsDelivery('connector','foreign'),/LOGISTICS_ASSIGNMENT_NOT_FOUND/);
    const mine=await service.getAllwainConnectorLogisticsDelivery('connector','mine');assert.equal(mine.deliveryAddress,'Calle privada 12, Foios');assert.equal(mine.buyer.id,'buyer');
  });
  it('actual HTTP routes enforce auth, actor-scoped exact access, private cache, signed cursors and explicit location clearing',async()=>{
    await prisma.allwainOrder.createMany({data:[order('public-a'),order('public-b'),order('private')]});await prisma.allwainDeliveryAssignment.createMany({data:[delivery('public-a'),delivery('public-b'),delivery('private',{connectorUserId:'other'})]});
    const auth=routeSource('middleware/auth.middleware.ts',{'../services/auth-session.service':{resolveAccessToken:async token=>{if(token!=='connector')throw Error('INVALID_TOKEN');return{id:token,email:'test@test.invalid',role:'user',sessionId:'isolated',sourceApp:'allwain'};}}});
    const wrapped=Object.fromEntries(Object.entries(service).map(([key,value])=>[key,typeof value==='function'?async(...args)=>{try{return await value(...args);}catch(error){throw Error(error.message);}}:value]));
    const router=routeSource('routes/allwain-participation.routes.ts',{'../config/env':{ENV:{STORAGE_DRIVER:'json'}},'../middleware/auth.middleware':auth,'../services/allwain-participation.service':wrapped}).default;
    const app=express();app.use(express.json());app.use('/participation',router);
    const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    const request=async(url,actor='connector',method='GET',body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/participation${url}`,{method,headers:{...(actor?{Authorization:`Bearer ${actor}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};};
    try{
      assert.equal((await request('/connector/logistics',null)).status,401);assert.equal((await request('/connector/logistics/public-a','invalid')).status,401);
      const first=await request('/connector/logistics?limit=1&scope=available');assert.equal(first.status,200);assert.equal(first.cache,'private, no-store');assert.deepEqual(first.body.items.map(x=>x.id),['public-b']);assert.equal(first.body.items[0].deliveryAddress,null);
      const next=await request(`/connector/logistics?limit=1&scope=available&cursor=${encodeURIComponent(first.body.pageInfo.nextCursor)}`);assert.deepEqual(next.body.items.map(x=>x.id),['public-a']);
      assert.equal((await request('/connector/logistics/private?ownerUserId=other')).status,404);
      assert.equal((await request('/connector/logistics?scope=bad')).status,400);assert.equal((await request('/connector/logistics?cursor=forged')).status,400);
      const update=await request('/connector','connector','PATCH',{locationLabel:'Meliana',clearCoordinates:true});assert.equal(update.status,200);assert.equal(update.body.connector.locationMode,'label');
      assert.equal((await request(`/connector/logistics?limit=1&scope=available&cursor=${encodeURIComponent(first.body.pageInfo.nextCursor)}`)).status,400);
      assert.equal((await request('/connector/logistics/public-a')).status,404);
    }finally{server.closeIdleConnections?.();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
});
