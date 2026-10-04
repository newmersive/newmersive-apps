import {ENV} from "../config/env";
import {getPrisma} from "../db/prisma";

export const NOA_ACCOUNT_CONSENT_VERSION="noa-survey-2026-09-13-v1";
export type NoaAccountConsent={version:string;locale:string};
const locales=new Set(["es","en","fr","it","zh","ar","ja"]);

/** A public client ID, never a client secret. Fail closed outside the shared allowlist. */
export function getNoaGoogleClientId(){
 const candidate=String(process.env.NOA_GOOGLE_CLIENT_ID||"").trim();
 return candidate&&ENV.GOOGLE_AUTH_CLIENT_IDS.includes(candidate)?candidate:"";
}

/** Called before issuing a NOA registration/Google session, with server-derived user ID. */
export async function recordNoaAccountConsent(userId:string,consent:NoaAccountConsent){
 if(!userId||consent.version!==NOA_ACCOUNT_CONSENT_VERSION||!locales.has(consent.locale)||ENV.STORAGE_DRIVER!=="postgres")throw Error("NOA_ACCOUNT_CONSENT_UNAVAILABLE");
 try{
  await getPrisma().$executeRaw`
   INSERT INTO "NoaAccountConsent" ("userId","version","locale","acceptedAt")
   VALUES (${userId},${consent.version},${consent.locale},NOW())
   ON CONFLICT ("userId","version") DO NOTHING`;
 }catch{throw Error("NOA_ACCOUNT_CONSENT_UNAVAILABLE");}
}
