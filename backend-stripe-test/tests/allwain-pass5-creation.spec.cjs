const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {before,after,beforeEach,describe,it}=require('node:test');const ts=require('typescript'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{PGLiteSocketServer}=require('@electric-sql/pglite-socket');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg'),{Pool}=require('pg');
const {sourceModules,scalarModelDdl}=require('./allwain-offer-integrity-pglite.spec.cjs');
const key='8b501c0c-438f-4791-8c8b-159626b7db5b';
const input=extra=>({sourceType:'text',rawText:'Busco lavadora hasta 400 EUR',creationKey:key,...extra});
function load(file,stubs={}) {
 const filename=path.resolve(__dirname,'../src',file),mod=new Module(filename);mod.paths=Module._nodeModulePaths(path.dirname(filename));
 mod.require=id=>Object.hasOwn(stubs,id)?stubs[id]:['crypto','fs','path','express'].includes(id)?require(id):id.startsWith('node:')?require(id):{};
 mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);return mod.exports;
}
function serviceFixture(source,driver='postgres',scanGate) {
 const requests=[],stats={scans:0};
 const service=load('services/allwain.service.ts',{
  '../config/env':{ENV:{STORAGE_DRIVER:driver}},'./data.store.allwain.pg':source.store,
  './data.store':{getAllwainScanRequests:actor=>requests.filter(r=>!actor||r.userId===actor),addAllwainScanRequest:r=>{requests.push(r);return r;}},
  './allwain-card-images.service':source.load('allwain-card-images.service'),
  './scan.service':{scanProductImage:async body=>{stats.scans++;await scanGate?.(body);return{provider:'mock',confidence:1,extracted:{productName:'Lavadora',rawText:body.rawText,category:'electrodomesticos',currency:'EUR',targetPrice:400},rawData:{model:'fixture'},summary:'fixture',warnings:[]};}},
 });return{service,requests,stats};
}
async function withApi(service,run){
 const stats={usage:0};const auth=load('middleware/auth.middleware.ts',{'../services/auth-session.service':{resolveAccessToken:async token=>{if(!['buyer','other'].includes(token))throw Error('INVALID_TOKEN');return{id:token,role:'user',sourceApp:'allwain'};}}});
 const next=(_q,_r,n)=>n();const router=load('routes/allwain.routes.ts',{'../services/allwain.service':service,'../middleware/auth.middleware':auth,'../middleware/operation-rate-limit.middleware':{allwainAiRateLimit:next,allwainOcrRateLimit:next},'../services/allwain-ai-usage.service':{recordAllwainAiUsage:async()=>{stats.usage++;},safeAllwainAiErrorCode:e=>e.message,allwainImageInputBytes:()=>0}}).default;
 const app=express();app.use(express.json());app.use('/allwain',router);const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 const post=async(body,actor='buyer')=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/allwain/scan-requests`,{method:'POST',headers:{'Content-Type':'application/json',...(actor?{Authorization:`Bearer ${actor}`}:{})},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
 try{await run(post,stats);}finally{server.closeIdleConnections?.();await new Promise(done=>server.close(done));}
}
describe('Pass 5 manual creation: current service, HTTP and actual primary-key uniqueness',()=>{
 let db,server,pool,prisma,source;
 before(async()=>{db=await PGlite.create();await db.exec(scalarModelDdl('AllwainScanRequest'));
  // Installed runtime DMMF omits isId: the shared scalar fixture has no constraints.
  // Supply and verify the schema's real @id constraint for this uniqueness test.
  await db.exec('ALTER TABLE "AllwainScanRequest" ADD PRIMARY KEY ("id");');
  assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='\"AllwainScanRequest\"'::regclass AND contype='p'")).rows[0].count,1);
  server=new PGLiteSocketServer({db,host:'127.0.0.1',port:0,maxConnections:1});await server.start();const connection=/^127\.0\.0\.1:(\d+)$/.exec(server.getServerConn());assert.ok(connection);pool=new Pool({host:'127.0.0.1',port:Number(connection[1]),user:'postgres',database:'postgres',max:1});prisma=new PrismaClient({adapter:new PrismaPg(pool)});source=sourceModules(prisma,{realModels:['allwainScanRequest']});},{timeout:30000});
 after(async()=>{if(prisma)await prisma.$disconnect();if(pool)await pool.end();if(server)await server.stop();if(db)await db.close();});beforeEach(async()=>db.exec('TRUNCATE "AllwainScanRequest";'));
 it('retry after a lost creation response returns the same edited/published record without another scan',async()=>{
  const h=serviceFixture(source),created=await h.service.createAllwainScanRequest('buyer',input());
  await prisma.allwainScanRequest.update({where:{id:created.id},data:{title:'Mi ficha corregida',status:'submitted'}});
  const replay=await h.service.createAllwainScanRequest('buyer',input({creationKey:key.toUpperCase(),provider:'google'}));
  assert.equal(replay.id,created.id);assert.equal(replay.title,'Mi ficha corregida');assert.equal(replay.status,'submitted');assert.equal(h.stats.scans,1);assert.equal(await prisma.allwainScanRequest.count(),1);assert.equal(JSON.parse(JSON.stringify(replay)).creationReplayed,undefined);
 });
 it('actor scopes the key and different keys still permit intentionally identical requests',async()=>{
  const h=serviceFixture(source);const a=await h.service.createAllwainScanRequest('buyer',input()),b=await h.service.createAllwainScanRequest('other',input()),c=await h.service.createAllwainScanRequest('buyer',input({creationKey:'bb501c0c-438f-4791-8c8b-159626b7db5b'}));
  assert.equal(new Set([a.id,b.id,c.id]).size,3);assert.equal(b.userId,'other');assert.equal(await prisma.allwainScanRequest.count(),3);
 });
 it('same key with another payload conflicts, invalid keys/media fail before scanning or writes',async()=>{
  const h=serviceFixture(source);const original=await h.service.createAllwainScanRequest('buyer',input());
  await assert.rejects(h.service.createAllwainScanRequest('buyer',input({rawText:'Otro producto'})),/REQUEST_CREATION_CONFLICT/);
  for(const patch of [{creationKey:'short'},{creationKey:17},{creationKey:null},{sourceType:'image'},{barcode:'123'},{imageBase64:'data:image/png;base64,invalid'},{rawText:' '}])await assert.rejects(h.service.createAllwainScanRequest('buyer',input(patch)),/INVALID_REQUEST_CREATION_KEY/);
  assert.equal(h.stats.scans,1);assert.equal((await prisma.allwainScanRequest.findUnique({where:{id:original.id}})).title,original.title);assert.equal(await prisma.allwainScanRequest.count(),1);
 });
 it('two overlapping creations meet the actual PostgreSQL unique key and return one request',async()=>{
  let ready,release,scans=0;const bothReady=new Promise(done=>ready=done),gate=new Promise(done=>release=done);
  const h=serviceFixture(source,'postgres',async()=>{if(++scans===2)ready();await gate;});
  const a=h.service.createAllwainScanRequest('buyer',input()),b=h.service.createAllwainScanRequest('buyer',input());await bothReady;release();const values=await Promise.all([a,b]);
  assert.equal(values[0].id,values[1].id);
  const rows=await prisma.allwainScanRequest.findMany({select:{id:true,userId:true}});
  assert.equal(rows.length,1,JSON.stringify(rows));assert.equal(values.filter(r=>r.creationReplayed).length,1,'only the duplicate invocation is marked as replayed');
 });
 it('JSON check and insert also remain unique across overlapping scans, conflict preserves the winner',async()=>{
  let ready,release,n=0;const both=new Promise(done=>ready=done),gate=new Promise(done=>release=done);const h=serviceFixture(source,'json',async()=>{if(++n===2)ready();await gate;});
  const a=h.service.createAllwainScanRequest('buyer',input()),b=h.service.createAllwainScanRequest('buyer',input({rawText:'Busco frigorífico'}));await both;release();const results=await Promise.allSettled([a,b]);
  assert.equal(h.requests.length,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/REQUEST_CREATION_CONFLICT/);
  const replay=await h.service.createAllwainScanRequest('buyer',input());assert.equal(replay.id,h.requests[0].id);assert.equal(h.stats.scans,2);
 });
 it('legacy clients without creation keys keep the existing independent-create behaviour',async()=>{
  const h=serviceFixture(source);const a=await h.service.createAllwainScanRequest('buyer',input({creationKey:undefined})),b=await h.service.createAllwainScanRequest('buyer',input({creationKey:undefined}));assert.notEqual(a.id,b.id);assert.equal(await prisma.allwainScanRequest.count(),2);
 });
 it('HTTP authenticates, passes the key, maps 400/409, and does not record a second AI creation on replay',async()=>{
  const h=serviceFixture(source);await withApi(h.service,async(post,stats)=>{
   assert.equal((await post(input(),null)).status,401);assert.equal(h.stats.scans,0);
   const a=await post(input()),b=await post(input());assert.equal(a.status,201);assert.equal(b.status,201);assert.equal(a.body.id,b.body.id);assert.equal(stats.usage,1);assert.equal(b.body.creationReplayed,undefined);
   assert.deepEqual(await post(input({rawText:'distinto'})),{status:409,body:{error:'REQUEST_CREATION_CONFLICT'}});
   assert.equal((await post(input({creationKey:'invalid'}))).status,400);assert.equal(h.stats.scans,1);assert.equal(await prisma.allwainScanRequest.count(),1);
  });
 });
 function jsonRecoveryFixture(status='awarded') {
  const request={id:'json-request',userId:'buyer',status,selectedOfferId:'json-winner',selectedAt:'2026-10-04T10:00:00Z',extracted:{quantity:2},ai:{rawData:{creationFingerprint:'preserved'}}};
  const contract={id:'json-contract',app:'allwain',requestId:request.id,offerId:'json-winner',requesterUserId:'buyer',providerUserId:'seller',status:'pending_acceptance',inventoryStatus:'reserved',paymentStatus:'not_started',quantity:2,purchaseKey:'first-key'};
  const proposal=id=>({id,owner:'allwain',ownerUserId:'seller',allwainType:'proposal',requestId:request.id,price:3,allwainStatus:'active',meta:{validUntil:'2099-01-01T00:00:00Z',inventoryManaged:true,stockQuantity:10,availableQuantity:10,reservedQuantity:0,soldQuantity:0,minQuantity:1,quantityStep:1}});
  const winner=proposal('json-winner');winner.allwainStatus='selected';winner.meta.availableQuantity=8;winner.meta.reservedQuantity=2;
  const alternative=proposal('json-alternative');alternative.meta=source.load('allwain-request-recovery').allwainSelectionClosureMeta(alternative,winner.id);alternative.allwainStatus='not_selected';
  const requests=[request],contracts=[contract],offers=[winner,alternative];let writes=0;
  const store={getContracts:()=>contracts,getContractById:id=>contracts.find(r=>r.id===id),getAllwainScanRequests:actor=>requests.filter(r=>!actor||r.userId===actor),getOffersByOwner:()=>offers,getOfferById:id=>offers.find(r=>r.id===id),getUserById:id=>({id,status:'active'}),updateContractDetails:(id,patch)=>Object.assign(contracts.find(r=>r.id===id),patch),updateOffer:patch=>{writes++;Object.assign(offers.find(r=>r.id===patch.id),patch);return patch;},updateAllwainScanRequest:patch=>{writes++;Object.assign(request,patch);return request;}};
  const service=load('services/allwain.service.ts',{'../config/env':{ENV:{STORAGE_DRIVER:'json'}},'./data.store':store,'./allwain-inventory':source.inventory,'./allwain-request-recovery':source.load('allwain-request-recovery'),'./allwain-card-images.service':source.load('allwain-card-images.service')});
  return{service,request,contract,winner,alternative,get writes(){return writes;}};
 }
 it('actual JSON reject reopens the same request, retains its attempt and restores only marked alternatives once',async()=>{
  const h=jsonRecoveryFixture();await h.service.rejectAllwainContract('seller',h.contract.id);assert.equal(h.request.status,'submitted');assert.equal(h.request.selectedOfferId,null);assert.equal(h.request.ai.rawData.creationFingerprint,'preserved');assert.equal(h.request.ai.recovery.contractId,h.contract.id);assert.equal(h.contract.purchaseKey,'first-key');assert.equal(h.winner.allwainStatus,'withdrawn');assert.equal(h.winner.meta.availableQuantity,10);assert.equal(h.alternative.allwainStatus,'active');
  const writes=h.writes;await h.service.rejectAllwainContract('seller',h.contract.id);assert.equal(h.writes,writes);assert.equal(h.winner.meta.availableQuantity,10);
 });
 it('actual JSON reject isolates ownership and cannot revive a terminal request',async()=>{
  const h=jsonRecoveryFixture();await assert.rejects(h.service.rejectAllwainContract('stranger',h.contract.id),/CONTRACT_NOT_FOUND/);assert.equal(h.writes,0);assert.equal(h.contract.status,'pending_acceptance');
  for(const status of ['closed','canceled','archived']){const terminal=jsonRecoveryFixture(status);await terminal.service.rejectAllwainContract('seller',terminal.contract.id);assert.equal(terminal.request.status,status);assert.equal(terminal.alternative.allwainStatus,'not_selected');}
 });
 it('retrying a historical JSON rejection recovers safely without releasing stock a second time',async()=>{
  const h=jsonRecoveryFixture();h.contract.status='rejected';h.contract.inventoryStatus='released';h.winner.meta.reservedQuantity=0;h.winner.meta.availableQuantity=10;
  await h.service.rejectAllwainContract('seller',h.contract.id);assert.equal(h.request.status,'submitted');assert.equal(h.winner.meta.availableQuantity,10);assert.equal(h.request.ai.recovery.contractId,h.contract.id);
  const writes=h.writes;await h.service.rejectAllwainContract('seller',h.contract.id);assert.equal(h.writes,writes);
 });
 it('concurrent JSON duplicates annotate only a copied replay response, preserving creator telemetry',async()=>{
  let ready,release,n=0;const both=new Promise(done=>ready=done),gate=new Promise(done=>release=done);const h=serviceFixture(source,'json',async()=>{if(++n===2)ready();await gate;});
  const a=h.service.createAllwainScanRequest('buyer',input()),b=h.service.createAllwainScanRequest('buyer',input());await both;release();const replies=await Promise.all([a,b]);
  assert.equal(h.requests.length,1);assert.equal(replies.filter(r=>r.creationReplayed).length,1);assert.equal(h.requests[0].creationReplayed,undefined);assert.notEqual(replies[0],replies[1]);
 });
 it('JSON rejection financial/recurring guard runs before any stock or contract mutation',async()=>{
  for(const patch of [{paymentStatus:'paid'},{paymentStatus:'refunded'},{paymentStatus:'refund_pending'},{paymentStatus:'dispute_open'},{inventoryStatus:'sold'},{deliveryAddress:{recurringOrder:{enabled:true}}}]){
   const h=jsonRecoveryFixture();Object.assign(h.contract,patch);await assert.rejects(h.service.rejectAllwainContract('seller',h.contract.id),/INVALID_CONTRACT_STATUS/);
   assert.equal(h.writes,0);assert.equal(h.contract.status,'pending_acceptance');assert.equal(h.winner.meta.reservedQuantity,2);assert.equal(h.request.status,'awarded');
  }
 });
});
