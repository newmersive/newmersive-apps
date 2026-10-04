const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const runtime = path.resolve(__dirname,'../../live-buyer-validation');
fs.mkdirSync(runtime,{recursive:true});
assert.match(process.env.STRIPE_SECRET_KEY || '', /^sk_test_/);
assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/newmersive_e2e_/);
const binary = require('C:/Todaslasrutas/NEWMERSIVE/ALLWAIN-V2-ADVANCED/ops/stripe-binary.cjs');
const listener = spawn(binary,['listen','--skip-update','--color','off','--forward-to','http://127.0.0.1:4399/api/allwain/payments/webhook'],{env:{...process.env,STRIPE_API_KEY:process.env.STRIPE_SECRET_KEY},windowsHide:true});
let started=false;
function receive(data){
  const text=data.toString();
  fs.appendFileSync(path.join(runtime,'webhook.log'),text.replace(/whsec_\w+/g,'[SECRET]'));
  const secret=text.match(/whsec_\w+/)?.[0];
  if(secret&&!started){started=true; process.env.STRIPE_CONNECT_WEBHOOK_SECRET=secret; process.env.STRIPE_WEBHOOK_SECRET=secret; main().catch(e=>{console.error(e);listener.kill();process.exit(1)});}
}
listener.stdout.on('data',receive);listener.stderr.on('data',receive);
async function main(){
  process.env.SCAN_PROVIDER='google';
  process.env.ALLWAIN_APP_URL='https://allwain.es/app';
  process.env.GOOGLE_CLOUD_VISION_API_KEY='local-proxy-only';
  process.env.GOOGLE_CLOUD_VISION_ENDPOINT='http://127.0.0.1:8769/vision';
  require('ts-node/register');
  const express=require('express');
  const {app}=require('../src/server');
  const {getPrisma}=require('../src/db/prisma');
  const prisma=getPrisma();
  const web=path.resolve(__dirname,'../../frontend-stripe-test/dist-buyer-flow-qa');
  app.use(express.static(web)); app.get('*',(_req,res)=>res.sendFile(path.join(web,'index.html')));
  app.listen(4399,'127.0.0.1');
  async function api(route,body,token){const res=await fetch('http://127.0.0.1:4399/api'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const value=await res.json();assert.ok(res.ok,JSON.stringify({route,status:res.status,value}));return value;}
  const password='LocalBuyerTest2026!';
  const buyer=await api('/auth/register',{name:'Comprador prueba local',email:'buyer-flow@example.test',password,sourceApp:'allwain'});
  const seller=await api('/auth/register',{name:'Comercio prueba local',email:'seller-flow@example.test',password,sourceApp:'allwain',role:'company'});
  await api('/allwain/participation/seller/activate',{sellerType:'company',displayName:'Comercio local'},seller.token);
  const offer=await api('/allwain/offers',{title:'Naranjas prueba local Stripe',description:'Prueba local sin entrega ni cobro real',price:1,meta:{currency:'EUR',unit:'kg',stockQuantity:50,availableQuantity:50,minQuantity:1,quantityStep:1,saleMode:'immediate',locationLabel:'Foios',deliveryEstimate:'Recogida'}},seller.token);
  const contract=await api(`/allwain/offers/${offer.id}/accept`,{quantity:10,deliveryMethod:'pickup',deliveryChannel:'pickup',purchaseKey:'local-browser-validation'},buyer.token);
  fs.writeFileSync(path.join(runtime,'state.json'),JSON.stringify({buyerId:buyer.user.id,contractId:contract.id,offerId:offer.id,url:`http://127.0.0.1:4399/app/ofertas?section=orders&contractId=${contract.id}`},null,2));
  console.log('LOCAL_APP_READY');
  const timer=setInterval(async()=>{const orders=await prisma.allwainOrder.findMany({where:{buyerUserId:buyer.user.id},select:{id:true,contractId:true,status:true,paymentStatus:true,totalAmount:true}});fs.writeFileSync(path.join(runtime,'orders.json'),JSON.stringify(orders,null,2));},3000);
  process.on('SIGINT',()=>{clearInterval(timer);listener.kill();process.exit(0)});
}
