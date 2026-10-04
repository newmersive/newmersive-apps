const assert = require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=require('./helpers/load-typescript.cjs');
const discovery=load('src/utils/marketDiscovery.ts');
const copy=load('src/i18n/connectorDiscoveryCopy.ts');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
const connector={enabled:true,status:'active',available:true,radiusKm:5,locationLabel:'Foios',locationMode:'coordinates'};
const delivery=(id,extra={})=>({id,orderId:`order-${id}`,status:'open',feeAmount:200,currency:'eur',pickupZone:id,deliveryZone:'Foios',mine:false,createdAt:'2026-10-04T10:00:00Z',...extra});
const page=(items,cursor)=>({items,demoItems:[],radiusKm:5,pageInfo:{hasNextPage:Boolean(cursor),nextCursor:cursor||null}});
function harness(screen){
  const states=[];let hook=0,effects=[],layout=[],tree,scheduled=false,disposed=false,focused=true,generation=1,routeParams={};
  let user={id:'connector',participation:{connector}},mode='connector';const requests=[],locations=[],navigations=[],saved=[];
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState:initial=>{const i=hook++;if(!states[i])states[i]={value:typeof initial==='function'?initial():initial};return[states[i].value,update=>{const value=typeof update==='function'?update(states[i].value):update;if(!Object.is(value,states[i].value)){states[i].value=value;schedule();}}];},
    useRef:value=>{const i=hook++;return states[i]||=( {current:value});},
    useMemo:(callback,deps)=>{const i=hook++,old=states[i];if(!old||!deps||deps.some((d,n)=>d!==old.deps?.[n]))states[i]={value:callback(),deps};return states[i].value;},
  };react.useCallback=(callback,deps)=>react.useMemo(()=>callback,deps);
  function effect(queue,callback,deps){const i=hook++,old=states[i];if(!old||!deps||deps.some((d,n)=>d!==old.deps?.[n])){states[i]={...old,deps};queue.push(()=>{old?.cleanup?.();states[i].cleanup=callback();});}}
  react.useEffect=(callback,deps)=>effect(effects,callback,deps);react.useLayoutEffect=(callback,deps)=>effect(layout,callback,deps);
  function schedule(){if(scheduled||disposed)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!disposed)render();});}
  const getState=()=>({user,appMode:mode,setParticipation:async participation=>{saved.push(participation);user={...user,participation};schedule();}});
  const store=selector=>selector(getState());store.getState=getState;
  const owner={};const session=()=>{const captured=generation;return{owner,generation:captured,isCurrent:()=>captured===generation&&!disposed};};
  const navigation={navigate:(...args)=>navigations.push(args),setParams:patch=>{routeParams={...routeParams,...patch};schedule();}};
  const request=method=>(url,payload)=>{const pending=deferred();requests.push({method,url,payload,...pending});return pending.promise;};
  const query=load('src/utils/discoveryFilters.ts',{react,'./journeyDrafts':{readJourneyDraft:async()=>null,writeJourneyDraft:async()=>true}});
  const native=Object.fromEntries(['ActivityIndicator','Modal','ScrollView','Text','TextInput','TouchableOpacity','Switch','View'].map(name=>[name,name]));
  const replacements={react,'react-native':{...native,StyleSheet:{create:value=>value,absoluteFill:{},absoluteFillObject:{}}},
    '@react-navigation/native':{useNavigation:()=>navigation,useRoute:()=>({params:routeParams}),useIsFocused:()=>focused,useFocusEffect:callback=>react.useEffect(()=>focused?callback():undefined,[callback,focused])},
    'expo-camera':{CameraView:'CameraView',useCameraPermissions:()=>[{granted:true},async()=>({granted:true})]},
    'lucide-react-native':new Proxy({},{get:(_,name)=>String(name)}),
    '../../config/api':{apiAuthGet:request('GET'),apiAuthPost:request('POST'),apiAuthPatch:request('PATCH')},
    '../../components/design-system':Object.fromEntries(['BigActionButton','DeliveryCard','EmptyState','TodaySummary'].map(name=>[name,name])),
    '../../store/auth.store':{useAuthStore:store},'../../store/authSessionBridge':{captureAuthSession:session},
    '../../theme/colors':{colors:{}},'../../analytics':{trackAnalyticsEvent:async()=>{}},
    '../../utils/format':{formatMinorCurrency:n=>String(n)},'../../utils/currentLocation':{getAllwainCurrentLocation:()=>{const pending=deferred();locations.push(pending);return pending.promise;}},
    '../../i18n/useAppTranslation':{useAppTranslation:()=>({locale:'es'})},'../../i18n/connectorDiscoveryCopy':copy,
    '../../utils/discoveryFilters':query,'../../utils/marketDiscovery':discovery,
  };
  const filename=path.resolve(__dirname,`../src/screens/Participation/${screen}.tsx`),compiled=new Module(filename);compiled.paths=Module._nodeModulePaths(path.dirname(filename));
  compiled.require=id=>{if(Object.hasOwn(replacements,id))return replacements[id];throw Error(`Unexpected import: ${id}`);};
  compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
  function render(){hook=0;tree=compiled.exports.default();const a=layout,b=effects;layout=[];effects=[];a.forEach(fn=>fn());b.forEach(fn=>fn());}
  render();return{requests,locations,navigations,saved,get tree(){return tree;},
    focus:value=>{focused=value;render();},route:id=>{routeParams={deliveryId:id};render();},
    actor:(id='other',newMode=mode)=>{generation++;user={...user,id};mode=newMode;render();},
    unmount:()=>{disposed=true;for(const state of states)state?.cleanup?.();},
  };
}
function nodes(tree){return[tree,...(tree?.props?.children||[]).flat(Infinity).filter(child=>child&&typeof child==='object').flatMap(nodes)];}
function texts(tree){return nodes(tree).filter(node=>node.type==='Text').flatMap(node=>node.props.children).join(' ');}
function button(h,label){const result=nodes(h.tree).find(node=>(node.type==='BigActionButton'&&node.props.label===label)||(node.type==='TouchableOpacity'&&(node.props.accessibilityLabel===label||nodes(node).some(child=>child.type==='Text'&&child.props.children.includes(label)))));assert.ok(result,`button ${label}`);return result;}
const cards=h=>nodes(h.tree).filter(node=>node.type==='DeliveryCard').map(node=>node.props.title);
const latest=h=>h.requests.at(-1);
const listRequest=(h,scope='all')=>h.requests.filter(r=>r.method==='GET'&&new URL(r.url,'https://test.invalid').searchParams.get('scope')===scope).at(-1);
function toSave(h){button(h,'Siguiente').props.onPress();return settle().then(()=>{button(h,'Siguiente').props.onPress();return settle();});}

test('initial error is not a verified empty or demo; retry repeats exact selection',async()=>{
  const h=harness('ConnectorOperationsScreen');await settle();const initial=latest(h);initial.reject(Error('offline'));await settle();
  assert.match(texts(h.tree),/offline/);assert.equal(nodes(h.tree).filter(n=>n.type==='EmptyState').length,0);
  button(h,'Reintentar').props.onPress();await settle();assert.equal(latest(h).url,initial.url);latest(h).resolve(page([]));await settle();assert.equal(nodes(h.tree).filter(n=>n.type==='EmptyState').length,1);h.unmount();
});
test('selection B beats slow A; signed cursor stays with B and failing More retries same cursor; refocus preserves results',async()=>{
  const h=harness('ConnectorOperationsScreen');await settle();const a=listRequest(h);button(h,'Mis entregas').props.onPress();await settle();const b=listRequest(h,'mine');b.resolve(page([delivery('B',{mine:true})],'B-next'));await settle();a.resolve(page([delivery('A')],'A-next'));await settle();assert.deepEqual(cards(h),['B → Foios']);
  const more=button(h,'Ver más entregas');more.props.onPress();more.props.onPress();await settle();const failed=latest(h);assert.match(failed.url,/scope=mine/);assert.match(failed.url,/cursor=B-next/);assert.equal(h.requests.filter(r=>r.url.includes('cursor=B-next')).length,1);failed.reject(Error('page offline'));await settle();assert.deepEqual(cards(h),['B → Foios']);
  button(h,'Reintentar').props.onPress();await settle();assert.equal(latest(h).url,failed.url);latest(h).resolve(page([delivery('B2',{mine:true})]));await settle();const count=h.requests.length;h.focus(false);await settle();h.focus(true);await settle();assert.equal(h.requests.length,count);assert.deepEqual(cards(h),['B → Foios','B2 → Foios']);h.unmount();
});
test('notification hydrates old exact delivery independently without contaminating paginated query; stale exact ID cannot replace newer ID',async()=>{
  const h=harness('ConnectorOperationsScreen');await settle();listRequest(h).resolve(page([delivery('page-first')],'next'));await settle();h.route('old-own');await settle();const old=latest(h);assert.match(old.url,/\/old-own$/);h.route('new-own');await settle();const newer=latest(h);newer.resolve(delivery('new-own',{mine:true,status:'accepted'}));await settle();old.resolve(delivery('old-own',{mine:true,status:'accepted'}));await settle();assert.deepEqual(cards(h),['new-own → Foios','page-first → Foios']);
  button(h,'Volver a las entregas').props.onPress();await settle();assert.deepEqual(cards(h),['page-first → Foios']);const before=h.requests.length;button(h,'Ver más entregas').props.onPress();await settle();assert.equal(h.requests.length,before+1);assert.match(latest(h).url,/cursor=next/);h.unmount();
});
test('exact access denial keeps valid list and retry is exact ID',async()=>{
  const h=harness('ConnectorOperationsScreen');await settle();listRequest(h).resolve(page([delivery('valid')]));await settle();h.route('private');await settle();const exact=latest(h);exact.reject(Error('LOGISTICS_ASSIGNMENT_NOT_FOUND'));await settle();assert.deepEqual(cards(h),['valid → Foios']);assert.match(texts(h.tree),/ya no esté disponible/);button(h,'Reintentar').props.onPress();await settle();assert.equal(latest(h).url,exact.url);h.unmount();
});
test('account or role changes invalidate pending list and mutation; old owner receipt cannot change the new screen',async()=>{
  const h=harness('ConnectorOperationsScreen');await settle();const old=listRequest(h);h.actor('second');await settle();const current=listRequest(h);current.resolve(page([delivery('second')]));await settle();old.resolve(page([delivery('first')]));await settle();assert.deepEqual(cards(h),['second → Foios']);button(h,'Aceptar entrega').props.onPress();await settle();const mutation=latest(h);h.actor('third','buy');await settle();const newList=listRequest(h);newList.resolve(page([delivery('third')]));await settle();mutation.resolve(delivery('second',{mine:true,status:'accepted'}));await settle();assert.deepEqual(cards(h),['third → Foios']);h.unmount();
});
test('accept invalidates an older refresh so it cannot restore the open card after confirmation',async()=>{
  const h=harness('ConnectorOperationsScreen');await settle();listRequest(h).resolve(page([delivery('real')]));await settle();button(h,'Actualizar entregas').props.onPress();await settle();const old=latest(h);button(h,'Aceptar entrega').props.onPress();button(h,'Aceptar entrega').props.onPress();await settle();const mutation=latest(h);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);mutation.resolve(delivery('real',{mine:true,status:'accepted'}));await settle();const fresh=latest(h);assert.equal(fresh.method,'GET');fresh.resolve(page([delivery('real',{mine:true,status:'accepted'})]));await settle();old.resolve(page([delivery('real')]));await settle();assert.equal(nodes(h.tree).find(n=>n.type==='DeliveryCard').props.status,'Aceptada');h.unmount();
});
test('manual B clears prior coordinates explicitly and delayed GPS A cannot overwrite the edited municipality',async()=>{
  const h=harness('ConnectorActivationScreen');await settle();button(h,'Usar mi zona actual').props.onPress();await settle();const gps=h.locations.at(-1);nodes(h.tree).find(n=>n.type==='TextInput').props.onChangeText('Meliana');await settle();gps.resolve({latitude:39.538,longitude:-0.355,locationLabel:'Foios'});await settle();assert.equal(nodes(h.tree).find(n=>n.type==='TextInput').props.value,'Meliana');await toSave(h);button(h,'Guardar cambios').props.onPress();button(h,'Guardar cambios').props.onPress();await settle();const request=latest(h);assert.equal(h.requests.length,1);assert.equal(request.payload.locationLabel,'Meliana');assert.equal(request.payload.clearCoordinates,true);assert.equal(request.payload.latitude,undefined);request.resolve({connector:{...connector,locationLabel:'Meliana',locationMode:'label'}});await settle();assert.equal(h.saved.length,1);assert.equal(h.navigations.length,1);h.unmount();
});
test('unchanged municipality adjustment preserves stored coordinates; a contradictory receipt does not navigate',async()=>{
  const h=harness('ConnectorActivationScreen');await settle();await toSave(h);button(h,'Guardar cambios').props.onPress();await settle();const request=latest(h);assert.equal(request.payload.clearCoordinates,false);assert.equal(request.payload.latitude,undefined);request.resolve({connector:{...connector,locationMode:'label'}});await settle();assert.equal(h.saved.length,0);assert.equal(h.navigations.length,0);assert.match(texts(h.tree),/no confirmó/);h.unmount();
});
test('activation late receipt after same-account relogin is discarded',async()=>{
  const h=harness('ConnectorActivationScreen');await settle();await toSave(h);button(h,'Guardar cambios').props.onPress();await settle();const request=latest(h);h.actor('connector');await settle();request.resolve({connector});await settle();assert.equal(h.saved.length,0);assert.equal(h.navigations.length,0);h.unmount();
});
test('new GPS coordinates are sent together and only a matching coordinate receipt is accepted',async()=>{
  const h=harness('ConnectorActivationScreen');await settle();button(h,'Usar mi zona actual').props.onPress();await settle();h.locations.at(-1).resolve({latitude:39.53,longitude:-0.34,locationLabel:'Meliana'});await settle();await toSave(h);button(h,'Guardar cambios').props.onPress();await settle();const request=latest(h);assert.equal(request.payload.latitude,39.53);assert.equal(request.payload.longitude,-0.34);assert.equal(request.payload.clearCoordinates,false);request.resolve({connector:{...connector,locationLabel:'Meliana',locationMode:'coordinates'}});await settle();assert.equal(h.saved.length,1);assert.equal(h.navigations.length,1);h.unmount();
});
test('QR verification rejects a wrong-owner receipt and repeated scanner callbacks send one mutation',async()=>{
  const h=harness('ConnectorOperationsScreen');await settle();listRequest(h).resolve(page([delivery('qr',{mine:true,status:'accepted'})]));await settle();button(h,'Escanear QR del vendedor').props.onPress();await settle();const camera=nodes(h.tree).find(n=>n.type==='CameraView');camera.props.onBarcodeScanned({data:'12345678'});camera.props.onBarcodeScanned({data:'12345678'});await settle();assert.equal(h.requests.filter(r=>r.method==='POST').length,1);const request=latest(h);request.resolve(delivery('qr',{mine:false,status:'picked_up'}));await settle();assert.match(texts(h.tree),/no confirmó la verificación/);assert.equal(nodes(h.tree).find(n=>n.type==='DeliveryCard').props.status,'Aceptada');h.unmount();
});
test('new connector discovery copy covers all six supported locales',()=>{
  for(const locale of ['es','en','fr','it','zh','ar']){assert.ok(copy.connectorDiscoveryCopy[locale]);for(const key of Object.keys(copy.connectorDiscoveryCopy.es))assert.ok(copy.connectorDiscoveryCopy[locale][key]);}
});
