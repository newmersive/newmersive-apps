const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const base='http://127.0.0.1:4399/api';
 const login=await (await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'buyer-flow@example.test',password:'LocalBuyerTest2026!',sourceApp:'allwain'})})).json();
 assert.ok(login.token);
 const get=async route=>{const r=await fetch(base+route,{headers:{Authorization:'Bearer '+login.token}});assert.ok(r.ok);return r.json()};
 const original=await get('/allwain/shopping-lists/c81ac381-161a-4c5e-8753-b824cea277c1');
 const edited=await get('/allwain/shopping-lists/bdfa3544-eed0-4066-8d50-5753a0b88b79');
 assert.deepEqual(edited.items.map(x=>[x.productName,x.quantity]),[['Leche',2],['Manzanas',1]]);
 assert.deepEqual(original.items.map(x=>x.productName),['Leche','Arroz','Cafe']);
 fs.writeFileSync('../live-buyer-validation/ocr-storage-evidence.json',JSON.stringify({validatedAt:new Date().toISOString(),original,edited},null,2));
 console.log('OCR_LIST_PERSISTENCE_VERIFIED');
})().catch(e=>{console.error(e.message);process.exitCode=1});
