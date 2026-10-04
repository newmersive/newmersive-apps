// A NOA-only namespace in the existing JSONB research table. No schema migration.
export const CONFIG_VERSION="noa-ideal-config-v1";
export const CONFIG_PREFIX=CONFIG_VERSION+":";
export const CONFIG_CATALOG="noa-concept-2026-09-19-v1";
export const CONFIG_CONSENT="noa-configuration-research-2026-09-19-v1";
const fields={color:["carbon","blue","silver","gold","ice","rose"],finish:["matte","satin","metal"],optics:["standard","low-light","thermal"],sector:["Público general","Profesional","Defensa"],priority:["unsure","image","comfort","battery","privacy"]};
const interests=["close","digital-zoom","telephoto","rear","panorama","low-light","nir","thermal","tof","stereo","other"];
type Selection={color:string;finish:string;optics:string;padding:boolean;sector:string;interests:string[];priority:string};
export type ConfigurationInput={schemaVersion:string;catalogVersion:string;requestId:string;locale:string;selection:Selection;consent:true;consentVersion:string};
export function readConfiguration(input:unknown):ConfigurationInput|null{
 if(!input||typeof input!=="object"||Array.isArray(input))return null;
 const b=input as Record<string,unknown>;
 if(Object.keys(b).some(k=>!["schemaVersion","catalogVersion","requestId","locale","selection","consent","consentVersion"].includes(k))||b.schemaVersion!==CONFIG_VERSION||b.catalogVersion!==CONFIG_CATALOG||b.consent!==true||b.consentVersion!==CONFIG_CONSENT)return null;
 if(typeof b.requestId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b.requestId)||!["es","en","fr","it","zh","ar","ja"].includes(String(b.locale)))return null;
 if(!b.selection||typeof b.selection!=="object"||Array.isArray(b.selection))return null;
 const s=b.selection as Record<string,unknown>;
 if(Object.keys(s).some(k=>![...Object.keys(fields),"padding","interests"].includes(k))||typeof s.padding!=="boolean")return null;
 for(const key of Object.keys(fields) as Array<keyof typeof fields>)if(typeof s[key]!=="string"||!fields[key].includes(s[key] as string))return null;
 if(!Array.isArray(s.interests)||s.interests.length<1||s.interests.length>interests.length||new Set(s.interests).size!==s.interests.length||s.interests.some(i=>typeof i!=="string"||!interests.includes(i)))return null;
 return {schemaVersion:CONFIG_VERSION,catalogVersion:CONFIG_CATALOG,requestId:b.requestId,locale:String(b.locale),selection:{color:String(s.color),finish:String(s.finish),optics:String(s.optics),padding:s.padding,sector:String(s.sector),interests:s.interests as string[],priority:String(s.priority)},consent:true,consentVersion:CONFIG_CONSENT};
}
export function configurationRecord(input:ConfigurationInput){return {kind:"ideal_configuration",schemaVersion:CONFIG_VERSION,catalogVersion:CONFIG_CATALOG,selection:input.selection,conceptual:true};}
