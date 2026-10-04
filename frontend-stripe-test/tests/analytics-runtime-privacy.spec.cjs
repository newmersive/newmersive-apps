const assert = require("node:assert/strict");
const {it} = require("node:test");
const {load,configLoad,nativeFixture,browserFixture,deferred} = require("./analytics-runtime-fixture.cjs");
const discovery={surface:"search",app_mode:"buy",query_present:true,filter_count:2,result_count:10,category_filter:true,location_filter:false,price_filter:true,status_filter:false};
const purchase={transaction_id:"aw_live_"+"a".repeat(32),currency:"EUR",value:23.5,payment_environment:"live"};
const policy=load("../src/analytics/analyticsPolicy.ts");

it("compiles the verified public app destination and defaults explicitly to test",()=>{
  const config=configLoad("../src/analytics/analyticsConfig.ts");
  assert.equal(config.analyticsBuildConfig.webMeasurementId,"G-Z75ZE156W1");
  assert.equal(config.analyticsBuildConfig.webConfigurationSource,"public_app_config");
  assert.equal(config.analyticsBuildConfig.buildEnvironment,"test");
  assert.equal(config.analyticsEnvironmentParams("web").debug_mode,true);
});
it("explicit compilation overrides are validated and malformed environments fail closed",()=>{
  const explicit=configLoad("../src/analytics/analyticsConfig.ts",{}, {EXPO_PUBLIC_GA_MEASUREMENT_ID:"G-TEST123",EXPO_PUBLIC_ANALYTICS_BUILD_ENVIRONMENT:"live"});
  assert.equal(explicit.analyticsBuildConfig.webMeasurementId,"G-TEST123");
  assert.equal(explicit.analyticsEnvironmentParams("ios").build_environment,"live");
  assert.equal(explicit.analyticsEnvironmentParams("ios").debug_mode,undefined);
  const invalid=configLoad("../src/analytics/analyticsConfig.ts",{}, {EXPO_PUBLIC_GA_MEASUREMENT_ID:"private@example.com",EXPO_PUBLIC_ANALYTICS_BUILD_ENVIRONMENT:"production"});
  assert.equal(invalid.analyticsBuildConfig.webConfigured,false);
  assert.equal(invalid.analyticsBuildConfig.webMeasurementId,"");
});
it("keeps native Firebase independent of a missing or invalid web measurement ID",async()=>{
  const f=nativeFixture({environment:{EXPO_PUBLIC_GA_MEASUREMENT_ID:"invalid"}});
  assert.equal(f.runtime.isRuntimeAnalyticsConfigured(),true);
  await f.runtime.configureRuntimeConsent(true);
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"google"}),true);
  assert.equal(f.imports(),1);
});
it("drops all free input and identity/location fields while preserving allowed discovery measures",()=>{
  const safe=policy.sanitizeAnalyticsEvent("search_executed",{...discovery,q:"washing machine",email:"private@example.com",user_id:"private",request_id:"private",latitude:39.4,longitude:-0.3,locationLabel:"private",page_location:"private",items:[{name:"private"}]});
  assert.deepEqual(safe,discovery);
  assert.equal(policy.sanitizeAnalyticsEvent("unknown_private",discovery),null);
  assert.equal(policy.sanitizeAnalyticsEvent("login",{method:"private@example.com"}),null);
  assert.equal(policy.sanitizeAnalyticsEvent("chat_message_translated",{target_locale:"private",cached:true}),null);
  assert.equal(policy.sanitizeAnalyticsEvent("search_zero_results",{...discovery,result_count:10}),null);
  assert.equal(policy.sanitizeAnalyticsEvent("filters_applied",{...discovery,filter_count:NaN}),null);
  assert.equal(policy.sanitizeAnalyticsScreen("ScanResult_private_request"),null);
  assert.deepEqual(policy.sanitizeAnalyticsContext({app_mode:"sell",app_locale:"es",user_id:"private"}),{app_mode:"sell",app_locale:"es"});
});
it("accepts only a server-shaped opaque purchase receipt with coherent historical environment",()=>{
  assert.deepEqual(policy.sanitizeAnalyticsEvent("purchase",purchase),purchase);
  assert.equal(policy.sanitizeAnalyticsEvent("purchase_completed",{currency:"EUR",value:23.5}),null);
  for(const invalid of [{...purchase,transaction_id:"order-uuid"},{...purchase,transaction_id:"private@example.com"},{...purchase,payment_environment:"test"},{...purchase,value:Infinity},{...purchase,value:-1},{...purchase,currency:"private"}])
    assert.equal(policy.sanitizeAnalyticsEvent("purchase",invalid),null);
});
it("does not load a web SDK or create a queue before an explicit grant",async()=>browserFixture(async f=>{
  await f.runtime.configureRuntimeConsent(false);
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"password"}),false);
  assert.equal(await f.runtime.trackRuntimeScreen("Inicio"),false);
  assert.equal(f.scripts.length,0); assert.equal(f.window.dataLayer,undefined);
}));
it("queues commands in the Arguments contract consumed by real gtag.js",async()=>browserFixture(async f=>{
  await f.runtime.configureRuntimeConsent(true);
  await f.runtime.trackRuntimeScreen("Search");
  await f.runtime.trackRuntimeEvent("purchase",purchase);
  const commands=f.window.dataLayer.filter(item=>["consent","config","js","event"].includes(item[0]));
  assert.ok(commands.length>=6);
  for(const command of commands)assert.equal(Object.prototype.toString.call(command),"[object Arguments]");
  assert.equal(commands.filter(item=>item[0]==="event"&&item[1]==="purchase").length,1);
}));
it("web config and every event use a safe URL and platform/environment separation",async()=>browserFixture(async f=>{
  await f.runtime.configureRuntimeConsent(true);
  assert.equal(await f.runtime.trackRuntimeEvent("search_executed",{...discovery,app_platform:"ios",build_environment:"live",payment_environment:"live",q:"private"}),true);
  assert.equal(await f.runtime.trackRuntimeScreen("ScanResult"),true);
  assert.equal(await f.runtime.trackRuntimeEvent("purchase",purchase),true);
  assert.equal(f.scripts.length,1);
  const config=f.window.dataLayer.find(item=>item[0]==="config")[2];
  assert.equal(config.send_page_view,false); assert.equal(config.page_referrer,"");
  assert.equal(config.page_location,"https://allwain.es/app");
  for(const item of f.window.dataLayer.filter(item=>item[0]==="event")){
    assert.equal(item[2].app_platform,"web"); assert.equal(item[2].source_platform,"web");
    assert.equal(item[2].build_environment,"test"); assert.equal(item[2].app_surface,"app"); assert.equal(item[2].debug_mode,true);
    assert.equal(item[2].payment_environment,item[1]==="purchase"?"live":"unknown");
    assert.equal(item[2].page_referrer,""); assert.ok(!/[?#]/.test(item[2].page_location));
  }
  assert.ok(!JSON.stringify(f.window.dataLayer).includes("private"));
}));
it("web refusal purges pending events, disables the destination and deletes measurement cookies",async()=>browserFixture(async f=>{
  await f.runtime.configureRuntimeConsent(true);
  await f.runtime.trackRuntimeEvent("purchase",purchase);
  await f.runtime.configureRuntimeConsent(false);
  assert.equal(f.window["ga-disable-G-Z75ZE156W1"],true);
  assert.equal(f.window.dataLayer.filter(item=>item[0]==="event").length,0);
  assert.equal(f.window.dataLayer.at(-1)[2].analytics_storage,"denied");
  assert.ok(f.removedCookies.some(cookie=>cookie.startsWith("_ga=")&&cookie.includes("path=/app")));
  assert.ok(f.removedCookies.every(cookie=>!cookie.startsWith("essential=")));
  assert.equal(await f.runtime.trackRuntimeEvent("purchase",purchase),false);
  await f.runtime.configureRuntimeConsent(true);
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"apple"}),true);
  assert.deepEqual(f.window.dataLayer.filter(item=>item[0]==="event").map(item=>item[1]),["login"]);
}));
it("web runtime rejects stale/throwing actor guards and cannot break checkout on an SDK error",async()=>browserFixture(async f=>{
  await f.runtime.configureRuntimeConsent(true);
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"google"},()=>false),false);
  assert.equal(await f.runtime.trackRuntimeScreen("Inicio",()=>{throw new Error("private")}),false);
  assert.equal(await f.runtime.setRuntimeContext({app_mode:"buy"},()=>false),false);
  f.window.gtag=()=>{throw new Error("private@example.com")};
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"google"}),false);
}));
it("app web reads persisted consent fail closed and obeys cross-tab refusal without regranting",async()=>browserFixture(async f=>{
  let stored="granted",listener;
  f.window.localStorage={getItem:()=>stored}; f.window.addEventListener=(name,callback)=>{if(name==="storage")listener=callback;};
  await f.runtime.configureRuntimeConsent(true);
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"google"}),true);
  stored="denied";
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"google"}),false);
  listener({key:"allwain:analytics-consent:allwain-analytics-v1-2026-09-06",newValue:"denied"});
  assert.equal(f.window["ga-disable-G-Z75ZE156W1"],true);
  stored="granted"; listener({key:"allwain:analytics-consent:allwain-analytics-v1-2026-09-06",newValue:"granted"});
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"google"}),false);
  await f.runtime.configureRuntimeConsent(true);
  f.window.localStorage.getItem=()=>{throw new Error("private");};
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"google"}),false);
}));
it("native explicit grants set default separation and forbid identity/ad consent",async()=>{
  const f=nativeFixture({platform:"ios"});
  await f.runtime.configureRuntimeConsent(true);
  assert.equal(await f.runtime.trackRuntimeEvent("purchase",purchase),true);
  assert.equal(await f.runtime.trackRuntimeScreen("ScanResult"),true);
  assert.equal(await f.runtime.setRuntimeContext({app_mode:"connector",app_locale:"es",user_id:"private"}),true);
  const defaults=f.calls.find(([name])=>name==="defaults")[1];
  assert.equal(defaults.app_platform,"ios"); assert.equal(defaults.build_environment,"test"); assert.equal(defaults.payment_environment,"unknown");
  const event=f.calls.find(([name])=>name==="event")[2];
  assert.equal(event.transaction_id,purchase.transaction_id); assert.equal(event.payment_environment,"live");
  assert.equal(event.app_platform,"ios"); assert.equal(event.debug_mode,true);
  assert.equal(f.calls.find(([name])=>name==="screen")[1].app_platform,"ios");
  assert.deepEqual(f.calls.find(([name])=>name==="context")[1],{app_mode:"connector",app_locale:"es"});
  for(const [name,consent] of f.calls.filter(([name])=>name==="consent")){
    assert.equal(consent.ad_storage,false); assert.equal(consent.ad_user_data,false); assert.equal(consent.ad_personalization,false);
  }
  await f.runtime.configureRuntimeConsent(false);
  assert.ok(f.calls.some(([name,value])=>name==="user"&&value===null));
  assert.ok(f.calls.some(([name])=>name==="reset"));
});
it("native actor changes during SDK configuration discard queued events/screens/context",async()=>{
  const gate=deferred(), entered=deferred(); let current=true;
  const f=nativeFixture({setConsent:async consent=>{if(consent.analytics_storage){entered.resolve();await gate.promise;}}});
  const grant=f.runtime.configureRuntimeConsent(true); await entered.promise;
  const event=f.runtime.trackRuntimeEvent("search_executed",discovery,()=>current);
  const screen=f.runtime.trackRuntimeScreen("Inicio",()=>current);
  const context=f.runtime.setRuntimeContext({app_mode:"buy",app_locale:"es"},()=>current);
  current=false; gate.resolve();
  assert.deepEqual(await Promise.all([event,screen,context]),[false,false,false]); await grant;
  assert.equal(f.calls.filter(([name])=>["event","screen","context"].includes(name)).length,0);
});
it("native revoke then regrant cannot resurrect an event captured under the earlier grant",async()=>{
  const gate=deferred(), entered=deferred(); let first=true;
  const f=nativeFixture({setConsent:async consent=>{if(consent.analytics_storage&&first){first=false;entered.resolve();await gate.promise;}}});
  const initial=f.runtime.configureRuntimeConsent(true); await entered.promise;
  const stale=f.runtime.trackRuntimeEvent("login",{method:"google"});
  const revoke=f.runtime.configureRuntimeConsent(false);
  const regrant=f.runtime.configureRuntimeConsent(true);
  gate.resolve(); await Promise.all([initial,revoke,regrant]);
  assert.equal(await stale,false);
  assert.ok(f.calls.some(([name])=>name==="reset"));
  assert.equal(await f.runtime.trackRuntimeEvent("login",{method:"google"}),true);
  assert.equal(f.calls.filter(([name])=>name==="event").length,1);
});
it("native import/configuration/event errors remain optional and return false",async()=>{
  const missing=nativeFixture({importError:true}); await missing.runtime.configureRuntimeConsent(true);
  assert.equal(await missing.runtime.trackRuntimeEvent("login",{method:"google"}),false);
  assert.equal(missing.runtime.isRuntimeAnalyticsConfigured(),false);
  const broken=nativeFixture({setEnabled:async value=>{if(value)throw new Error("private")}});
  await broken.runtime.configureRuntimeConsent(true);
  assert.equal(await broken.runtime.trackRuntimeEvent("login",{method:"google"}),false);
  assert.ok(broken.calls.some(([name,value])=>name==="enabled"&&value===false));
  const eventError=nativeFixture({logEvent:async()=>{throw new Error("private")}});
  await eventError.runtime.configureRuntimeConsent(true);
  assert.equal(await eventError.runtime.trackRuntimeEvent("login",{method:"google"}),false);
});
it("a consent choice cannot grant for an account that changes during synchronization",async()=>{
  const {applyAnalyticsConsentDecision}=load("../src/analytics/consentDecision.ts");
  const configured=[],stored=[]; let current=true;
  await assert.rejects(()=>applyAnalyticsConsentDecision(true,{
    current:()=>current, configure:async value=>configured.push(value),store:async value=>stored.push(value),sync:async()=>{current=false;}
  }),/SUPERSEDED/);
  assert.deepEqual(configured,[false,false]); assert.deepEqual(stored,["granted","denied"]);
});
it("index consent snapshots invalidate pending work and SDK failures do not propagate",async()=>{
  let actor=1; const calls=[],gate=deferred(); let pending=false;
  const bridge={captureAuthSession:()=>({owner:null,generation:actor,token:null,isCurrent:()=>false})};
  const runtime={configureRuntimeConsent:async()=>{},isRuntimeAnalyticsConfigured:()=>true,
    trackRuntimeEvent:async(name,params,current)=>{if(pending)await gate.promise; if(!current())return false; calls.push([name,params]); return true;},
    trackRuntimeScreen:async()=>{throw new Error("private")},setRuntimeContext:async()=>true};
  const api=load("../src/analytics/index.ts",{"./analyticsRuntime":runtime,"../store/authSessionBridge":bridge});
  assert.equal(api.getAnalyticsConsentSnapshot().granted,false);
  assert.equal(await api.trackAnalyticsEvent("login",{method:"google"}),false);
  await api.configureAnalyticsConsent(true); const consent=api.getAnalyticsConsentSnapshot(); assert.equal(consent.isCurrent(),true);
  pending=true; const old=api.trackAnalyticsEvent("login",{method:"google"});
  actor=2; gate.resolve(); assert.equal(await old,false); assert.deepEqual(calls,[]);
  await api.configureAnalyticsConsent(false); await api.configureAnalyticsConsent(true);
  assert.equal(consent.isCurrent(),false);
  assert.equal(await api.trackAnalyticsScreen("Inicio"),false);
  assert.equal(await api.trackAnalyticsEvent("login",{method:"google"},()=>false),false);
});

function screenIndexFixture(options={}){
  let actor=1,configured=false; const calls=[],gate=options.gate;
  const bridge={captureAuthSession:()=>({owner:null,generation:actor,token:null,isCurrent:()=>false})};
  const ready=gate?gate.promise:Promise.resolve();
  const runtime={
    configureRuntimeConsent:async value=>{configured=false;if(value)await ready;configured=value;},
    isRuntimeAnalyticsConfigured:()=>true,
    trackRuntimeEvent:async(name,params,current)=>{if(options.refuseUntilConfigured&&!configured)return false;await ready;if(!current())return false;calls.push(["event",name,params]);return true;},
    trackRuntimeScreen:async(name,current)=>{if(options.refuseUntilConfigured&&!configured)return false;await ready;if(!current())return false;calls.push(["screen",name]);return true;},
    setRuntimeContext:async(props,current)=>{if(options.refuseUntilConfigured&&!configured)return false;await ready;if(!current())return false;calls.push(["context",props]);return true;}
  };
  const api=load("../src/analytics/index.ts",{"./analyticsRuntime":runtime,"../store/authSessionBridge":bridge});
  return {api,calls,changeActor:()=>actor++};
}
it("consent configuration emits only the latest current screen/context and never replays actions from unknown",async()=>{
  const f=screenIndexFixture();
  assert.equal(await f.api.trackAnalyticsScreen("Auth"),false);
  assert.equal(await f.api.trackAnalyticsScreen("Search"),false);
  assert.equal(await f.api.setAnalyticsContext({appMode:"buy",locale:"es"}),false);
  assert.equal(await f.api.trackAnalyticsEvent("login",{method:"google"}),false);
  assert.equal(await f.api.trackAnalyticsEvent("search_executed",discovery),false);
  assert.deepEqual(f.calls,[]);
  await f.api.configureAnalyticsConsent(true);
  assert.deepEqual(f.calls,[["context",{app_mode:"buy",app_locale:"es"}],["screen","Search"]]);
  await f.api.configureAnalyticsConsent(true);
  assert.equal(f.calls.filter(c=>c[0]==="screen").length,1,"reconfiguration never duplicates the held current screen");
});
it("a screen requested while SDK grant is pending replaces the old screen and is not double-dispatched",async()=>{
  const gate=deferred(),f=screenIndexFixture({gate});
  await f.api.trackAnalyticsScreen("Auth");
  const grant=f.api.configureAnalyticsConsent(true);
  const screen=f.api.trackAnalyticsScreen("Search");
  gate.resolve();await Promise.all([grant,screen]);
  assert.deepEqual(f.calls,[["screen","Search"]]);
});
it("a runtime that immediately refuses before consent readiness still measures the latest child screen/context once after grant",async()=>{
  const gate=deferred(),f=screenIndexFixture({gate,refuseUntilConfigured:true});
  const grant=f.api.configureAnalyticsConsent(true);
  assert.equal(f.api.getAnalyticsConsentSnapshot().granted,false,"a requested grant is not an operational grant");
  assert.equal(f.api.getAnalyticsConsentSnapshot().isCurrent(),false);
  assert.equal(await f.api.trackAnalyticsScreen("Auth"),false);
  assert.equal(await f.api.trackAnalyticsScreen("Search"),false);
  assert.equal(await f.api.setAnalyticsContext({appMode:"buy",locale:"es"}),false);
  assert.equal(await f.api.trackAnalyticsEvent("search_executed",discovery),false);
  assert.deepEqual(f.calls,[]);
  gate.resolve();await grant;
  assert.equal(f.api.getAnalyticsConsentSnapshot().granted,true);
  assert.deepEqual(f.calls,[["context",{app_mode:"buy",app_locale:"es"}],["screen","Search"]]);
  assert.equal(f.calls.filter(c=>c[0]==="event").length,0,"actions captured before readiness are never queued");
});
it("revocation, changed actor and stale caller guards discard held screens and context",async()=>{
  const f=screenIndexFixture();
  await f.api.trackAnalyticsScreen("Search");
  await f.api.setAnalyticsContext({appMode:"buy",locale:"es"});
  f.changeActor();await f.api.configureAnalyticsConsent(true);
  assert.deepEqual(f.calls,[]);
  await f.api.configureAnalyticsConsent(false);
  await f.api.trackAnalyticsScreen("ScanResult");
  await f.api.configureAnalyticsConsent(false);
  await f.api.configureAnalyticsConsent(true);
  assert.deepEqual(f.calls,[],"refusal clears the held enum");
  await f.api.configureAnalyticsConsent(false);
  let current=true;
  await f.api.trackAnalyticsScreen("Perfil",()=>current);
  current=false;await f.api.configureAnalyticsConsent(true);
  assert.deepEqual(f.calls,[]);
});

