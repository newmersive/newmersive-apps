const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(relative, replacements = {}, cache = new Map()) {
  const source = path.resolve(__dirname, relative);
  if (cache.has(source)) return cache.get(source).exports;
  const compiled = new Module(source, module);
  compiled.filename = source; compiled.paths = Module._nodeModulePaths(path.dirname(source));
  cache.set(source, compiled);
  const originalRequire = compiled.require.bind(compiled);
  compiled.require = name => {
    if (Object.hasOwn(replacements, name)) return replacements[name];
    if (name.startsWith(".")) {
      const candidate = path.resolve(path.dirname(source), name + ".ts");
      if (fs.existsSync(candidate)) return load(candidate, replacements, cache);
    }
    return originalRequire(name);
  };
  compiled._compile(ts.transpileModule(fs.readFileSync(source, "utf8"), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}
  }).outputText, source);
  return compiled.exports;
}
function configLoad(relative, replacements = {}, environment) {
  const keys = ["EXPO_PUBLIC_GA_MEASUREMENT_ID", "EXPO_PUBLIC_ANALYTICS_BUILD_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) {
    if (environment && Object.hasOwn(environment, key)) process.env[key] = environment[key];
    else delete process.env[key];
  }
  try { return load(relative, replacements); }
  finally { for (const key of keys) { if(previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
}
function nativeFixture(options = {}) {
  const calls = []; let imports = 0;
  const sdk = {
    getAnalytics() { imports++; if(options.importError) throw new Error("private@example.com"); return {}; },
    async setConsent(_, value) { calls.push(["consent", value]); await options.setConsent?.(value); },
    async setAnalyticsCollectionEnabled(_, value) { calls.push(["enabled", value]); await options.setEnabled?.(value); },
    async resetAnalyticsData() { calls.push(["reset"]); },
    async setUserId(_, value) { calls.push(["user", value]); },
    async setDefaultEventParameters(_, value) { calls.push(["defaults", value]); },
    async logEvent(_, name, params) { calls.push(["event", name, params]); await options.logEvent?.(name, params); },
    async logScreenView(_, params) { calls.push(["screen", params]); },
    async setUserProperties(_, params) { calls.push(["context", params]); },
  };
  const runtime = configLoad("../src/analytics/analyticsRuntime.native.ts", {"@react-native-firebase/analytics":sdk,"react-native":{Platform:{OS:options.platform || "android"}}}, options.environment);
  return {runtime,calls,imports:()=>imports};
}
async function browserFixture(run, environment) {
  const previous = {window:globalThis.window,document:globalThis.document};
  const scripts = [], removedCookies = [], elements = new Map();
  let cookies = "_ga=private; _ga_Z75ZE156W1=private; essential=keep";
  const document = {
    head:{appendChild(script) { scripts.push(script); elements.set(script.id,script); }},
    getElementById:id=>elements.get(id) || null,
    createElement:()=>({}),
    get cookie() { return cookies; }, set cookie(value) { removedCookies.push(value); }
  };
  const window = {document,location:{origin:"https://allwain.es",hostname:"allwain.es",href:"https://allwain.es/app/scan-result/?requestId=private&email=private@example.com#private"}};
  globalThis.window = window; globalThis.document = document;
  const runtime = configLoad("../src/analytics/analyticsRuntime.web.ts",{},environment);
  try { return await run({runtime,window,scripts,removedCookies}); }
  finally { if(previous.window === undefined) delete globalThis.window; else globalThis.window=previous.window; if(previous.document === undefined) delete globalThis.document; else globalThis.document=previous.document; }
}
function deferred() { let resolve; const promise = new Promise(done=>resolve=done); return {promise,resolve}; }
module.exports={load,configLoad,nativeFixture,browserFixture,deferred};
