/** Public-site preferences only. Never clear authentication, workspace or demo storage. */
export const CONSENT_KEY = 'v4-public-consent-v1';
export const SIMULATION_KEY = 'v4-public-simulation-v1';
export const CONSENT_VERSION = 1;
export const CONSENT_DURATION_MS = 180 * 24 * 60 * 60 * 1000;
export type CookieConsent = {version:1;necessary:true;preferences:boolean;analytics:false;marketing:false;updatedAt:string;expiresAt:string};
export type SimulationPreferences = {plan:'essencial'|'sdr'|'performance'|'enterprise';packages:number};
export function parseConsent(value:string|null,now=Date.now()):CookieConsent|null{
 try{
  const record=JSON.parse(value||'null');
  if(!record||record.version!==CONSENT_VERSION||record.necessary!==true||typeof record.preferences!=='boolean'||record.analytics!==false||record.marketing!==false)return null;
  if(typeof record.updatedAt!=='string'||typeof record.expiresAt!=='string')return null;
  const updated=Date.parse(record.updatedAt),expires=Date.parse(record.expiresAt);
  if(!Number.isFinite(updated)||!Number.isFinite(expires)||updated>now||expires<=now||expires<=updated||expires-updated>CONSENT_DURATION_MS)return null;
  return record;
 }catch{return null;}
}
export function readConsent():CookieConsent|null{
 try{return parseConsent(localStorage.getItem(CONSENT_KEY));}catch{return null;}
}
export function createConsent(preferences:boolean):CookieConsent{
 const now=Date.now();
 return {version:1,necessary:true,preferences,analytics:false,marketing:false,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+CONSENT_DURATION_MS).toISOString()};
}
export function clearOptionalPreferences(){try{localStorage.removeItem(SIMULATION_KEY);}catch{/* Storage may be unavailable. */}}
export function readSimulationPreferences():SimulationPreferences|null{
 if(!readConsent()?.preferences)return null;
 try{
  const value=JSON.parse(localStorage.getItem(SIMULATION_KEY)||'null');
  if(!value||!['essencial','sdr','performance','enterprise'].includes(value.plan)||!Number.isInteger(value.packages)||value.packages<0||value.packages>10)return null;
  return {...value,packages:value.plan==='sdr'||value.plan==='performance'?value.packages:0};
 }catch{return null;}
}
export function saveSimulationPreferences(value:SimulationPreferences){
 if(!readConsent()?.preferences)return;
 try{localStorage.setItem(SIMULATION_KEY,JSON.stringify(value));}catch{/* The calculator works without persistence. */}
}
