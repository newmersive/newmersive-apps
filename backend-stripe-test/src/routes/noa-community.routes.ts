import {Router, Request, Response} from "express";
import {AuthRequest, authRequired} from "../middleware/auth.middleware";
import {getPrisma} from "../db/prisma";
import {ENV} from "../config/env";
import authRoutes from "./auth.routes";
import {getNoaSupporterReadiness} from "../services/noa-supporter-readiness";
import {getNoaGoogleClientId,NOA_ACCOUNT_CONSENT_VERSION} from "../services/noa-auth-policy";
import {readConfiguration,configurationRecord,CONFIG_PREFIX,CONFIG_VERSION,CONFIG_CATALOG,CONFIG_CONSENT} from "../services/noa-ideal-configuration";

const router=Router();
export const NOA_SURVEY_VERSION="noa-product-v1";
export const NOA_SURVEY_CONSENT=NOA_ACCOUNT_CONSENT_VERSION;
const locales=new Set(["es","en","fr","it","zh","ar","ja"]);
export const NOA_ANSWERS={
  use:["outdoors","cycling","professional","security","everyday","other"],
  priority:["image","comfort","battery","privacy"],
  duration:["under30","30to120","over120","unsure"],
  features:["zoom","rear","panorama","lowlight","thermal"],
} as const;
const enabled=()=>process.env.NOA_COMMUNITY_ENABLED==="true" && ENV.STORAGE_DRIVER==="postgres";
function originAllowed(req:Request) {
  const origin=req.get("origin");
  return origin==="https://newmersive.es" || origin==="https://www.newmersive.es" ||
    (ENV.NODE_ENV!=="production" && origin==="http://localhost:5173");
}
router.use((req,res,next)=>{
  res.setHeader("Cache-Control","no-store");
  if(!["GET","HEAD"].includes(req.method) && (!originAllowed(req) || !req.is("application/json"))) {
    res.status(403).json({error:"NOA_ORIGIN_REQUIRED"});return;
  }
  next();
});
router.get("/config",(_req,res)=>{
  const googleClientId=enabled()?getNoaGoogleClientId():"";
  res.json({enabled:enabled(),googleClientId,surveyVersion:NOA_SURVEY_VERSION,consentVersion:NOA_SURVEY_CONSENT,configurationEnabled:enabled(),configurationVersion:CONFIG_VERSION,configurationCatalog:CONFIG_CATALOG,configurationConsent:CONFIG_CONSENT,paymentsEnabled:false,supporter:{kind:"project_contribution",amount:12000,currency:"eur",checkoutEnabled:false,includesProduct:false,blockers:["NOA_CONTRIBUTION_TERMS_REQUIRED","NOA_LIVE_CHECKOUT_NOT_ENABLED"]}});
});
router.use((_req,res,next)=>{if(!enabled())return void res.status(503).json({error:"NOA_COMMUNITY_UNAVAILABLE"});next();});

// Reuse the ecosystem's identity service, password rules, token rotation and revocation.
// No new password store, OAuth verifier or client-side identity authority.
router.use("/auth",(req,res,next)=>{
  if(req.method!=="POST" || !["/register","/login","/google","/refresh","/logout"].includes(req.path)) {
    res.status(404).json({error:"NOT_FOUND"});return;
  }
  const input=req.body||{};
  if(req.path==="/google"&&!getNoaGoogleClientId())return void res.status(503).json({error:"GOOGLE_AUTH_NOT_CONFIGURED"});
  if(["/register","/login","/google"].includes(req.path) && (input.accountConsent!==true || input.accountConsentVersion!==NOA_SURVEY_CONSENT)) {
    res.status(400).json({error:"NOA_ACCOUNT_CONSENT_REQUIRED"});return;
  }
  // Never accept role elevation, sponsor codes or a caller-selected source application.
  req.body={name:input.name,email:input.email,password:input.password,idToken:input.idToken,locale:input.locale,sourceApp:"newmersive",role:"user",accountConsent:input.accountConsent===true,accountConsentVersion:input.accountConsentVersion};
  next();
},authRoutes);

export function validateNoaSurvey(input:unknown) {
  if(!input || typeof input!=="object" || Array.isArray(input)) return false;
  const body=input as Record<string,unknown>;
  if(Object.keys(body).some(key=>!["schemaVersion","locale","answers","consent","consentVersion"].includes(key)))return false;
  if(body.schemaVersion!==NOA_SURVEY_VERSION || !locales.has(String(body.locale)) || body.consent!==true || body.consentVersion!==NOA_SURVEY_CONSENT)return false;
  const a=body.answers as Record<string,unknown>;
  if(!a || typeof a!=="object" || Array.isArray(a) || Object.keys(a).some(key=>!["use","priority","duration","features","comment"].includes(key)))return false;
  for(const key of ["use","priority","duration"] as const)if(!(NOA_ANSWERS[key] as readonly unknown[]).includes(a[key]))return false;
  return Array.isArray(a.features) && a.features.length>=1 && a.features.length<=3 && new Set(a.features).size===a.features.length &&
    a.features.every(value=>(NOA_ANSWERS.features as readonly unknown[]).includes(value)) && typeof a.comment==="string" && a.comment.length<=1000;
}
router.get("/survey",authRequired,async(req:AuthRequest,res:Response)=>{
  if(!req.user)return void res.status(401).json({error:"UNAUTHORIZED"});
  try {
    const rows=await getPrisma().$queryRaw<Array<{answers:unknown;locale:string;updatedAt:Date}>>`
      SELECT "answers","locale","updatedAt" FROM "NoaProductSurvey"
      WHERE "userId"=${req.user.id} AND "schemaVersion"=${NOA_SURVEY_VERSION}`;
    res.json({survey:rows[0]??null});
  }catch{res.status(503).json({error:"NOA_SURVEY_UNAVAILABLE"});}
});
router.put("/survey",authRequired,async(req:AuthRequest,res:Response)=>{
  if(!req.user)return void res.status(401).json({error:"UNAUTHORIZED"});
  if(!validateNoaSurvey(req.body))return void res.status(400).json({error:"INVALID_NOA_SURVEY"});
  try {
    const answers=JSON.stringify(req.body.answers);
    await getPrisma().$executeRaw`
      INSERT INTO "NoaProductSurvey" ("userId","schemaVersion","locale","answers","consentVersion","consentedAt","updatedAt")
      VALUES (${req.user.id},${NOA_SURVEY_VERSION},${req.body.locale},${answers}::jsonb,${NOA_SURVEY_CONSENT},NOW(),NOW())
      ON CONFLICT ("userId","schemaVersion") DO UPDATE SET "locale"=EXCLUDED."locale", "answers"=EXCLUDED."answers",
      "consentVersion"=EXCLUDED."consentVersion", "consentedAt"=EXCLUDED."consentedAt", "updatedAt"=NOW()`;
    res.json({saved:true,schemaVersion:NOA_SURVEY_VERSION});
  }catch{res.status(503).json({error:"NOA_SURVEY_UNAVAILABLE"});}
});
router.delete("/survey",authRequired,async(req:AuthRequest,res:Response)=>{
  if(!req.user)return void res.status(401).json({error:"UNAUTHORIZED"});
  try {
    await getPrisma().$executeRaw`DELETE FROM "NoaProductSurvey" WHERE "userId"=${req.user.id} AND "schemaVersion"=${NOA_SURVEY_VERSION}`;
    res.json({deleted:true});
  }catch{res.status(503).json({error:"NOA_SURVEY_UNAVAILABLE"});}
});
type ConfigurationRow={schemaVersion:string;answers:ReturnType<typeof configurationRecord>;locale:string;updatedAt:Date;consentVersion:string};
const snapshot=(row:ConfigurationRow)=>({id:row.schemaVersion.slice(CONFIG_PREFIX.length),selection:row.answers.selection,updatedAt:row.updatedAt,schemaVersion:row.answers.schemaVersion,catalogVersion:row.answers.catalogVersion});
router.get("/configuration",authRequired,async(req:AuthRequest,res:Response)=>{
 if(!req.user)return void res.status(401).json({error:"UNAUTHORIZED"});
 try{
  const prefix=CONFIG_PREFIX+"%";
  const rows=await getPrisma().$queryRaw<ConfigurationRow[]>`SELECT "schemaVersion","answers","locale","updatedAt","consentVersion" FROM "NoaProductSurvey" WHERE "userId"=${req.user.id} AND "schemaVersion" LIKE ${prefix} ORDER BY "updatedAt" DESC,"schemaVersion" DESC LIMIT 1`;
  res.json({configuration:rows[0]?snapshot(rows[0]):null});
 }catch{res.status(503).json({error:"NOA_CONFIGURATION_UNAVAILABLE"});}
});
router.post("/configuration",authRequired,async(req:AuthRequest,res:Response)=>{
 if(!req.user)return void res.status(401).json({error:"UNAUTHORIZED"});
 const input=readConfiguration(req.body);
 if(!input)return void res.status(400).json({error:"INVALID_NOA_CONFIGURATION"});
 const version=CONFIG_PREFIX+input.requestId,record=configurationRecord(input),encoded=JSON.stringify(record);
 try{
  const db=getPrisma(),prefix=CONFIG_PREFIX+"%";
  // A fixed per-user ceiling bounds research storage; duplicate retries still work.
  const count=await db.$queryRaw<Array<{total:bigint}>>`SELECT COUNT(*) AS "total" FROM "NoaProductSurvey" WHERE "userId"=${req.user.id} AND "schemaVersion" LIKE ${prefix}`;
  if(Number(count[0]?.total??0)<200)await db.$executeRaw`INSERT INTO "NoaProductSurvey" ("userId","schemaVersion","locale","answers","consentVersion","consentedAt","updatedAt") VALUES (${req.user.id},${version},${input.locale},${encoded}::jsonb,${CONFIG_CONSENT},NOW(),NOW()) ON CONFLICT ("userId","schemaVersion") DO NOTHING`;
  const rows=await db.$queryRaw<ConfigurationRow[]>`SELECT "schemaVersion","answers","locale","updatedAt","consentVersion" FROM "NoaProductSurvey" WHERE "userId"=${req.user.id} AND "schemaVersion"=${version}`;
  if(!rows[0])return void res.status(429).json({error:"CONFIGURATION_LIMIT_REACHED"});
  // JSONB may reorder keys; compare normalized values, not serialized key order.
  const stored=readConfiguration({...input,selection:rows[0].answers.selection});
  if(!stored||JSON.stringify(stored.selection)!==JSON.stringify(input.selection)||rows[0].locale!==input.locale||rows[0].consentVersion!==CONFIG_CONSENT)return void res.status(409).json({error:"CONFIGURATION_REQUEST_CONFLICT"});
  res.json({saved:true,configuration:snapshot(rows[0])});
 }catch{res.status(503).json({error:"NOA_CONFIGURATION_UNAVAILABLE"});}
});
export default router;
