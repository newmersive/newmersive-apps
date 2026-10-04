// Real exported UI; loopback fixtures only. No production or financial calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/fraus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:4517',artifacts=path.resolve(__dirname,'../../../output/audit-20261004/pass3/visual');
const participation={experience:{onboardingVersion:4,guidanceEnabled:false,primaryIntent:'buy'},buyer:{enabled:true,status:'active'},seller:{enabled:true,status:'active',sellerReady:true,commercialModel:'marketplace',businessOfRecord:'seller'},connector:{enabled:false,status:'not_activated'}};
const user={id:'qa-discovery',name:'Persona de prueba',email:'qa@example.test',role:'user',participation,analyticsConsent:false};
const offer=(i)=>({id:`offer-${i}`,ownerUserId:'other-seller',provider:{id:'other-seller',name:'Tienda local'},allwainType:'catalog',allwainStatus:'active',title:i===999?'Lavadora 999':`Oferta ${i}`,description:'Ficha sintética para validación.',price:300+i/100,currency:'EUR',unit:'ud',category:'electrodomesticos',productKind:'appliance',locationLabel:'Foios',createdAt:'2026-10-04T10:00:00Z',updatedAt:'2026-10-04T10:00:00Z',meta:{unit:'ud',stockQuantity:40,availableQuantity:40,minQuantity:1,quantityStep:1,inventoryManaged:true}});
const offers=Array.from({length:1000},(_,i)=>offer(i));
const options={categories:[{value:'alimentacion',subcategories:[{value:'frutas'}]},{value:'electrodomesticos',subcategories:[{value:'lavadoras'}]},{value:'hogar',subcategories:[]}],productKinds:['appliance','food','service'],units:['kg','ud'],currencies:['EUR']};
(async()=>{
 fs.mkdirSync(artifacts,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
 try{for(const viewport of [{width:320,height:640},{width:390,height:844},{width:1280,height:900}]){
  const context=await browser.newContext({viewport,locale:'es-ES',reducedMotion:'reduce',serviceWorkers:'block'});const reads=[],writes=[];let failQuery=false;
  await context.addInitScript(({user})=>localStorage.setItem('allwain_auth.profile',JSON.stringify({user,appMode:'buy'})),{user});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===base&&url.pathname.startsWith('/api/')){
    const endpoint=url.pathname.slice(4);reads.push(endpoint+url.search);let data={items:[],pageInfo:{hasNextPage:false}};
    if(req.method()!=='GET'&&!endpoint.startsWith('/auth/'))writes.push(endpoint);
    if(endpoint.startsWith('/auth/'))data=endpoint==='/auth/me'?user:{token:'local-fixture-token',user};
    else if(endpoint==='/allwain/participation')data=participation;
    else if(endpoint==='/allwain/discovery-options')data=options;
    else if(endpoint==='/allwain/offers'){
     const q=(url.searchParams.get('q')||'').toLowerCase();
     if(q==='reintento'&&failQuery)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'LOCAL_SIMULATED_QUERY_FAILURE'})});
     const filtered=url.searchParams.get('scope')==='mine'?[]:q==='reintento'?[{...offer(999),id:'retry-offer',title:'Resultado reintentado'}]:offers.filter(item=>item.title.toLowerCase().includes(q));
     data={items:filtered.slice(0,30),pageInfo:{hasNextPage:filtered.length>30,nextCursor:filtered.length>30?'fixture-bound-first-page':null}};
    }else if(endpoint==='/allwain/payments/config')data={enabled:false,paymentEnvironment:'test',stripeLivemode:false};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   }
   if(url.origin===base)return route.continue();return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);
  try{
   await page.goto(base+'/app/ofertas?section=offers',{waitUntil:'networkidle'});
   const consent=page.getByText('Solo necesarias',{exact:true});await consent.waitFor();await consent.click();await consent.waitFor({state:'hidden'});
   const search=()=>page.getByRole('textbox',{name:'Buscar',exact:true}).first();
   await search().fill('Lavadora 999');await search().press('Enter');await page.getByText('Lavadora 999',{exact:true}).waitFor();
   assert(!reads.some(url=>url.includes('cursor=')),'find item beyond page ten without browsing previous pages');
   await page.getByRole('button',{name:'Filtros',exact:true}).first().click();const dialog=page.getByTestId('discovery-filter-dialog'),footer=page.getByTestId('discovery-filter-footer');await dialog.waitFor();
   await dialog.getByRole('button',{name:'Electrodomésticos',exact:true}).click();await dialog.getByRole('button',{name:'Unidad',exact:true}).click();await dialog.getByRole('button',{name:'EUR',exact:true}).click();
   await dialog.getByRole('textbox',{name:'Precio desde',exact:true}).fill('100');await dialog.getByRole('textbox',{name:'Precio hasta',exact:true}).fill('400');await dialog.getByRole('button',{name:'Menor precio',exact:true}).click();
   async function layout(){await footer.evaluate(node=>new Promise((resolve,reject)=>{const until=performance.now()+3000;const check=()=>{const box=node.getBoundingClientRect();if(box.top>=0&&box.bottom<=innerHeight+1)resolve();else if(performance.now()>until)reject(Error(`Footer ${box.top}/${box.bottom}/${innerHeight}`));else requestAnimationFrame(check);};check();}));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}
   await layout();if(viewport.width<500){await page.setViewportSize({width:viewport.width,height:480});await layout();await page.setViewportSize(viewport);await layout();}
   await page.screenshot({path:path.join(artifacts,`filters-${viewport.width}.png`)});await footer.getByRole('button',{name:'Ver resultados',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByText('Lavadora 999',{exact:true}).waitFor();
   await page.waitForFunction(()=>document.body.innerText.includes('Filtros aplicados'));
   const filtered=new URL(reads.filter(url=>url.startsWith('/allwain/offers?')&&url.includes('scope=market')).at(-1),'http://local').searchParams;
   assert.equal(filtered.get('category'),'electrodomesticos');assert.equal(filtered.get('unit'),'ud');assert.equal(filtered.get('currency'),'EUR');assert.equal(filtered.get('sort'),'price_asc');
   await page.goto(base+'/app/buscar',{waitUntil:'networkidle'});await page.getByText('Lavadora 999',{exact:true}).waitFor();assert.equal(await search().inputValue(),'Lavadora 999','same applied catalogue query after navigation');
   await page.goto(base+'/app/ofertas?section=offers',{waitUntil:'networkidle'});await page.getByText('Lavadora 999',{exact:true}).waitFor();
   failQuery=true;await search().fill('reintento');await search().press('Enter');await page.getByText('No se pudo completar esta consulta. Reintenta para cargar los resultados de los filtros elegidos.',{exact:true}).waitFor();assert.equal(await page.getByText('Lavadora 999',{exact:true}).count(),0,'failed query cannot keep previous purchasable card');
   failQuery=false;await page.getByRole('button',{name:'Actualizar información',exact:true}).click();await page.getByText('Resultado reintentado',{exact:true}).waitFor();assert.equal(await search().inputValue(),'reintento');
   await page.screenshot({path:path.join(artifacts,`retry-${viewport.width}.png`)});
   await page.goto(base+'/app/ofertas?section=orders',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Filtros',exact:true}).click();await dialog.waitFor();
   for(const label of ['Confirmado','Pagado','En preparación','Recogida'])await dialog.getByRole('button',{name:label,exact:true}).click();
   await dialog.getByRole('textbox',{name:'Desde',exact:true}).fill('2026-09-01');await dialog.getByRole('textbox',{name:'Hasta',exact:true}).fill('2026-09-30');
   await footer.getByRole('button',{name:'Ver resultados',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.body.innerText.includes('Confirmado · Pagado'));
   for(const endpoint of ['/allwain/contracts?','/allwain/payments/orders?']) {
    const params=new URL(reads.filter(url=>url.startsWith(endpoint)).at(-1),'http://local').searchParams;
    assert.equal(params.get('contractStatus'),'accepted');assert.equal(params.get('paymentStatus'),'paid');assert.equal(params.get('fulfillmentStatus'),'preparing');assert.equal(params.get('deliveryChannel'),'pickup');assert.equal(params.get('status'),null);
    assert.equal(params.get(endpoint.startsWith('/allwain/payments/')?'contractDateFrom':'dateFrom'),'2026-09-01');assert.equal(params.get(endpoint.startsWith('/allwain/payments/')?'contractDateTo':'dateTo'),'2026-09-30');
   }
   await page.screenshot({path:path.join(artifacts,`orders-${viewport.width}.png`)});assert.equal(writes.length,0);
   results.push({viewport,deepResultFound:true,serverQueryFieldsCorrect:true,querySharedBetweenCatalogueAndSearch:true,failedQueryOldCardsHidden:true,retrySameQuery:true,ordersStatePaymentFulfillmentDeliveryFilters:true,footerVisibleAt480:viewport.width<500,externalTraffic:false,financialWrites:0});
  }catch(error){await page.screenshot({path:path.join(artifacts,`failure-${viewport.width}.png`)});fs.writeFileSync(path.join(artifacts,`failure-${viewport.width}.txt`),await page.locator('body').innerText());fs.writeFileSync(path.join(artifacts,`reads-${viewport.width}.json`),JSON.stringify(reads,null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
 const report={passed:results.length,productionTraffic:false,results};fs.writeFileSync(path.join(artifacts,'browser-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
