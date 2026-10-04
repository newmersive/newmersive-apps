const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),express=require('express');
function load(file,imports){const filename=path.join(__dirname,'../src',file),module={exports:{}};const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(js,{module,exports:module.exports,console,Buffer,Date,Error,require:id=>Object.hasOwn(imports,id)?imports[id]:id==='express'?express:id.startsWith('node:')?require(id):{}},{filename});return module.exports;}
async function withApi(run){
 const reads=[];const auth=load('middleware/auth.middleware.ts',{'../services/auth-session.service':{resolveAccessToken:async token=>{if(token!=='seller')throw new Error('INVALID_TOKEN');return{id:'seller',email:'isolated@example.invalid',role:'company',sessionId:'isolated',sourceApp:'allwain'};}}});
 const discovery=load('services/allwain-discovery.ts',{'../config/env':{ENV:{JWT_SECRET:'isolated-http'}}});
 const service={listAllwainActivityForUser:async(actor,input)=>{reads.push({actor,input});discovery.validateDiscovery(input);return{contracts:[],orders:[],pageInfo:{hasNextPage:false}};},getAllwainContractOrderForUser:async(actor,id)=>{reads.push({actor,id});if(id==='foreign')throw new Error('CONTRACT_NOT_FOUND');return{id:'old-order',contractId:id,sellerUserId:actor};}};
 const router=load('routes/allwain-payments.routes.ts',{'../middleware/auth.middleware':auth,'../services/allwain-activity.service':service,'../services/allwain-discovery':discovery,'../config/env':{ENV:{}}}).default;
 const app=express();app.use('/payments',router);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const request=async(url,token='seller')=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/payments${url}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});return{status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};};
 try{await run(request,reads);}finally{server.closeIdleConnections?.();await new Promise(resolve=>server.close(resolve));}
}
test('activity and exact reservation HTTP endpoints require real authentication middleware before data reads',async()=>withApi(async(request,reads)=>{
 for(const url of ['/activity?scope=seller&view=preparation','/contracts/old/order'])for(const token of [null,'invalid'])assert.equal((await request(url,token)).status,401);assert.equal(reads.length,0);
}));
test('activity HTTP passes applied filters and one cursor, clamps limit, rejects invalid views/dates',async()=>withApi(async(request,reads)=>{
 const result=await request('/activity?scope=seller&view=preparation&limit=1000&cursor=one&q=Paco&contractStatus=accepted&paymentStatus=paid&fulfillmentStatus=ready&dateFrom=2026-09-01&deliveryChannel=pickup');assert.equal(result.status,200);assert.equal(result.cache,'private, no-store');
 const {actor,input}=reads[0];assert.equal(actor,'seller');assert.equal(input.limit,100);assert.equal(input.cursor,'one');assert.equal(input.view,'preparation');assert.equal(input.query,'Paco');assert.equal(input.dateFrom,'2026-09-01');assert.deepEqual(Array.from(input.contractStatuses),['accepted']);assert.deepEqual(Array.from(input.fulfillmentStatuses),['ready']);
 assert.equal((await request('/activity?view=other')).status,400);assert.equal((await request('/activity?dateFrom=2026-02-30')).status,400);
}));
test('exact order HTTP uses contract ID and maps denied record to 404 without private payload',async()=>withApi(async(request)=>{
 const result=await request('/contracts/old-reservation/order');assert.equal(result.status,200);assert.equal(result.body.contractId,'old-reservation');assert.equal(result.cache,'private, no-store');
 const denied=await request('/contracts/foreign/order');assert.equal(denied.status,404);assert.deepEqual(denied.body,{error:'CONTRACT_NOT_FOUND'});
}));
