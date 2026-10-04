const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm'); const ts = require('typescript'); const express = require('express');
const { harness, catalog } = require('./allwain-offer-integrity.spec.cjs');
const request = (id, extra={}) => ({id,userId:'buyer',title:id,description:'',sourceType:'manual',status:'submitted',visibility:'public',extracted:{productName:id},offers:[],ai:{},createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',...extra});
const proposal = (id, extra={}) => catalog({id,requestId:'old',allwainType:'proposal',price:Number(id.replace(/\D/g,''))||1,meta:{validUntil:'2099-01-01T00:00:00.000Z'},...extra});
function source(file, imports) { const filename=path.resolve(__dirname,'../src',file), module={exports:{}}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:id => Object.hasOwn(imports,id)?imports[id]:id==='express'?express:id.startsWith('node:')?require(id):{},Buffer,Date,Error},{filename});return module.exports; }
async function withApi(h,run) {
 const auth=source('middleware/auth.middleware.ts',{'../services/auth-session.service':{resolveAccessToken:async token=>{if(!['buyer','stranger'].includes(token))throw Error('INVALID_TOKEN');return{id:token,role:'user',email:`${token}@test.invalid`,sourceApp:'allwain'};}}});
 const next=(_a,_b,n)=>n();const router=source('routes/allwain.routes.ts',{'../services/allwain.service':h.service,'../services/allwain-discovery':h.discovery,'../middleware/auth.middleware':auth,'../middleware/operation-rate-limit.middleware':{allwainAiRateLimit:next,allwainOcrRateLimit:next},'../config/env':{ENV:{}}}).default;
 const app=express();app.use('/allwain',router);const server=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
 const get=async (url,actor='buyer')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/allwain${url}`,{headers:actor?{Authorization:`Bearer ${actor}`}:{}});return{status:r.status,body:await r.json()};};
 try{await run(get);}finally{server.closeIdleConnections?.();await new Promise(done=>server.close(done));}
}
module.exports={request,proposal};
describe('Pass 4 JSON global buyer summary and request proposals',()=>{
 it('finds a pending old request behind 100 newer terminal or unanswered requests without exposing another owner',async()=>{
  const h=harness({driver:'json',requests:[request('old'),...Array.from({length:100},(_,i)=>request(`new-${i}`,{status:i%2?'archived':'submitted',updatedAt:'2026-10-04T00:00:00Z'})),request('foreign',{userId:'stranger',status:'draft'})],offers:[proposal('p1')]});
  const result=await h.service.getAllwainBuyerRequestPendingSummary('buyer',3);assert.equal(result.total,1);assert.deepEqual(Array.from(result.items,x=>x.id),['old']);assert.equal(result.counts.withProposals,1);assert.equal(result.items[0].proposalCount,1);
 });
 it('counts drafts and ready globally, excludes expired, withdrawn and awarded, bounds preview and raw OCR fields',async()=>{
  const h=harness({driver:'json',requests:[...Array.from({length:100},(_,i)=>request(`draft-${i}`,{status:i%2?'ready':'draft',extracted:{productName:'Privado',rawText:'sensitive'},updatedAt:'2026-10-04'})),request('old'),request('awarded',{status:'awarded'})],offers:[proposal('expired',{proposalExpiresAt:'2000-01-01'}),proposal('withdrawn',{allwainStatus:'withdrawn'}),proposal('picked',{requestId:'awarded',allwainStatus:'selected'})]});
  const result=await h.service.getAllwainBuyerRequestPendingSummary('buyer',100);assert.equal(result.total,100);assert.equal(result.items.length,10);assert.equal(result.counts.draft,50);assert.equal(result.counts.ready,50);assert.equal(result.counts.withProposals,0);assert.ok(result.items.every(x=>!x.extracted.rawText));
 });
 it('returns only 20 of 100 proposals, selected outside page and independent summary; detail can omit proposal page',async()=>{
  const h=harness({driver:'json',requests:[request('old',{status:'awarded',selectedOfferId:'p99'})],offers:Array.from({length:100},(_,i)=>proposal(`p${String(i).padStart(2,'0')}`,{price:i,allwainStatus:i===99?'selected':'active'}))});
  const first=await h.service.listAllwainRequestProposalPage('buyer','old',{limit:200,sort:'price',view:'all'});assert.equal(first.items.length,20);assert.equal(first.summary.total,100);assert.equal(first.summary.active,99);assert.equal(first.selectedOffer.id,'p99');assert.ok(!first.items.some(x=>x.id==='p99'));
  const all=[];let page=first;while(true){all.push(...page.items);if(!page.pageInfo.hasNextPage)break;page=await h.service.listAllwainRequestProposalPage('buyer','old',{limit:20,sort:'price',view:'all',cursor:page.pageInfo.nextCursor});}assert.equal(all.length,100);assert.equal(new Set(all.map(x=>x.id)).size,100);assert.deepEqual(all.map(x=>x.price),Array.from({length:100},(_,i)=>i));
  const detail=await h.service.getAllwainScanRequestForUser('buyer','old',{includeProposals:false});assert.equal(detail.offers.length,0);assert.equal(detail.selectedOffer.id,'p99');assert.equal(detail.proposalSummary.total,100);
  assert.equal((await h.service.getAllwainScanRequestForUser('buyer','old')).offers.length,20);
  h.state.requests[0].selectedOfferId='p00';
  const compatible=await h.service.getAllwainScanRequestForUser('buyer','old');assert.equal(compatible.offers.length,20);assert.ok(compatible.offers.some(row=>row.id==='p00'),'older clients retain chosen offer outside newest page');
 });
 it('HTTP owner isolation, invalid sort/view, tampering and query-bound cursors fail closed',async()=>{
  const h=harness({driver:'json',requests:[request('old'),request('other')],offers:[proposal('p1'),proposal('p2')]});
  await withApi(h,async get=>{
   assert.equal((await get('/scan-requests/summary',null)).status,401);assert.equal((await get('/scan-requests/old/proposals','stranger')).status,404);
   assert.equal((await get('/scan-requests/old/proposals?sort=random')).status,400);assert.equal((await get('/scan-requests/old/proposals?view=random')).status,400);
   const first=await get('/scan-requests/old/proposals?limit=1&sort=price&view=all');assert.equal(first.status,200);const cursor=encodeURIComponent(first.body.pageInfo.nextCursor);
   for(const query of [`sort=rating&view=all&cursor=${cursor}`,`sort=price&view=active&cursor=${cursor}`,`sort=price&view=all&cursor=${cursor.slice(0,-2)}aa`])assert.equal((await get(`/scan-requests/old/proposals?limit=1&${query}`)).status,400);
   assert.equal((await get(`/scan-requests/other/proposals?limit=1&sort=price&view=all&cursor=${cursor}`)).status,400);
   const detail=await get('/scan-requests/old?includeProposals=false');assert.equal(detail.status,200);assert.equal(detail.body.offers.length,0);assert.equal(detail.body.proposalSummary.total,2);
  });
 });
});
