// Exported app UI with private fixtures and every external network request blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/fraus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:4516',artifacts=path.resolve(__dirname,'../../../output/audit-20261004/pass2/visual');
const participation={experience:{onboardingVersion:4,guidanceEnabled:false,primaryIntent:'sell'},buyer:{enabled:true,status:'active'},seller:{enabled:true,status:'active',sellerReady:true,commercialModel:'marketplace',businessOfRecord:'seller'},connector:{enabled:false,status:'not_activated'}};
const user={id:'qa-seller',name:'Comercio de prueba',email:'qa@example.test',role:'user',participation,analyticsConsent:false};
const makeOffer=()=>({id:'qa-catalog',ownerUserId:user.id,provider:{id:user.id,name:user.name},allwainType:'catalog',allwainStatus:'active',title:'Naranjas para prueba local',description:'Publicación ficticia, sin operaciones reales.',price:2,currency:'EUR',unit:'kg',category:'Fruta',productKind:'food',locationLabel:'Foios',createdAt:'2026-10-04T10:00:00Z',updatedAt:'2026-10-04T10:00:00Z',meta:{unit:'kg',stockQuantity:40,availableQuantity:40,reservedQuantity:0,soldQuantity:0,minQuantity:1,quantityStep:1,inventoryManaged:true,deliveryEstimate:'Recogida en dos días',catalogTermsLocked:false}});
const makeRequest=()=>({id:'qa-request',userId:user.id,status:'submitted',title:'Lavadora para prueba local',createdAt:'2026-10-04T10:00:00Z',updatedAt:'2026-10-04T10:00:00Z',extracted:{productName:'Lavadora para prueba local',quantity:1,unit:'ud',targetPrice:300,currency:'EUR'},offers:[]});
(async()=>{
  fs.mkdirSync(artifacts,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
  try{
    for(const viewport of [{width:320,height:640},{width:390,height:844},{width:1280,height:900}]){
      const context=await browser.newContext({viewport,locale:'es-ES',reducedMotion:'reduce',serviceWorkers:'block'});let offer=makeOffer(),request=makeRequest();const writes=[],reads=[];
      await context.addInitScript(({user})=>localStorage.setItem('allwain_auth.profile',JSON.stringify({user,appMode:'sell'})),{user});
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.origin===base&&url.pathname.startsWith('/api/')){
          const pathname=url.pathname.slice(4);reads.push(url.pathname+url.search);let data={items:[]};
          if(req.method()!=='GET'&&!pathname.startsWith('/auth/'))writes.push({path:pathname,body:req.postDataJSON()});
          if(pathname.startsWith('/auth/'))data=pathname==='/auth/me'?user:{token:'local-fixture-token',user};
          else if(pathname==='/allwain/participation')data=participation;
          else if(pathname==='/allwain/offers')data={items:url.searchParams.get('type')==='proposal'?[]:(url.searchParams.get('view')==='history'?offer.allwainStatus==='closed':offer.allwainStatus!=='closed')?[offer]:[],pageInfo:{hasNextPage:false}};
          else if(pathname==='/allwain/offers/qa-catalog'){
            if(req.method()==='PATCH'){const patch=req.postDataJSON();assert.equal(patch.expectedUpdatedAt,offer.updatedAt);offer={...offer,...Object.fromEntries(Object.entries(patch).filter(([k])=>!['status','expectedUpdatedAt','deliveryEstimate','shippingWeightKgPerUnit','saleMode','preorderChargeDeadlineAt'].includes(k))),meta:{...offer.meta,...Object.fromEntries(Object.entries(patch).filter(([k])=>['deliveryEstimate','shippingWeightKgPerUnit','saleMode','preorderChargeDeadlineAt'].includes(k)))},allwainStatus:patch.status||offer.allwainStatus,updatedAt:'2026-10-04T10:01:00Z'};}data=offer;
          }else if(pathname==='/allwain/scan-requests')data={items:(url.searchParams.get('status')||'').split(',').includes(request.status)?[request]:[],pageInfo:{hasNextPage:false}};
          else if(pathname==='/allwain/scan-requests/qa-request'){if(req.method()==='PATCH')request={...request,status:req.postDataJSON().status};data=request;}
          else if(pathname==='/allwain/payments/config')data={enabled:false,paymentEnvironment:'test',stripeLivemode:false};
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
        }
        if(url.origin===base)return route.continue();return route.abort();
      });
      const page=await context.newPage();page.setDefaultTimeout(10000);
      try{
        await page.goto(base+'/app/ofertas?section=offers',{waitUntil:'networkidle'});
        const consent=page.getByText('Solo necesarias',{exact:true});await consent.waitFor();await consent.click();await consent.waitFor({state:'hidden'});
        await page.getByText('Editar oferta',{exact:true}).click();
        const footer=page.getByTestId('catalog-edit-footer');await footer.waitFor();
        async function layout(){
          await footer.evaluate(node=>new Promise((resolve,reject)=>{const deadline=performance.now()+3000;const check=()=>{const r=node.getBoundingClientRect();if(r.top>=0&&r.bottom<=innerHeight+1)resolve();else if(performance.now()>deadline)reject(new Error(`Footer off screen ${r.top}/${r.bottom}/${innerHeight}`));else requestAnimationFrame(check);};check();}));
          const bounds=await footer.boundingBox();assert(bounds&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1,'Editor footer remains inside viewport');
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
          await footer.getByRole('button',{name:'Guardar cambios',exact:true}).waitFor();
        }
        await layout();await page.getByTestId('catalog-edit-title').fill('Naranjas editadas localmente');
        await page.getByTestId('catalog-edit-price').fill('1,95');
        const field=page.getByTestId('catalog-edit-deliveryEstimate');await field.scrollIntoViewIfNeeded();await field.fill('Recogida el sábado');await layout();
        if(viewport.width<500){await page.setViewportSize({width:viewport.width,height:480});await layout();await page.setViewportSize(viewport);await layout();}
        await page.screenshot({path:path.join(artifacts,`catalog-editor-${viewport.width}.png`)});
        await footer.getByRole('button',{name:'Guardar cambios',exact:true}).click();await footer.waitFor({state:'hidden'});
        assert.equal(offer.price,1.95);assert.equal(writes[0].body.title,'Naranjas editadas localmente');
        await page.getByText('Retirar oferta',{exact:true}).click();
        await page.getByRole('button',{name:'Retirar oferta',exact:true}).click();
        await page.getByText('Oferta retirada. Conservamos sus pedidos y acuerdos.',{exact:true}).waitFor();
        await page.getByRole('tab',{name:'Histórico',exact:true}).click();
        await page.getByText('Naranjas editadas localmente',{exact:true}).waitFor();assert.equal(await page.getByText('Editar oferta',{exact:true}).count(),0);assert.equal(await page.getByText('Ajustar stock y mínimo',{exact:true}).count(),0);
        await page.screenshot({path:path.join(artifacts,`catalog-history-${viewport.width}.png`)});
        await page.goto(base+'/app/mis-peticiones',{waitUntil:'networkidle'});
        await page.getByRole('button',{name:'Retirar petición: Lavadora para prueba local',exact:true}).click();
        await page.getByRole('button',{name:'Retirar petición',exact:true}).click();
        await page.getByText('Petición retirada. Sus respuestas se conservan en el historial.',{exact:true}).waitFor();
        await page.getByRole('tab',{name:'Historial',exact:true}).click();await page.getByText('Lavadora para prueba local',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Archivar petición: Lavadora para prueba local',exact:true}).click();await page.getByRole('button',{name:'Archivar petición',exact:true}).click();
        await page.getByText('Petición archivada. Los pedidos y pagos conservan su estado.',{exact:true}).waitFor();
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(artifacts,`buyer-history-${viewport.width}.png`)});
        assert.equal(writes.filter(w=>/checkout|orders|contracts/.test(w.path)).length,0,'No financial operations from lifecycle actions');
        assert(reads.some(r=>/view=history/.test(r)));assert(reads.some(r=>/status=closed,canceled,archived/.test(r)));
        results.push({viewport,editorFooterVisible:true,catalogEditedAndRetired:true,historyReadonly:true,buyerWithdrawAndArchive:true,financialMutations:0});
      }catch(error){await page.screenshot({path:path.join(artifacts,`failure-${viewport.width}.png`)});fs.writeFileSync(path.join(artifacts,`failure-${viewport.width}.txt`),await page.locator('body').innerText());throw error;}finally{await context.close();}
    }
  }finally{await browser.close();}
  const report={passed:results.length,productionTraffic:false,results};fs.writeFileSync(path.join(artifacts,'browser-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
