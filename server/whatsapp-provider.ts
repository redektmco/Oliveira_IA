import {evolutionConfig} from './evolution.js';
export class DeliveryError extends Error{constructor(public code:string,public disposition:'retry'|'failed'|'uncertain'){super(code);}}
export function evolutionUrl(path:string){const c=evolutionConfig();const u=new URL(c.endpoint);const [route,query]=path.split('?');u.pathname=u.pathname.replace(/\/instance\/connectionState\/[^/]+$/,route.replace('{instance}',encodeURIComponent(c.instance)));u.search=query||'';return u.href;}
export async function evolutionRequest(path:string,method='GET',body?:unknown){
 const c=evolutionConfig();return fetch(evolutionUrl(path),{method,headers:{apikey:c.token,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
}
export async function ensureWhatsAppConnected(){
 try{const r=await evolutionRequest('/instance/connectionState/{instance}');const body=await r.json();if(!r.ok||body?.instance?.state!=='open')throw new DeliveryError('not_connected','retry');}catch(e){if(e instanceof DeliveryError)throw e;throw new DeliveryError('connection_unavailable','retry');}
}
export async function sendWhatsAppText(jid:string,text:string):Promise<string>{
 if(!/^\d{8,15}@s\.whatsapp\.net$/.test(jid)||!text.trim()||text.length>16000)throw new DeliveryError('invalid_message','failed');
 let response:Response;
 try{response=await evolutionRequest('/message/sendText/{instance}','POST',{number:jid.split('@')[0],text,linkPreview:false});}catch{throw new DeliveryError('delivery_unknown','uncertain');}
 if(response.status===429)throw new DeliveryError('provider_rate_limit','retry');
 if(response.status>=500)throw new DeliveryError('delivery_unknown','uncertain');
 if(!response.ok)throw new DeliveryError([401,403].includes(response.status)?'provider_credentials':'provider_rejected','failed');
 const body=await response.json().catch(()=>null);const id=body?.key?.id;
 if(typeof id!=='string'||!id||id.length>200)throw new DeliveryError('delivery_unknown','uncertain');
 return id;
}
