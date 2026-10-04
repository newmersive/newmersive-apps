const assert=require('node:assert/strict'),{test}=require('node:test');
const {createScrollWindow,rowWindow}=require('./helpers/load-typescript.cjs')('src/utils/scrollWindow.ts');
for(const size of [100,1000,10000])test(`window renders bounded IDs from ${size} loaded rows, including deep scroll`,()=>{
 const offsets=Array.from({length:size+1},(_,i)=>i*360);
 for(const y of [0,360*50,360*(size-2)]){
  const ids=Array.from(rowWindow(offsets,y,700));assert.ok(ids.length<10);assert.equal(new Set(ids).size,ids.length);
  if(y<360*size)assert.ok(ids.some(i=>offsets[i]<=y&&offsets[i+1]>=y));
 }
});
test('selected offscreen record remains mounted once without constructing every earlier card',()=>{
 const offsets=Array.from({length:10001},(_,i)=>i*360),ids=Array.from(rowWindow(offsets,0,700,700,9999));assert.ok(ids.includes(9999));assert.ok(ids.length<11);assert.equal(new Set(ids).size,ids.length);
});
test('content-height correction at the end retains the last row until native scroll clamps',()=>{
 assert.deepEqual(Array.from(rowWindow([0,300,600],900,700,0)),[1]);
});
test('scroll viewport emits changes, preserves coordinates and unsubscribes safely',()=>{
 const store=createScrollWindow();let calls=0;const stop=store.subscribe(()=>calls++);store.update({y:400});store.update({y:400});assert.equal(calls,1);store.update({height:480,containerY:50});assert.equal(store.getSnapshot().y,400);stop();store.update({y:800});assert.equal(calls,2);
});
