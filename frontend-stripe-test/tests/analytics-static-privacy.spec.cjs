const assert=require("node:assert/strict");
const {it}=require("node:test");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.resolve(__dirname,"../public/analytics-static.js"),"utf8");
const consentKey="allwain:analytics-consent:allwain-analytics-v1-2026-09-06";
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(options={}){
  const scripts=[],cookies=[],listeners=new Map(),elements=new Map();
  let stored=Object.hasOwn(options,"status")?options.status:"granted",readError=false,writeError=false;
  const handlers=[];
  function node(tag){
    return {tag,children:[],attrs:{},style:{},listeners:{},
      setAttribute(key,value){this.attrs[key]=value;},
      getAttribute(key){return this.attrs[key];},
      appendChild(child){this.children.push(child);if(child.id)elements.set(child.id,child);},
      remove(){if(this.id)elements.delete(this.id);this.removed=true;},
      addEventListener(name,cb){this.listeners[name]=cb;},
      querySelector(selector){return this.children.find(child=>selector==="[data-actions]"&&Object.hasOwn(child.attrs,"data-actions"))||null;},
      querySelectorAll(selector){return this.children.flatMap(child=>[...(selector==="[data-consent-source]"&&Object.hasOwn(child.attrs,"data-consent-source")?[child]:[]),...child.querySelectorAll(selector)]);}
    };
  }
  const preference=node("button");
  const document={documentElement:{lang:"es"},body:node("body"),head:{appendChild(script){scripts.push(script);elements.set(script.id,script);}},
    getElementById:id=>elements.get(id)||null,createElement:node,
    get cookie(){return "_ga=private; _ga_Z75ZE156W1=private; essential=keep";},set cookie(value){cookies.push(value);},
    querySelectorAll(selector){return selector==="[data-analytics-preferences]"?[preference]:[];}
  };
  const window={document,location:{hostname:"allwain.es",origin:"https://allwain.es",href:"https://allwain.es/?email=private@example.com#private"},
    localStorage:{getItem(){if(readError)throw new Error("private");return stored;},setItem(key,value){if(writeError)throw new Error("private");stored=value;}},
    addEventListener(name,cb){listeners.set(name,cb);}
  };
  const config=Object.hasOwn(options,"config")?options.config:{measurementId:"G-Z75ZE156W1",staticBuildEnvironment:"test"};
  const context=vm.createContext({window,document,fetch:async()=>({ok:!options.fetchError,json:async()=>config})});
  vm.runInContext(source,context,{filename:"analytics-static.js"});
  for(let i=0;i<5;i++)await Promise.resolve();
  const calls=()=>Array.from(window.dataLayer||[],entry=>Array.from(entry));
  const events=()=>calls().filter(entry=>entry[0]==="event");
  return {window,document,scripts,cookies,calls,events,
    consent(value){stored=value;listeners.get("storage")?.({key:consentKey,newValue:value});},
    persisted(value){stored=value;},
    readFailure(value){readError=value;},writeFailure(value){writeError=value;},
    choose(granted){const banner=elements.get("allwain-analytics-consent");assert.ok(banner);const actions=banner.querySelector("[data-actions]");actions.children[granted?1:0].listeners.click();},
    preferences(){preference.listeners.click();},track:(...args)=>window.AllwainAnalytics.track(...args)
  };
}
it("static site requires verified ID and an explicit test/live environment",async()=>{
  for(const config of [{measurementId:"G-Z75ZE156W1"},{measurementId:"private@example.com",staticBuildEnvironment:"test"},{measurementId:"G-Z75ZE156W1",staticBuildEnvironment:"production"}]){
    const f=await fixture({config});assert.equal(f.scripts.length,0);assert.equal(f.track("tester_google_login_completed",{}),false);
  }
});
it("static live and preview test events have marketing separation and canonical anonymous page parameters",async()=>{
  for(const env of ["test","live"]){
    const f=await fixture({config:{measurementId:"G-Z75ZE156W1",staticBuildEnvironment:env}});
    assert.equal(f.scripts.length,1);assert.equal(f.track("web_screen_view",{screen:"comprador",locale:"es"}),true);
    const config=f.calls().find(item=>item[0]==="config")[2];assert.equal(config.send_page_view,false);assert.equal(config.allow_google_signals,false);
    for(const event of f.events()){
      const p=event[2];assert.equal(p.app_surface,"marketing");assert.equal(p.source_platform,"web");assert.equal(p.app_platform,"web");
      assert.equal(p.build_environment,env);assert.equal(p.payment_environment,"unknown");assert.equal(p.debug_mode,env==="test"?true:undefined);
      assert.equal(p.page_location,"https://allwain.es/");assert.equal(p.page_referrer,"");
    }
    assert.ok(!JSON.stringify(f.calls()).includes("private"));
  }
});
it("static whitelist preserves supported actions and discards input, URLs, IDs, release and platform spoofing",async()=>{
  const f=await fixture();
  assert.equal(f.track("tester_app_link_opened",{step:"capture",destination:"https://private@example.com/?id=private",release:"private",program:"private",user_id:"private",email:"private@example.com",latitude:39.1,source_platform:"ios",build_environment:"live"}),true);
  const link=plain(f.events().at(-1)[2]);assert.equal(link.step,"capture");assert.equal(link.source_platform,"web");assert.equal(link.build_environment,"test");
  assert.ok(!JSON.stringify(link).includes("private"));assert.equal(link.destination,undefined);assert.equal(link.release,undefined);assert.equal(link.program,undefined);
  assert.equal(f.track("tester_app_action_saved",{step:"buy",action:2,completed:true,platform:"ios",locale:"en"}),true);
  const action=f.events().at(-1)[2];assert.equal(action.tested_platform,"ios");assert.equal(action.action,2);assert.equal(action.completed,true);
  assert.equal(f.track("prototype_interaction",{screen:"buyer",action:"compare_offer",variant:"delivery"}),true);
  assert.equal(f.track("prototype_interaction",{screen:"buyer",action:"compare_offer",variant:"private"}),true);assert.equal(f.events().at(-1)[2].variant,undefined);
  assert.equal(f.track("unknown_private",{screen:"comprador"}),false);
  assert.equal(f.track("web_screen_view",{screen:"private@example.com"}),false);
  assert.equal(f.track("tester_app_action_saved",{step:"buy",action:999,completed:true,platform:"ios"}),false);
  assert.equal(f.track("tester_app_incident_submitted",{category:"private",platform:"ios"}),false);
});
it("unknown/denied static consent never loads a script and unknown presents a real explicit choice",async()=>{
  for(const status of [null,"denied"]){
    const f=await fixture({status});assert.equal(f.scripts.length,0);assert.equal(f.track("tester_google_login_completed",{}),false);
    if(status===null){f.choose(true);assert.equal(f.scripts.length,1);assert.equal(f.track("tester_google_login_completed",{}),true);}
  }
});
it("static refusal purges pending events/cookies and cross-tab grant cannot silently enable collection",async()=>{
  const f=await fixture();f.track("tester_google_login_completed",{});
  f.consent("denied");assert.equal(f.window["ga-disable-G-Z75ZE156W1"],true);assert.equal(f.events().length,0);
  assert.ok(f.cookies.some(cookie=>cookie.includes("path=/app")));assert.ok(f.cookies.every(cookie=>!cookie.startsWith("essential=")));
  assert.equal(f.track("tester_google_login_completed",{}),false);
  f.consent("granted");assert.equal(f.track("tester_google_login_completed",{}),false);
  f.preferences();f.choose(true);assert.equal(f.track("tester_google_login_completed",{}),true);
  assert.equal(f.calls().filter(item=>item[0]==="consent").at(-1)[2].analytics_storage,"granted");
});
it("static persistence and SDK errors remain optional and a failed grant never loads analytics",async()=>{
  const f=await fixture({status:null});f.writeFailure(true);f.choose(true);assert.equal(f.scripts.length,0);assert.equal(f.track("tester_google_login_completed",{}),false);
  const g=await fixture();g.readFailure(true);assert.equal(g.track("tester_google_login_completed",{}),false);
  g.readFailure(false);g.window.gtag=()=>{throw new Error("private@example.com");};
  assert.equal(g.track("tester_google_login_completed",{}),false);g.consent("denied");
  assert.equal(g.window["ga-disable-G-Z75ZE156W1"],true);assert.ok(g.cookies.length>0);
});
it("every current static instrumentation event has a fixed safe semantic schema",async()=>{
  const f=await fixture();
  const samples={
    tester_survey_opened:{authenticated:true},tester_private_room_opened:{source:"public_web"},prototype_interaction:{screen:"seller",action:"select_request",variant:"oranges"},
    tester_app_action_toggled:{step:"capture",action:1,completed:false,platform:"android"},tester_app_action_saved:{step:"capture",action:1,completed:true,platform:"android"},
    tester_incident_route_selected:{step:"delivery"},tester_app_link_opened:{step:"buy"},tester_academy_opened:{preferred_role:"seller"},
    tester_app_step_confirmed:{step:"profile",platform:"web"},tester_app_incident_submitted:{category:"functionality",platform:"ios"},tester_google_login_completed:{},tester_platform_selected:{platform:"unknown"}
  };
  for(const [name,payload] of Object.entries(samples))assert.equal(f.track(name,payload),true,name);
});
